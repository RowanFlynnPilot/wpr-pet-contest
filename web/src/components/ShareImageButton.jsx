import { lazy, Suspense, useMemo, useRef, useState } from 'react'
import { useContest } from './ContestContext.jsx'
import { useBracket, useContestTotals, useRoundTotals } from '../lib/data.js'
import { milestone } from '../lib/milestones.js'
import { entryStates } from '../lib/bracketState.js'
import { Camera } from './Icons.jsx'

// The image maker (canvas drawing, QR code) loads only when an owner asks for
// it; hovering or focusing the button starts the download early. The contest
// stores are read here and handed over as plain values: a lazy chunk that
// imports them makes the bundler split React out of the main chunk.
const load = () => import('./ShareImagePanel.jsx')
const ShareImagePanel = lazy(load)

// Mounted only while the panel is open, so a closed button polls nothing.
function Live({ entry, onClose }) {
  const c = useContest()
  // The same stores the pet page already polls: no extra requests.
  const liveRound = (c.phase === 'voting' || c.phase === 'counting') && c.round ? c.round.id : null
  const totals = useRoundTotals(liveRound)
  const contestTotals = useContestTotals(c.rounds)
  const inBracket = c.rounds.some((r) => r.kind === 'bracket')
  const bracket = useBracket(inBracket ? c.rounds : [], { openRoundId: c.phase === 'voting' ? c.round?.id : null })
  const state = useMemo(
    () => (inBracket ? entryStates([entry], c.rounds, bracket.matchups, c.bracketSize).get(entry.id) || null : null),
    [inBracket, entry, c.rounds, bracket.matchups, c.bracketSize],
  )
  const ready = c.roundsLoaded && !(inBracket && bracket.loading) && !(liveRound && totals.loading)
  return (
    <ShareImagePanel
      entry={entry}
      onClose={onClose}
      ready={ready}
      contest={c.contest}
      phase={c.phase}
      round={c.round}
      nextRound={c.nextRound}
      rounds={c.rounds}
      bracketSize={c.bracketSize}
      state={state}
      votes={liveRound ? totals.totals.get(entry.id)?.votes || 0 : null}
      club={milestone(contestTotals.get(entry.id)).earned}
      now={c.now}
    />
  )
}

export default function ShareImageButton({ entry }) {
  const [open, setOpen] = useState(false)
  const button = useRef(null)
  const close = () => {
    setOpen(false)
    button.current?.focus()
  }
  return (
    <>
      <button
        ref={button}
        type="button"
        className={`share-btn${open ? ' primary' : ''}`}
        onPointerEnter={load}
        onFocus={load}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={open ? `share-image-${entry.id}` : undefined}
      >
        <Camera size={18} /> Make a share image
      </button>
      {open && (
        <Suspense fallback={<span role="status" className="sr-only">Opening the image maker…</span>}>
          <Live entry={entry} onClose={close} />
        </Suspense>
      )}
    </>
  )
}
