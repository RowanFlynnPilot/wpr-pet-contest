import { fmtInt } from '../lib/format.js'
import { matchupStanding } from '../lib/rank.js'
import PetPhoto from './PetPhoto.jsx'
import VoteButton from './VoteButton.jsx'

function Side({ side, cls, share, showVotes, seedOverride }) {
  const e = side.entry
  return (
    <div className={`matchup-side ${cls}`}>
      <span className="matchup-seed" aria-label={`Seed ${seedOverride ?? side.seed ?? ''}`}>
        {seedOverride ?? side.seed ?? '–'}
      </span>
      <PetPhoto entry={e} width={120} square alt="" />
      <span className="matchup-name">{e ? <a href={`#/pet/${e.id}`}>{e.pet_name}</a> : 'TBD'}</span>
      {showVotes && (
        <span className="matchup-votes">
          {fmtInt(side.votes)}
          <span className="sr-only"> votes</span>
        </span>
      )}
      {showVotes && <span className="bar" style={{ width: `${share}%` }} aria-hidden="true" />}
    </div>
  )
}

// One head-to-head. `live` adds vote buttons; `projected` draws a pairing
// that does not exist yet ("if voting ended now").
export default function MatchupCard({ matchup, totals, byId, round, live = false, projected = null }) {
  if (projected) {
    const a = { entry: byId.get(projected.a.id), votes: 0 }
    const b = { entry: byId.get(projected.b.id), votes: 0 }
    return (
      <div className="matchup">
        <Side side={a} cls="a" seedOverride={projected.a.seed} />
        <Side side={b} cls="b" seedOverride={projected.b.seed} />
      </div>
    )
  }
  if (!matchup) return <div className="matchup matchup-tbd">Winners meet here</div>

  const s = matchupStanding(matchup, totals || new Map(), byId)
  const total = s.a.votes + s.b.votes
  const share = (v) => (total ? Math.max(4, Math.round((v / total) * 100)) : 0)
  const decided = Boolean(s.winner)
  const cls = (key) => {
    if (!decided) return key
    const id = key === 'a' ? s.a.id : s.b.id
    return `${key} ${s.winner === id ? 'won' : 'lost'}`
  }
  const names = `${s.a.entry?.pet_name || 'TBD'} versus ${s.b.entry?.pet_name || 'TBD'}`
  return (
    <div className={`matchup${live ? ' is-live' : ''}`} role="group" aria-label={names}>
      <Side side={s.a} cls={cls('a')} share={share(s.a.votes)} showVotes={live || decided} />
      <Side side={s.b} cls={cls('b')} share={share(s.b.votes)} showVotes={live || decided} />
      {live && s.a.entry && s.b.entry && (
        <div className="matchup-foot">
          <VoteButton entry={s.a.entry} round={round} className="btn btn-primary btn-sm">
            Vote {s.a.entry.pet_name}
          </VoteButton>
          <VoteButton entry={s.b.entry} round={round} className="btn btn-sun btn-sm">
            Vote {s.b.entry.pet_name}
          </VoteButton>
        </div>
      )}
    </div>
  )
}
