import { useEffect, useRef, useState } from 'react'
import { fmtInt, fmtMoney } from '../lib/format.js'
import { goalProgress } from '../lib/goal.js'
import { apTime } from '../lib/format.js'
import { withUtm } from './Sponsor.jsx'
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
  const { stats, contest, phase, shelters, match, matches, now } = useContest()
  // The share of sales plus whatever sponsors have matched: all of it goes
  // to the shelters.
  const matched = Number(stats?.match_cents ?? 0)
  const cents = Number(stats?.shelter_cents ?? 0) + matched
  const matchers = [...new Set((matches || []).filter((m) => new Date(m.starts_at) <= now).map((m) => m.sponsor_name))]
  const shown = useRollingNumber(Number(cents))
  if (!contest) return null
  const split = stats?.beneficiary_split_pct ?? contest.beneficiary_split_pct
  const goal = goalProgress(cents, contest.shelter_goal_cents)
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
        {matched > 0 && (
          <div className="raised-matched">
            Includes {fmtMoney(matched, { whole: true })} matched by {matchers.join(' and ') || 'sponsors'}.
          </div>
        )}
        {goal && (
          <div className="raised-goal">
            <div
              className="raised-bar"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={goal.pct}
              aria-label={`${goal.pct}% of the ${fmtMoney(goal.goal, { whole: true })} goal`}
            >
              <span style={{ width: `${goal.pct}%` }} />
            </div>
            <div className="raised-goal-label">
              {goal.reached
                ? `Goal of ${fmtMoney(goal.goal, { whole: true })} reached. Thank you.`
                : `${goal.pct}% of our ${fmtMoney(goal.goal, { whole: true })} goal`}
            </div>
          </div>
        )}
      </div>
      <div>
        <p style={{ margin: '0 0 8px', fontSize: 15 }}>
          {split}% of every vote pack goes straight to {shelters?.length === 1 ? shelters[0].name : 'our partner shelters'}.
          {phase === 'complete' ? ' The final total, after refunds.' : ' The counter updates as votes come in.'}
        </p>
        {match && phase === 'voting' && (
          <p className="raised-match" style={{ margin: '0 0 8px', fontSize: 15 }}>
            <strong>
              {match.sponsor_url ? (
                <a href={withUtm(match.sponsor_url)} target="_blank" rel="noopener noreferrer sponsored">
                  {match.sponsor_name}
                </a>
              ) : (
                match.sponsor_name
              )}
            </strong>{' '}
            is matching every vote pack until {apTime(match.ends_at)}, up to {fmtMoney(match.cap_cents, { whole: true })}.
          </p>
        )}
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
