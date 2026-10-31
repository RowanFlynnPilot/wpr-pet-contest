import { useEffect, useState } from 'react'
import { SUPABASE_URL } from '../lib/env.js'

// break-ui's switch between the demo pets and the worst realistic ones
// (src/demo/contest.js, DATASETS). Dev only: App renders it on the mock dev
// server, never in a build. Plain chrome, not part of the design.
const SETS = [
  ['demo', 'Demo data'],
  ['worst', 'Worst case'],
  ['one', 'One pet'],
  ['empty', 'No pets'],
  ['many', '1,000 pets'],
]

export default function DevDataToggle() {
  const [current, setCurrent] = useState(null)
  useEffect(() => {
    fetch(`${SUPABASE_URL}/__data`).then((r) => r.json()).then((d) => setCurrent(d.dataset), () => setCurrent(null))
  }, [])
  if (!current) return null
  const pick = (set) =>
    fetch(`${SUPABASE_URL}/__data?set=${set}`).then(() => {
      window.location.reload()
    })
  return (
    <div
      role="group"
      aria-label="Data set (development only)"
      style={{
        position: 'fixed', bottom: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 40, display: 'flex', gap: 2, padding: 3,
        background: '#e5e5e5', borderRadius: 999, font: '600 12px/1 system-ui, sans-serif', boxShadow: '0 2px 8px rgba(0,0,0,.2)',
      }}
    >
      {SETS.map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => pick(key)}
          aria-pressed={current === key}
          style={{ border: 0, borderRadius: 999, padding: '7px 10px', cursor: 'pointer', background: current === key ? '#fff' : 'transparent', color: '#111' }}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
