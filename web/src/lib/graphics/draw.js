// Canvas drawing for the social graphics. Layout decisions live in layout.js
// and content.js; this file only turns them into pixels.
import { NEWSROOM } from '../../config.js'
import { entryPhotoUrl } from '../photos.js'
import { firstFamily, palette, tokenFont } from '../theme.js'
import { coverRect, ellipsize, fitText } from './layout.js'

// The contest's tokens (web/src/styles/tokens.css), resolved from the theme
// the page is wearing when a color is read, so a newsroom's share images
// come out in its colors. "teal" and "sun" are the brand and the accent, by
// the names this module grew up with; they are fills, text uses their -ink
// variants. Every pairing measures AA or better in the default theme.
export const C = {}
for (const key of ['ink', 'ink2', 'muted', 'paper', 'cream', 'creamDeep', 'rule', 'ruleStrong', 'slate', 'teal', 'tealInk', 'tealDeep', 'tealTint', 'sun', 'sunInk', 'sunTint', 'red', 'onDeep']) {
  // The brand's light look, whatever the reader's mode: a share image is a poster.
  Object.defineProperty(C, key, { enumerable: true, get: () => palette({ light: true })[key] })
}

const DISPLAY = "'Schibsted Grotesk', Arial, sans-serif"
const SANS = "'Public Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif"
const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
const display = () => tokenFont('--display', DISPLAY)
const sans = () => tokenFont('--sans', SANS)
const mono = () => tokenFont('--mono', MONO)

export const F = {
  display: (weight = 600) => (size) => `${weight} ${size}px ${display()}`,
  // The display face has no italic; what was italic is the lighter weight.
  italic: (weight = 500) => (size) => `${weight} ${size}px ${display()}`,
  sans: (weight = 700) => (size) => `${weight} ${size}px ${sans()}`,
  mono: (weight = 700) => (size) => `${weight} ${size}px ${mono()}`,
}

// ------------------------------------------------------------------ loading

const withTimeout = (p, ms, fallback) => Promise.race([p, new Promise((r) => setTimeout(() => r(fallback), ms))])

// Canvas text renders in whatever face is ready when fillText runs, so wait
// for every face (and the unicode-range subset `text` needs) first. A slow or
// blocked font server costs a few seconds, then the fallback stack draws.
export function loadFonts(text = '') {
  if (typeof document === 'undefined' || !document.fonts?.load) return Promise.resolve()
  const sample = `${text} Aa0123456789$%`
  const d = `"${firstFamily(display())}"`
  const s = `"${firstFamily(sans())}"`
  const specs = [`600 80px ${d}`, `italic 500 80px ${d}`, `600 40px ${s}`, `700 40px ${s}`, `800 40px ${s}`, `700 40px "${firstFamily(mono())}"`]
  const all = Promise.all(specs.map((s) => document.fonts.load(s, sample).catch(() => []))).then(() => document.fonts.ready)
  return withTimeout(all, 5000, null)
}

const images = new Map()

// A canvas that has drawn a cross-origin image without CORS can no longer be
// exported. Probe a 1px copy rather than find out at toBlob().
function tainted(img) {
  try {
    const c = document.createElement('canvas')
    c.width = 1
    c.height = 1
    const x = c.getContext('2d')
    x.drawImage(img, 0, 0, 1, 1)
    x.getImageData(0, 0, 1, 1)
    return false
  } catch {
    return true
  }
}

// Resolves to a drawable image, or null (missing, failed, timed out, or
// would taint the canvas): callers draw the placeholder for null.
export function loadImage(url) {
  if (!url) return Promise.resolve(null)
  if (images.has(url)) return images.get(url)
  const p = withTimeout(
    new Promise((resolve) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.decoding = 'async'
      img.onload = () => resolve(img)
      img.onerror = () => resolve(null)
      img.src = url
    }),
    20000,
    null,
  ).then((img) => (img && img.naturalWidth && !tainted(img) ? img : null))
  images.set(url, p)
  p.then((img) => {
    if (!img) images.delete(url)
  })
  return p
}

// The 800px thumbnail when it is big enough for the slot, otherwise the original.
export const loadPhoto = (entry, width = 1400) => loadImage(entryPhotoUrl(entry, { width }))

// The wordmark ships as black type on white. Turn it into an alpha mask once,
// so it can be set in ink on cream or white on teal.
function wordmarkMask(img) {
  try {
    const c = document.createElement('canvas')
    c.width = img.naturalWidth
    c.height = img.naturalHeight
    const x = c.getContext('2d')
    x.drawImage(img, 0, 0)
    const data = x.getImageData(0, 0, c.width, c.height)
    const p = data.data
    // Ink is dark and opaque: darkness times the pixel's own alpha, so a
    // wordmark on white and one on transparency (the committed file is the
    // latter, for dark mode) both mask to the type alone.
    for (let i = 0; i < p.length; i += 4) {
      const lum = p[i] * 0.299 + p[i + 1] * 0.587 + p[i + 2] * 0.114
      const a = p[i + 3] / 255
      p[i] = p[i + 1] = p[i + 2] = 0
      p[i + 3] = Math.round(Math.min(255, Math.max(0, (255 - lum) * 1.08 * a)))
    }
    x.putImageData(data, 0, 0)
    return c
  } catch {
    return null
  }
}

let brand = null
export function loadBrand() {
  if (!brand) {
    const maybe = (src) => (src ? loadImage(src) : Promise.resolve(null))
    brand = Promise.all([maybe(NEWSROOM.badge), maybe(NEWSROOM.wordmark)]).then(([badge, logo]) => ({
      badge,
      mask: logo ? wordmarkMask(logo) : null,
      tints: new Map(),
    }))
  }
  return brand
}

function tint(b, color) {
  if (!b.mask) return null
  if (!b.tints.has(color)) {
    const c = document.createElement('canvas')
    c.width = b.mask.width
    c.height = b.mask.height
    const x = c.getContext('2d')
    x.drawImage(b.mask, 0, 0)
    x.globalCompositeOperation = 'source-in'
    x.fillStyle = color
    x.fillRect(0, 0, c.width, c.height)
    b.tints.set(color, c)
  }
  return b.tints.get(color)
}

// ------------------------------------------------------------------ canvas

// `scale` < 1 draws a preview with the same layout: everything below works in
// the export's own pixel coordinates.
export function makeCanvas(width, height, scale = 1) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const ctx = canvas.getContext('2d')
  ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.textBaseline = 'alphabetic'
  return { canvas, ctx }
}

export const toPng = (canvas) =>
  new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create the image.'))), 'image/png'))

export function roundRect(ctx, x, y, w, h, r = 0) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

export function fillRect(ctx, x, y, w, h, color, r = 0) {
  ctx.fillStyle = color
  if (r) {
    roundRect(ctx, x, y, w, h, r)
    ctx.fill()
  } else ctx.fillRect(x, y, w, h)
}

// The paw from Icons.jsx (64-unit box), centered on cx, cy.
export function drawPaw(ctx, cx, cy, size, color, rotate = 0) {
  const s = size / 64
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate((rotate * Math.PI) / 180)
  ctx.scale(s, s)
  ctx.translate(-32, -32)
  ctx.fillStyle = color
  const pad = (x, y, rx, ry, rot) => {
    ctx.beginPath()
    ctx.ellipse(x, y, rx, ry, (rot * Math.PI) / 180, 0, Math.PI * 2)
    ctx.fill()
  }
  pad(32, 42, 14, 12, 0)
  pad(15, 27, 6, 7.5, -18)
  pad(25.5, 17, 6, 7.5, -6)
  pad(38.5, 17, 6, 7.5, 6)
  pad(49, 27, 6, 7.5, 18)
  ctx.restore()
}

// The banner's paw texture: two prints per tile, tilted opposite ways.
export function pawTexture(ctx, x, y, w, h, color, alpha = 0.07, tile = 240) {
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  ctx.globalAlpha = alpha
  for (let ty = y - tile; ty < y + h + tile; ty += tile) {
    for (let tx = x - tile; tx < x + w + tile; tx += tile) {
      drawPaw(ctx, tx + tile * 0.2, ty + tile * 0.24, tile * 0.24, color, -18)
      drawPaw(ctx, tx + tile * 0.7, ty + tile * 0.68, tile * 0.24, color, 16)
    }
  }
  ctx.restore()
}

// A pet photo, cover-cropped into a (rounded) box. No photo, or one that
// could not be used: paw on cream instead of a failure.
export function drawPhoto(ctx, img, x, y, w, h, { radius = 0, focusY = 0.4 } = {}) {
  ctx.save()
  roundRect(ctx, x, y, w, h, radius)
  ctx.clip()
  if (img) {
    const r = coverRect(img.naturalWidth, img.naturalHeight, w, h, { focusY })
    ctx.drawImage(img, r.sx, r.sy, r.sw, r.sh, x, y, w, h)
  } else {
    ctx.fillStyle = C.cream
    ctx.fillRect(x, y, w, h)
    ctx.globalAlpha = 0.55
    drawPaw(ctx, x + w / 2, y + h / 2, Math.min(w, h) * 0.42, C.teal)
  }
  ctx.restore()
}

// ------------------------------------------------------------------ text

export const measurer = (ctx, font) => (text, size) => {
  ctx.font = font(size)
  return ctx.measureText(text).width
}

// Letter-spaced text, drawn glyph by glyph (canvas letterSpacing is not in
// every browser yet). `em` is the tracking in ems. `tight` narrows the
// full-cell comma of a monospaced vote count ("1,234", not "1 , 234").
const TIGHT = 0.5
const advance = (ctx, ch, tight) => ctx.measureText(ch).width * (tight && (ch === ',' || ch === '.') ? TIGHT : 1)

function trackedWidth(ctx, text, spacing, tight = false) {
  const chars = Array.from(text)
  return chars.reduce((sum, ch) => sum + advance(ctx, ch, tight), 0) + spacing * Math.max(0, chars.length - 1)
}

export const trackedMeasurer = (ctx, font, em, tight = false) => (text, size) => {
  ctx.font = font(size)
  return trackedWidth(ctx, text, size * em, tight)
}

// Ascent used to place the first baseline: close to the display face's and Public
// Sans' cap-plus-ascender height.
const ASC = 0.8

// Fit a block of text without drawing it, so a layout can measure a stack
// before deciding how big the photo gets.
export function fitBlock(ctx, text, { maxWidth, font, track = 0, tight = false, upper = false, maxSize, minSize, floor, maxLines, wrapSize, leading }) {
  const s = upper ? String(text ?? '').toUpperCase() : String(text ?? '')
  const measure = track || tight ? trackedMeasurer(ctx, font, track, tight) : measurer(ctx, font)
  const opts = { maxWidth, maxSize }
  for (const [k, v] of Object.entries({ minSize, floor, maxLines, wrapSize, leading })) if (v !== undefined) opts[k] = v
  return { ...fitText(s, measure, opts), font, track, tight, maxWidth }
}

// Draw a fitted block whose top edge is `y`. Returns the y just below it.
export function drawBlock(ctx, f, { x, y, color, align = 'left' }) {
  ctx.fillStyle = color
  ctx.font = f.font(f.size)
  f.lines.forEach((text, i) => {
    const base = y + i * f.lineHeight + f.size * ASC
    if (f.track || f.tight) drawTracked(ctx, text, x, base, f.size * f.track, align, f.maxWidth, f.tight)
    else {
      ctx.textAlign = align
      ctx.fillText(text, align === 'center' ? x + f.maxWidth / 2 : align === 'right' ? x + f.maxWidth : x, base)
      ctx.textAlign = 'left'
    }
  })
  return y + f.height
}

// Fit and draw in one go. Returns the fit with `bottom`.
export function textBlock(ctx, text, opts) {
  const f = fitBlock(ctx, text, opts)
  return { ...f, bottom: drawBlock(ctx, f, opts) }
}

function drawTracked(ctx, text, x, baseline, spacing, align, boxWidth, tight = false) {
  const width = trackedWidth(ctx, text, spacing, tight)
  let cx = align === 'center' ? x + (boxWidth - width) / 2 : align === 'right' ? x + boxWidth - width : x
  ctx.textAlign = 'left'
  for (const ch of Array.from(text)) {
    const full = ctx.measureText(ch).width
    const adv = advance(ctx, ch, tight)
    ctx.fillText(ch, cx - (full - adv) / 2, baseline)
    cx += adv + spacing
  }
}

// One line that must not wrap: shrink, then ellipsize. Returns the width used.
export function line(ctx, text, { x, y, maxWidth, font, size, minSize = Math.round(size * 0.7), color, align = 'left' }) {
  const measure = measurer(ctx, font)
  const f = fitText(String(text ?? ''), measure, { maxWidth, maxSize: size, minSize, floor: minSize, maxLines: 1 })
  ctx.font = font(f.size)
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.fillText(f.lines[0] || '', x, y)
  ctx.textAlign = 'left'
  return measure(f.lines[0] || '', f.size)
}

// Runs of differently styled text on one baseline, e.g. a mono vote count
// followed by a sans label. Shrinks every run together to fit.
export function runs(ctx, parts, { x, y, maxWidth, align = 'left' }) {
  const widths = (k) =>
    parts.map((p) => {
      ctx.font = p.font(Math.round(p.size * k))
      return ctx.measureText(p.text).width
    })
  let k = 1
  let total = widths(k).reduce((a, b) => a + b, 0)
  if (total > maxWidth) {
    k = Math.max(0.55, maxWidth / total)
    total = widths(k).reduce((a, b) => a + b, 0)
  }
  let cx = align === 'center' ? x + (maxWidth - total) / 2 : align === 'right' ? x + maxWidth - total : x
  const ws = widths(k)
  parts.forEach((p, i) => {
    ctx.font = p.font(Math.round(p.size * k))
    ctx.fillStyle = p.color
    ctx.textAlign = 'left'
    const t = i === parts.length - 1 && total > maxWidth ? ellipsize(p.text, (s) => ctx.measureText(s).width, maxWidth - (cx - x)) : p.text
    ctx.fillText(t, cx, y)
    cx += ws[i]
  })
  return total
}

// ------------------------------------------------------------------ brand

// The newsroom's flag in compact form: seal plus wordmark, centered on `cx`,
// top at `y`. tone 'dark' sets the wordmark in white for dark grounds. A
// newsroom without a seal or a wordmark gets its name in the display face.
export function drawFlag(ctx, b, { cx, y, badge = 92, wordmark = 42, gap = 22, tone = 'light' }) {
  const color = tone === 'dark' ? '#ffffff' : '#111111'
  const mark = b && tint(b, color)
  const seal = b?.badge ? badge : 0
  const markW = mark ? (mark.width / mark.height) * wordmark : 0
  let textW = markW
  const font = mark || seal ? F.sans(800) : F.display(700)
  const nameSize = Math.round(wordmark * (mark || seal ? 0.95 : 1.1))
  if (!mark) {
    ctx.font = font(nameSize)
    textW = ctx.measureText(NEWSROOM.name).width
  }
  const total = seal + (seal ? gap : 0) + textW
  const left = cx - total / 2
  const mid = y + badge / 2
  if (seal) {
    // The seal: a white disc either way, so it reads on dark and on cream.
    ctx.save()
    ctx.beginPath()
    ctx.arc(left + seal / 2, mid, seal / 2, 0, Math.PI * 2)
    ctx.closePath()
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.clip()
    ctx.drawImage(b.badge, left, y, seal, seal)
    ctx.restore()
  }
  const textLeft = left + seal + (seal ? gap : 0)
  if (mark) ctx.drawImage(mark, textLeft, mid - wordmark / 2, markW, wordmark)
  else {
    ctx.font = font(nameSize)
    ctx.fillStyle = color
    ctx.fillText(NEWSROOM.name, textLeft, mid + wordmark * 0.34)
  }
  return { width: total, height: badge, bottom: y + badge }
}

// The newspaper double rule: thick over thin.
export function doubleRule(ctx, x, y, w, color, { thick = 6, gap = 5, thin = 2 } = {}) {
  ctx.fillStyle = color
  ctx.fillRect(x, y, w, thick)
  ctx.fillRect(x, y + thick + gap, w, thin)
  return y + thick + gap + thin
}

// Staff previews of made-up numbers can never be mistaken for results.
export function sampleBands(ctx, width, height) {
  const band = Math.round(width * 0.04)
  for (const y of [0, height - band]) {
    ctx.fillStyle = C.red
    ctx.fillRect(0, y, width, band)
    textBlock(ctx, 'Sample numbers · not real results · do not post', {
      x: 0,
      y: y + band * 0.27,
      maxWidth: width,
      font: F.sans(800),
      color: '#ffffff',
      align: 'center',
      upper: true,
      track: 0.14,
      maxSize: Math.round(band * 0.46),
      maxLines: 1,
    })
  }
}

// Render one graphic. `draw(ctx, assets)` may be async (it awaits photos).
export async function render({ width, height, scale = 1, text = '', draw }) {
  const [b] = await Promise.all([loadBrand(), loadFonts(text)])
  const { canvas, ctx } = makeCanvas(width, height, scale)
  await draw(ctx, { brand: b })
  return canvas
}
