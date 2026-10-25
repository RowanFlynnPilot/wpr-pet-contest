import { fetchCheers } from '../lib/api.js'
import { cheerText } from '../lib/cheers.js'
import { fmtInt, timeAgo } from '../lib/format.js'
import { useNow } from '../lib/hooks.js'
import { useLive } from '../lib/live.js'

// "Cheers for Biscuit": the cheers buyers added to their packs (0033), newest
// first. Paid packs only; a first name only where the buyer gave one.
export default function PetCheers({ entry }) {
  const res = useLive(`cheers:${entry.id}`, () => fetchCheers(entry.id), 60000)
  const now = useNow(60000)
  const rows = (res.data || []).filter((r) => cheerText(r.cheer, entry.pet_name))
  if (!rows.length) return null
  return (
    <section className="pet-cheers" aria-labelledby="pet-cheers-title">
      <h2 id="pet-cheers-title">Cheers for {entry.pet_name}</h2>
      <ul>
        {rows.map((r) => (
          <li key={r.cheer_id}>
            <span className="pet-cheer-text">&ldquo;{cheerText(r.cheer, entry.pet_name)}&rdquo;</span>
            <span className="pet-cheer-meta">
              {r.cheer_name ? `${r.cheer_name} · ` : ''}
              {fmtInt(r.votes)} votes · {timeAgo(r.confirmed_at, now)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
