import { fmtInt } from '../lib/format.js'
import { isUpset } from '../lib/rank.js'
import PetPhoto from './PetPhoto.jsx'
import { Digits, Lamp } from './Scoreboard.jsx'

const votesWord = (n) => (n === 1 ? 'vote' : 'votes')

// One side of a head-to-head on the board: face, name, seed, count in cells.
// `here` is the pet whose page this is, so it is not a link to itself.
export function Team({ side, lead, here = false }) {
  const e = side.entry
  const name = e?.pet_name || 'Removed'
  const id = (
    <>
      <span className="sb-face">
        <PetPhoto entry={e} width={120} square alt="" />
      </span>
      <span className="sb-team-name">{name}</span>
      <span className="sb-seed">{side.seed != null ? `No. ${side.seed}` : ' '}</span>
    </>
  )
  return (
    <div className={`sb-team${lead ? ' lead' : ''}`}>
      {here || !e ? (
        <div className="sb-team-id">{id}</div>
      ) : (
        <a className="sb-team-id" href={`#/pet/${e.id}`}>
          {id}
        </a>
      )}
      <Digits value={side.votes} label={`${name}: ${fmtInt(side.votes)} ${votesWord(side.votes)}`} dim={!lead} />
    </div>
  )
}

// The two pets, their counts and the tug between them. `a` is drawn on the
// left; `leading` says whether it leads.
export function FaceOff({ a, b, leading, here = false }) {
  const total = a.votes + b.votes
  const pct = total ? Math.round((a.votes / total) * 100) : 50
  const nameA = a.entry?.pet_name || 'Removed'
  return (
    <>
      <div className="sb-h2h">
        <Team side={a} lead={leading} here={here} />
        <span className="sb-vs" aria-hidden="true">
          vs.
        </span>
        <Team side={b} lead={!leading} />
      </div>
      <div className="sb-tug" role="img" aria-label={`${nameA} has ${pct}% of the votes in this matchup`}>
        <i style={{ width: `${pct}%` }} />
      </div>
    </>
  )
}

// Between unequal seeds the upset lamp is always on the board, and lights
// the moment the worse seed leads.
export function UpsetLamp({ standing, a, b, decided = false }) {
  if (a.seed == null || b.seed == null || a.seed === b.seed) return null
  const on = isUpset(standing)
  const sr = on ? (decided ? 'Upset: the lower seed won.' : 'Upset: the lower seed leads.') : 'No upset: the better seed leads.'
  return (
    <Lamp on={on} sr={sr}>
      Upset
    </Lamp>
  )
}
