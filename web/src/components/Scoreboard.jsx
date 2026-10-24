import { useEffect, useState } from 'react'
import { EMBEDDED } from '../lib/env.js'
import { countdownParts, describeCountdown } from '../lib/format.js'
import { useNow } from '../lib/hooks.js'

const pad = (n) => String(n).padStart(2, '0')

// Score digits in fixed cells over ghost 8s, the way an arena board shows
// them: a count changes in place, the changed cell re-lighting (its key
// changes, so it remounts and runs sb-ignite), and nothing reflows. `zero`
// pads with real zeros (clock digits) instead of unlit ghost cells.
export function Digits({ value, min = 3, label, dim = false, zero = false, decorative = false }) {
  const known = value != null
  const text = known ? String(Math.max(0, Math.round(value))) : ''
  const cells = text.padStart(Math.max(min, text.length), zero && known ? '0' : ' ').split('')
  const a11y = decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label }
  return (
    <span className={`sb-digits${dim ? ' dim' : ''}`} {...a11y}>
      {cells.map((ch, i) => (
        <span key={`${cells.length - i}:${ch}`} className={`sb-cell${ch === ' ' ? ' ghost' : ''}`} aria-hidden="true">
          {ch === ' ' ? '0' : ch}
        </span>
      ))}
    </span>
  )
}

// The game clock. Screen readers get one sentence, not a tick every second.
export function GameClock({ to, done = 'Final' }) {
  const now = useNow(1000)
  if (!to) return null
  const left = new Date(to).getTime() - now
  if (left <= 0) return <span className="sb-clock final">{done}</span>
  const { days, hours, minutes, seconds } = countdownParts(left)
  const text = days > 0 ? `${days}d ${pad(hours)}:${pad(minutes)}` : `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
  return (
    <span className={`sb-clock${left < 3600 * 1000 ? ' late' : ''}`}>
      <span aria-hidden="true">{text}</span>
      <span className="sr-only">{describeCountdown(left)} left</span>
    </span>
  )
}

// Time to a start, in the board's own cells: days, hours, minutes.
export function CountdownCells({ to, label }) {
  const now = useNow(30000)
  const left = Math.max(0, new Date(to).getTime() - now)
  const { days, hours, minutes } = countdownParts(left)
  const groups = days > 0 ? [[days, 'days'], [hours, 'hrs'], [minutes, 'min']] : [[hours, 'hrs'], [minutes, 'min']]
  return (
    <span className="sb-countdown" role="img" aria-label={`${label} ${describeCountdown(left)}`}>
      {groups.map(([n, unit]) => (
        <span className="sb-cd-group" key={unit}>
          <Digits value={n} min={2} zero decorative />
          <span className="sb-cd-unit" aria-hidden="true">
            {unit}
          </span>
        </span>
      ))}
    </span>
  )
}

// A light on the board. Always present where it can mean something, so the
// moment it comes on (an upset, the cut line) is a light igniting, not a
// badge appearing. `sr` says what its state means.
export function Lamp({ on = false, sr, children }) {
  return (
    <span className={`sb-lamp${on ? ' on' : ''}`}>
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        <circle cx="5" cy="5" r="4" />
      </svg>
      <span aria-hidden={sr ? true : undefined}>{children}</span>
      {sr && <span className="sr-only">{sr}</span>}
    </span>
  )
}

// The deep-teal board. `label` names the round with `sub` (its deadline)
// under it, `clock` sits opposite, and a `lamp` hangs between them.
export function Scoreboard({ label, sub, clock, lamp, children, className = '' }) {
  return (
    <section className={`scoreboard ${className}`} aria-label={label}>
      <div className="sb-head">
        <span className="sb-round">
          {label}
          {sub && <span className="sb-sub">{sub}</span>}
        </span>
        {lamp}
        {clock}
      </div>
      {children}
    </section>
  )
}

const STOP_TEXT = {
  done: 'won',
  live: 'playing now',
  next: 'up next',
  ahead: 'still to come',
  out: 'knocked out here',
  gone: 'not reached',
}

function StopMark({ state }) {
  if (state === 'done') {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        <path d="M2.5 6.2 5 8.6l4.6-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (state === 'out') {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        <path d="M3 3l6 6M9 3 3 9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    )
  }
  return null
}

export function CrownMark({ size = 22 }) {
  return (
    <svg className="crown-mark" width={size} height={Math.round((size * 18) / 22)} viewBox="0 0 22 18" aria-hidden="true">
      <path d="M1.5 16 3.3 4.4l4.9 5.4L11 1.5l2.8 8.3 4.9-5.4L20.5 16Z" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

// The road as one row of stops, the open round to the crown, each carrying
// its result or date when it has one.
export function RoadStrip({ road, name }) {
  return (
    <ol className="road" aria-label={`${name}’s road to the crown`}>
      {road.stops.map((s) => (
        <li key={s.seq} className={`road-stop ${s.state}`}>
          <span className="road-dot">
            <StopMark state={s.state} />
          </span>
          <span className="road-label">{s.label}</span>
          {s.detail && (
            <span className="road-detail" aria-hidden="true">
              {s.detail}
            </span>
          )}
          <span className="sr-only">
            {s.name}: {s.seq === 1 && s.state === 'done' ? 'made the cut' : STOP_TEXT[s.state]}
            {s.detail ? `, ${s.detail}` : ''}
          </span>
        </li>
      ))}
      <li className={`road-stop crown ${road.crown}`}>
        <span className="road-dot">
          <CrownMark />
        </span>
        <span className="road-label">Crown</span>
        <span className="sr-only">The crown: {road.crown === 'won' ? 'won' : road.crown === 'gone' ? 'not reached' : 'still to come'}</span>
      </li>
    </ol>
  )
}

// A pinned Vote bar for phones, shown whenever the page's own Vote button is
// off screen: below a short Safari viewport on arrival, or scrolled past.
// Never inside the WordPress iframe, where `fixed` means the bottom of a
// frame as tall as the page, far below the reader.
export function StickyVote({ targetRef, children }) {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const el = targetRef.current
    if (EMBEDDED || !el || typeof IntersectionObserver === 'undefined') return undefined
    const io = new IntersectionObserver(([e]) => setShow(!e.isIntersecting))
    io.observe(el)
    return () => io.disconnect()
  }, [targetRef])
  if (EMBEDDED) return null
  return (
    <div className={`sticky-vote${show ? ' show' : ''}`} inert={!show}>
      {children}
    </div>
  )
}
