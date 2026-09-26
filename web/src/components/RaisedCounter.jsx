import { useEffect, useRef, useState } from 'react'
import { fmtInt, fmtMoney } from '../lib/format.js'
import { useReducedMotion } from '../lib/hooks.js'
import { useContest } from './ContestContext.jsx'

// Rolls up to each new total so a reader watching sees the counter move.
function useRollingNumber(target, ms = 1200) {
  const reduced = useReducedMotion()
  const [shown, setShown] = useState(target)
  const from = useRef(target)
  useEffect(() => {
    if (reduced || from.current === target) {
      from.current = target
      setShown(target)
      return
    }
    const start = performance.now()
    const a = from.current
    let raf
    const step = (t) => {
      const k = Math.min(1, (t - start) / ms)
      const eased = 1 - (1 - k) ** 3
      setShown(Math.round(a + (target - a) * eased))
      if (k < 1) raf = requestAnimationFrame(step)
      else from.current = target
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, ms, reduced])
  return shown
}

export default function RaisedCounter() {
  const { stats, contest } = useContest()
  const cents = stats?.shelter_cents ?? 0
  const shown = useRollingNumber(Number(cents))
  if (!contest) return null
  const split = stats?.beneficiary_split_pct ?? contest.beneficiary_split_pct
  return (
    <section className="raised" aria-label="Money raised for shelters">
      <div>
        <div className="raised-amount" aria-hidden="true">
          {fmtMoney(shown, { whole: true })}
        </div>
        <div className="raised-label">
          <span className="sr-only">{fmtMoney(Number(cents), { whole: true })} </span>
          raised for local animal shelters
        </div>
      </div>
      <div>
        <p style={{ margin: '0 0 8px', fontSize: 15 }}>
          {split}% of every vote pack goes straight to our partner shelters. The counter updates as votes come in.
        </p>
        <div className="raised-facts">
          <span>
            <b>{fmtInt(stats?.entries ?? 0)}</b> pets entered
          </span>
          <span>
            <b>{fmtInt(stats?.votes ?? 0)}</b> votes cast
          </span>
        </div>
      </div>
    </section>
  )
}
