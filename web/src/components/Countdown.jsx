import { useNow } from '../lib/hooks.js'
import { countdownParts, describeCountdown, formatCountdown } from '../lib/format.js'

const pad = (n) => String(n).padStart(2, '0')

// Big boxed countdown. The visible digits tick every second; screen readers
// get a single sentence that is not re-announced on every tick.
export default function Countdown({ to, label, urgentUnder = 6 * 3600 * 1000 }) {
  const now = useNow(1000)
  const left = new Date(to).getTime() - now
  if (left <= 0) return null
  const { days, hours, minutes, seconds } = countdownParts(left)
  const units = days > 0 ? [[days, 'days'], [hours, 'hrs'], [minutes, 'min']] : [[hours, 'hrs'], [minutes, 'min'], [seconds, 'sec']]
  return (
    <div className={`countdown${left < urgentUnder ? ' urgent' : ''}`}>
      {label && <div className="countdown-label">{label}</div>}
      <div className="countdown-units" aria-hidden="true">
        {units.map(([n, u]) => (
          <span className="countdown-unit" key={u}>
            <span className="n">{u === 'days' ? n : pad(n)}</span>
            <span className="u">{u}</span>
          </span>
        ))}
      </div>
      <span className="sr-only">
        {label} {describeCountdown(left)}
      </span>
    </div>
  )
}

export function InlineCountdown({ to }) {
  const now = useNow(1000)
  const left = new Date(to).getTime() - now
  return <span className="countdown-inline">{formatCountdown(left)}</span>
}
