import { useMemo, useState } from 'react'
import { SPONSORS } from '../config.js'
import { useContest } from '../components/ContestContext.jsx'
import MatchupCard from '../components/MatchupCard.jsx'
import Sponsor from '../components/Sponsor.jsx'
import Countdown from '../components/Countdown.jsx'
import ActivityTicker from '../components/ActivityTicker.jsx'
import { useBracket, useEntries, useRoundTotals } from '../lib/data.js'
import { apDate, apDateTime, apTime, period } from '../lib/format.js'
import { useDocumentTitle, useMediaQuery } from '../lib/hooks.js'
import { rankOpenRound } from '../lib/rank.js'
import { bracketSkeleton, projectedPairings, roundLabel } from '../lib/rounds.js'
import { Champion } from './Results.jsx'

function when(col, phase) {
  const r = col.round
  if (!r) return 'Still to come'
  if (r.status === 'open') return phase === 'voting' ? `Voting now · closes ${apTime(r.closes_at)} ${apDate(r.closes_at, { weekday: false })}` : 'Voting closed'
  if (r.status === 'pending') return `Opens ${apDate(r.opens_at, { weekday: false })}`
  return 'Final'
}

export function BracketBoard({ c, byId, projected = null }) {
  const wide = useMediaQuery('(min-width: 1000px)')
  const openId = c.phase === 'voting' && c.round?.kind === 'bracket' ? c.round.id : null
  const { matchups, totalsByRound } = useBracket(c.rounds, { openRoundId: openId })
  const cols = useMemo(() => bracketSkeleton(c.bracketSize, c.rounds, matchups), [c.bracketSize, c.rounds, matchups])
  const defaultSeq = (cols.find((col) => col.round?.status === 'open') || [...cols].reverse().find((col) => col.round) || cols[0])?.seq
  const [pick, setPick] = useState(null)
  const selected = pick ?? defaultSeq

  const renderCol = (col) => (
    <div className="bracket-col" key={col.seq} role={wide ? undefined : 'tabpanel'} id={`round-panel-${col.seq}`} aria-labelledby={wide ? undefined : `round-tab-${col.seq}`}>
      <div className="bracket-col-head">
        <span>{col.label}</span>
        <span className="when">{projected && col.seq === 2 ? 'If voting ended now' : when(col, c.phase)}</span>
      </div>
      <div className="bracket-col-body">
        {col.slots.map((m, slot) =>
          projected && col.seq === 2 ? (
            <MatchupCard key={slot} projected={projected[slot]} byId={byId} />
          ) : (
            <MatchupCard
              key={m?.id || slot}
              matchup={m}
              totals={m ? totalsByRound.get(m.round_id) : null}
              byId={byId}
              round={col.round}
              live={Boolean(m) && col.round?.id === openId}
            />
          ),
        )}
      </div>
    </div>
  )

  if (wide) {
    return (
      <div className="bracket desktop" style={{ '--cols': cols.length }}>
        {cols.map(renderCol)}
      </div>
    )
  }
  return (
    <>
      <div className="round-tabs" role="tablist" aria-label="Rounds">
        {cols.map((col) => (
          <button
            key={col.seq}
            type="button"
            role="tab"
            id={`round-tab-${col.seq}`}
            aria-selected={selected === col.seq}
            aria-controls={`round-panel-${col.seq}`}
            className="round-tab"
            onClick={() => setPick(col.seq)}
          >
            {col.label}
            {col.round?.id === openId && <span className="live" aria-label="(live)" />}
          </button>
        ))}
      </div>
      <div className="bracket">{cols.filter((col) => col.seq === selected).map(renderCol)}</div>
    </>
  )
}

export default function Bracket() {
  const c = useContest()
  const { entries, byId } = useEntries(c.contest?.id)
  const round1 = c.rounds.find((r) => r.seq === 1)
  const hasBracket = c.rounds.some((r) => r.kind === 'bracket')
  const projecting = !hasBracket && round1?.status === 'open'
  const r1 = useRoundTotals(projecting ? round1.id : null)
  const projected = useMemo(() => {
    if (!projecting) return null
    const ranked = rankOpenRound(entries, r1.totals).map((r) => r.entry.id)
    const pairs = projectedPairings(ranked, c.bracketSize)
    return pairs.length ? pairs : null
  }, [projecting, entries, r1.totals, c.bracketSize])
  useDocumentTitle('The bracket — Wausau Pilot & Review')

  const liveBracketRound = c.phase === 'voting' && c.round?.kind === 'bracket' ? c.round : null
  const label = c.round ? roundLabel(c.round.seq, c.bracketSize) : null

  let dek
  if (c.phase === 'complete') dek = 'The final bracket.'
  else if (projecting) dek = `${period(`The bracket is set when the Open Round closes ${apDateTime(round1.closes_at)}`)} Here's how it would look if voting ended now.`
  else if (liveBracketRound) dek = `The ${label} is live. Totals started at zero; the pet with more votes at the buzzer moves on. Ties go to the better seed.`
  else if (hasBracket) dek = 'Every head-to-head so far. Totals reset at the start of every round.'
  else dek = `The top ${c.bracketSize} pets from the Open Round make the bracket.`

  return (
    <div className="wrap section" style={{ paddingTop: 24 }}>
      <div className="section-head">
        <div>
          <p className="kicker">{c.contest?.year} bracket</p>
          <h1 style={{ fontSize: 'clamp(30px, 6vw, 46px)' }}>{c.phase === 'complete' ? 'Champion crowned' : projecting ? 'The projected bracket' : 'The bracket'}</h1>
          <p className="dek">{dek}</p>
        </div>
        {liveBracketRound && <Countdown to={liveBracketRound.closes_at} label={`${label} closes in`} />}
      </div>

      {c.phase === 'complete' && (
        <div style={{ marginBottom: 24 }}>
          <Champion c={c} byId={byId} />
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <Sponsor sponsor={SPONSORS.bracket} slot="bracket" full />
      </div>

      {liveBracketRound && (
        <div style={{ marginBottom: 16 }}>
          <ActivityTicker roundId={liveBracketRound.id} byId={byId} />
        </div>
      )}

      {!hasBracket && !projected ? (
        <div className="empty card plain">
          <h3>No bracket yet</h3>
          <p>
            {c.phase === 'submissions' || c.phase === 'coming'
              ? 'Entries are still coming in. The bracket is built from the Open Round results.'
              : 'The bracket appears once the Open Round has enough votes to project it.'}
          </p>
        </div>
      ) : (
        <BracketBoard c={c} byId={byId} projected={projected} />
      )}
    </div>
  )
}
