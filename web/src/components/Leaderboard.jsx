import { fmtInt } from '../lib/format.js'
import PetPhoto from './PetPhoto.jsx'

// Open-round standings with the qualifying line drawn in. `bubble` shows the
// leaders plus the pets either side of the line, which is where the money is.
export function leaderboardRows(ranked, { cut = 16, top = 5, around = 2, bubble = false, limit = 10 } = {}) {
  if (!bubble || ranked.length <= top + around * 2 + 1) return ranked.slice(0, bubble ? ranked.length : limit)
  const keep = new Set()
  for (let i = 0; i < Math.min(top, ranked.length); i++) keep.add(i)
  for (let i = Math.max(0, cut - around); i < Math.min(ranked.length, cut + around); i++) keep.add(i)
  return [...keep].sort((a, b) => a - b).map((i) => ranked[i])
}

// ▲n beside a pet that rose n places since yesterday (lib/rank.js climbers).
export function Climb({ up }) {
  if (!up) return null
  return (
    <span className="climb" title={`Up ${up} places since yesterday`}>
      <span aria-hidden="true">▲{up}</span>
      <span className="sr-only">, up {up} places since yesterday</span>
    </span>
  )
}

export default function Leaderboard({ ranked, limit = 10, cut = 16, bubble = false, climb = null }) {
  const rows = leaderboardRows(ranked, { cut, bubble, limit })
  return (
    <ol className="board" aria-label="Open Round standings">
      {rows.map((r, idx) => (
        <li key={r.entry.id}>
          {idx > 0 && r.rank - rows[idx - 1].rank > 1 && (
            <div className="board-gap" aria-hidden="true">
              •••
            </div>
          )}
          {r.rank === cut + 1 && (
            <div className="board-cut" aria-hidden="true">
              Top {cut} advance ▲
            </div>
          )}
          <a className="board-row" href={`#/pet/${r.entry.id}`}>
            <span className="board-rank">{r.rank}</span>
            <PetPhoto entry={r.entry} width={120} square alt="" />
            <span style={{ minWidth: 0 }}>
              <span className="board-name">
                {r.entry.pet_name}
                <Climb up={climb?.get(r.entry.id)} />
              </span>
              <span className="board-town" style={{ display: 'block' }}>
                {r.entry.town}
              </span>
            </span>
            <span className="board-votes">
              {fmtInt(r.votes)}
              <span className="sr-only"> votes</span>
            </span>
          </a>
        </li>
      ))}
    </ol>
  )
}
