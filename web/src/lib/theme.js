// The design tokens, resolved, for code that cannot read CSS: the canvas
// share images, confetti, the Stripe form. A token is read by setting it as
// a color on a probe element and reading back the computed value, because a
// custom property's own computed value is its declared text (`color-mix(...)`),
// not a color. Resolved once per token per theme.

const cache = new Map()

function probe() {
  let el = document.getElementById('wpr-theme-probe')
  if (!el) {
    el = document.createElement('span')
    el.id = 'wpr-theme-probe'
    el.setAttribute('aria-hidden', 'true')
    el.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none'
    document.body.appendChild(el)
  }
  return el
}

const themeKey = () => (typeof document === 'undefined' ? '' : document.documentElement.dataset.theme || '')

// A token's color as `rgb(r, g, b)` (or rgba), or the fallback outside a
// document or when the token is unset.
export function tokenColor(name, fallback) {
  if (typeof document === 'undefined' || !document.body) return fallback
  const key = `${themeKey()}:${name}`
  if (cache.has(key)) return cache.get(key)
  let value = fallback
  try {
    const el = probe()
    el.style.color = ''
    el.style.color = `var(${name})`
    const read = getComputedStyle(el).color
    if (read && read !== 'rgba(0, 0, 0, 0)' && el.style.color) value = read
  } catch {
    value = fallback
  }
  cache.set(key, value)
  return value
}

// A font-family list as declared on the root (`--display`, `--sans`, `--mono`).
export function tokenFont(name, fallback) {
  if (typeof document === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

// The first family in a list, unquoted: what `document.fonts.load` wants.
export const firstFamily = (list) => list.split(',')[0].trim().replace(/^['"]|['"]$/g, '')

// The palette the canvas graphics draw with.
export function palette() {
  return {
    ink: tokenColor('--ink', '#1a1a1a'),
    ink2: tokenColor('--ink-2', '#3a3a3a'),
    muted: tokenColor('--muted', '#5f5f5f'),
    paper: tokenColor('--paper', '#ffffff'),
    cream: tokenColor('--cream', '#f6f2e9'),
    creamDeep: tokenColor('--cream-deep', '#ede6d6'),
    rule: tokenColor('--rule', '#e3ddd0'),
    ruleStrong: tokenColor('--rule-strong', '#cfc6b3'),
    slate: tokenColor('--slate', '#32373c'),
    teal: tokenColor('--brand', '#3a867c'),
    tealInk: tokenColor('--brand-ink', '#2b655d'),
    tealDeep: tokenColor('--brand-deep', '#1f4b45'),
    tealTint: tokenColor('--brand-tint', '#e1edea'),
    sun: tokenColor('--accent', '#f4b942'),
    sunInk: tokenColor('--accent-ink', '#7a5500'),
    sunTint: tokenColor('--accent-tint', '#fcefd0'),
    red: tokenColor('--danger', '#9b2226'),
    onDeep: tokenColor('--board-label', '#d6e6e2'),
  }
}
