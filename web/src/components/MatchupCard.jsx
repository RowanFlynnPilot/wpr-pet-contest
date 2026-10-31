import { fmtInt } from '../lib/format.js'
import { isUpset, matchupStanding } from '../lib/rank.js'
import { Check } from './Icons.jsx'
import { Lamp } from './Scoreboard.jsx'
import PetPhoto from './PetPhoto.jsx'
import VoteButton from './VoteButton.jsx'

// A side that names an entry the public cannot see was disqualified or withdrawn (every
// approved entry is loaded). "TBD" is only for a slot not yet decided.
const sideName = (side) => side.entry?.pet_name || (side.id ? 'Removed' : 'TBD')

function Side({ side, cls, share, showVotes, seedOverride }) {
  const e = side.entry
  return (
    <div className={`matchup-side ${cls}`}>
      <span className="matchup-seed" aria-label={`Seed ${seedOverride ?? side.seed ?? ''}`}>
        {seedOverride ?? side.seed ?? '–'}
      </span>
      <PetPhoto entry={e} width={120} square alt="" />
      <span className="matchup-name">
        {e ? <a href={`#/pet/${e.id}`}>{e.pet_name}</a> : sideName(side)}
        {cls.includes('won') && (
          <>
            <Check size={14} />
            <span className="sr-only"> (won)</span>
          </>
        )}
      </span>
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
  const names = `${sideName(s.a)} versus ${sideName(s.b)}`
  const walkover = !decided && s.a.id && s.b.id && Boolean(s.a.entry) !== Boolean(s.b.entry)
  // The worse seed ahead (or through): the lamp lights on the card.
  const upset = (live || decided) && s.a.entry && s.b.entry && isUpset(s)
  const remaining = s.a.entry || s.b.entry
  return (
    <div className={`matchup${live ? ' is-live' : ''}${upset ? ' is-upset' : ''}`} role="group" aria-label={names}>
      {upset && (
        <div className="matchup-head">
          <Lamp on sr={decided ? 'Upset: the lower seed won.' : 'Upset: the lower seed leads.'}>
            {decided ? 'Upset' : 'Upset alert'}
          </Lamp>
        </div>
      )}
      <Side side={s.a} cls={cls('a')} share={share(s.a.votes)} showVotes={live || decided} />
      <Side side={s.b} cls={cls('b')} share={share(s.b.votes)} showVotes={live || decided} />
      {walkover && (
        <p className="matchup-foot small muted" style={{ margin: 0 }}>
          {remaining.pet_name} advances: its opponent is out of the contest.
        </p>
      )}
      {live && s.a.entry && s.b.entry && (
        <div className="matchup-foot">
          <VoteButton entry={s.a.entry} round={round} className="btn btn-ghost btn-sm">
            <span className="btn-clip">Vote {s.a.entry.pet_name}</span>
          </VoteButton>
          <VoteButton entry={s.b.entry} round={round} className="btn btn-ghost btn-sm">
            <span className="btn-clip">Vote {s.b.entry.pet_name}</span>
          </VoteButton>
        </div>
      )}
    </div>
  )
}
