import { useMemo, useState } from 'react'
import { NEWSROOM, SPONSORS } from '../config.js'
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
import { CrownMark } from '../components/Scoreboard.jsx'
import PetPhoto from '../components/PetPhoto.jsx'

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

  // Slots two at a time, so a poster can join each pair toward the next round.
  const pairs = (slots) => slots.reduce((out, m, i) => (i % 2 ? out[out.length - 1].push([m, i]) : out.push([[m, i]]), out), [])
  const renderSlot = (col, m, slot) =>
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
    )
  const finalCol = cols[cols.length - 1]
  const finalMatch = finalCol?.slots[0]
  const champion = finalMatch?.winner_entry_id ? byId.get(finalMatch.winner_entry_id) : null

  const renderCol = (col) => (
    <div className="bracket-col" key={col.seq} role={wide ? undefined : 'tabpanel'} id={`round-panel-${col.seq}`} aria-labelledby={wide ? undefined : `round-tab-${col.seq}`}>
      <div className="bracket-col-head">
        <span>{col.label}</span>
        <span className="when">{projected && col.seq === 2 ? 'If voting ended now' : when(col, c.phase)}</span>
      </div>
      <div className="bracket-col-body">
        {wide
          ? pairs(col.slots).map((pair, p) => (
              <div className={`bracket-pair${pair.length === 1 ? ' solo' : ''}`} key={p}>
                {pair.map(([m, slot]) => renderSlot(col, m, slot))}
              </div>
            ))
          : col.slots.map((m, slot) => renderSlot(col, m, slot))}
      </div>
    </div>
  )

  if (wide) {
    return (
      // The round of 16 carries the most names, the crown the fewest.
      <div
        className="bracket desktop poster"
        style={{ gridTemplateColumns: `minmax(0, 1.3fr) repeat(${cols.length - 1}, minmax(0, 1fr)) minmax(0, 0.8fr)` }}
      >
        {cols.map(renderCol)}
        <div className="bracket-col bracket-crown">
          <div className="bracket-col-head">
            <span>The crown</span>
          </div>
          <div className="bracket-col-body">
            <div className={`crown-slot${champion ? ' won' : ''}`}>
              <CrownMark size={44} />
              {champion ? (
                <a href={`#/pet/${champion.id}`} className="crown-pet">
                  <span className="sb-face">
                    <PetPhoto entry={champion} width={160} square alt="" />
                  </span>
                  <span className="crown-name">{champion.pet_name}</span>
                </a>
              ) : (
                <span className="crown-wait">Winner takes the crown</span>
              )}
            </div>
          </div>
        </div>
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
  useDocumentTitle(`The bracket — ${NEWSROOM.name}`)

  const liveBracketRound = c.phase === 'voting' && c.round?.kind === 'bracket' ? c.round : null
  const label = c.round ? roundLabel(c.round.seq, c.bracketSize) : null

  let dek
  if (c.phase === 'complete') dek = null
  else if (projecting) dek = `${period(`The bracket is set when the Open Round closes ${apDateTime(round1.closes_at)}`)} Here's how it would look if voting ended now.`
  else if (liveBracketRound) dek = `The ${label} is live. Totals started at zero; the pet with more votes at the buzzer moves on. Ties go to the better seed.`
  else if (hasBracket) dek = 'Every head-to-head so far. Totals reset at the start of every round.'
  else dek = `The top ${c.bracketSize} pets from the Open Round make the bracket.`

  return (
    <div className="wrap section" style={{ paddingTop: 24 }}>
      <div className="section-head">
        <div>
          <h1 style={{ fontSize: 'clamp(30px, 6vw, 46px)' }}>{c.phase === 'complete' ? 'Champion crowned' : projecting ? 'The projected bracket' : 'The bracket'}</h1>
          {dek && <p className="dek">{dek}</p>}
        </div>
        {liveBracketRound && <Countdown to={liveBracketRound.closes_at} label={`${label} closes in`} />}
      </div>

      {c.phase === 'complete' && (
        <div style={{ marginBottom: 24 }}>
          <Champion c={c} byId={byId} />
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <Sponsor sponsor={SPONSORS.bracket} slot="bracket" full line />
      </div>

      {liveBracketRound && (
        <div style={{ marginBottom: 16 }}>
          <ActivityTicker roundId={liveBracketRound.id} byId={byId} />
        </div>
      )}

      {!hasBracket && !projected ? (
        <div className="empty card plain">
          <h2>No bracket yet</h2>
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
