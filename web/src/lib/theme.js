// The design tokens, resolved, for code that cannot read CSS: the canvas
// share images, confetti, the Stripe form. A token is read by setting it as
// a color on a probe element and reading back the computed value, because a
// custom property's own computed value is its declared text (`color-mix(...)`),
// not a color. Resolved once per token per theme.

const cache = new Map()

// `light` reads the theme's light tokens whatever the reader's mode: the
// share images are the brand's look, not the reader's screen.
function probe(light = false) {
  const id = light ? 'wpr-theme-probe-light' : 'wpr-theme-probe'
  let el = document.getElementById(id)
  if (!el) {
    el = document.createElement('span')
    el.id = id
    el.setAttribute('aria-hidden', 'true')
    if (light) el.dataset.mode = 'light'
    el.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none'
    document.body.appendChild(el)
  }
  return el
}

const themeKey = () => (typeof document === 'undefined' ? '' : document.documentElement.dataset.theme || '')

// A token's color as `rgb(r, g, b)` (or rgba), or the fallback outside a
// document or when the token is unset.
export function tokenColor(name, fallback, { light = false } = {}) {
  if (typeof document === 'undefined' || !document.body) return fallback
  const mode = light ? 'light' : document.documentElement.dataset.mode || 'auto'
  const key = `${themeKey()}:${mode}:${name}`
  if (cache.has(key)) return cache.get(key)
  let value = fallback
  try {
    const el = probe(light)
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
export function palette({ light = false } = {}) {
  const t = (name, fallback) => tokenColor(name, fallback, { light })
  return {
    ink: t('--ink', '#1a1a1a'),
    ink2: t('--ink-2', '#3a3a3a'),
    muted: t('--muted', '#5f5f5f'),
    paper: t('--paper', '#ffffff'),
    cream: t('--cream', '#f6f2e9'),
    creamDeep: t('--cream-deep', '#ede6d6'),
    rule: t('--rule', '#e3ddd0'),
    ruleStrong: t('--rule-strong', '#cfc6b3'),
    slate: t('--slate', '#32373c'),
    teal: t('--brand', '#3a867c'),
    tealInk: t('--brand-ink', '#2b655d'),
    tealDeep: t('--brand-deep', '#1f4b45'),
    tealTint: t('--brand-tint', '#e1edea'),
    sun: t('--accent', '#f4b942'),
    sunInk: t('--accent-ink', '#7a5500'),
    sunTint: t('--accent-tint', '#fcefd0'),
    red: t('--danger', '#9b2226'),
    onDeep: t('--board-label', '#d6e6e2'),
  }
}
