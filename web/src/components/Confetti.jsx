import { useMemo } from 'react'
import { useReducedMotion } from '../lib/hooks.js'

const DEFAULT = ['#f4b942', '#3a867c', '#ffffff', '#e1edea', '#f7c860']

// A single fall of paper, behind the content, once. Nothing under reduced
// motion. `colors` lets a sun-colored field use pieces that show against it.
export default function Confetti({ count = 36, colors = DEFAULT }) {
  const reduced = useReducedMotion()
  const bits = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: `${(i * 37) % 100}%`,
        delay: `${(i % 9) * 0.12}s`,
        color: colors[i % colors.length],
        rotate: `${(i * 47) % 360}deg`,
      })),
    [count, colors],
  )
  if (reduced) return null
  return (
    <div className="confetti" aria-hidden="true">
      {bits.map((b, i) => (
        <i key={i} style={{ left: b.left, animationDelay: b.delay, background: b.color, transform: `rotate(${b.rotate})` }} />
      ))}
    </div>
  )
}
