import { useEffect, useState } from 'react'
import { useActivity } from '../lib/data.js'
import { fmtInt, timeAgo } from '../lib/format.js'
import { useNow, useReducedMotion } from '../lib/hooks.js'

// "25 votes for Biscuit · 2 min ago". Anonymous by construction: the view
// carries pet, size and time, never the buyer.
export default function ActivityTicker({ roundId, byId }) {
  const items = useActivity(roundId).filter((a) => byId.has(a.entry_id))
  const [i, setI] = useState(0)
  const now = useNow(15000)
  const reduced = useReducedMotion()

  useEffect(() => {
    if (items.length < 2 || reduced) return
    const t = setInterval(() => setI((n) => n + 1), 4500)
    return () => clearInterval(t)
  }, [items.length, reduced])

  if (!items.length) return null
  const a = items[i % items.length]
  const pet = byId.get(a.entry_id)
  return (
    <div className="ticker" aria-label="Recent votes">
      <span className="live-dot" aria-hidden="true" />
      <span className="ticker-text ticker-fade" key={`${a.entry_id}-${a.confirmed_at}`}>
        <b>{fmtInt(a.votes)}</b> votes for <a href={`#/pet/${pet.id}`}>{pet.pet_name}</a>
        {a.bonus_multiplier > 1 && <> (×{a.bonus_multiplier} bonus)</>} · {timeAgo(a.confirmed_at, now)}
      </span>
    </div>
  )
}
