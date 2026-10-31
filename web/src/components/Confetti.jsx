import { useMemo } from 'react'
import { useReducedMotion } from '../lib/hooks.js'

import { tokenColor } from '../lib/theme.js'

// The accent, the brand, paper, the brand's tint and a lighter accent: read
// from the theme once the first burst is asked for.
const DEFAULT = () => [
  tokenColor('--accent', '#f4b942'),
  tokenColor('--brand', '#3a867c'),
  tokenColor('--paper', '#ffffff'),
  tokenColor('--brand-tint', '#e1edea'),
  tokenColor('--accent-light', '#f7c860'),
]

// A single fall of paper, behind the content, once. Nothing under reduced
// motion. `colors` lets a sun-colored field use pieces that show against it.
export default function Confetti({ count = 36, colors = null }) {
  colors = colors || DEFAULT()
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
