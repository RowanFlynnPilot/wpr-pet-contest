// Pure layout helpers for the social graphics: text fitting, cropping and
// small formatting. Nothing here touches a canvas or the DOM. Anything that
// needs a text width takes `measure(text, size)`, the width in pixels of
// `text` set at `size` px, so the tests can pass a fake one.

// Collapses whitespace but keeps no-break spaces, which glue "1:11 p.m." and
// "Oct. 17" together across a wrap.
const clean = (s) => String(s ?? '').replace(/[ \t\r\n\f\v]+/g, ' ').trim()
const ELLIPSIS = '…'

// Largest whole size in [low, high] at which `fits(size)` holds, or null.
// Text width grows with size, so a binary search is exact.
function largest(low, high, fits) {
  low = Math.ceil(low)
  high = Math.floor(high)
  if (high < low || !fits(low)) return null
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    if (fits(mid)) low = mid
    else high = mid - 1
  }
  return low
}

// A word too long for one line, cut into pieces that each fit.
export function breakWord(word, width, maxWidth) {
  const out = []
  let cur = ''
  for (const ch of Array.from(word)) {
    if (cur && width(cur + ch) > maxWidth) {
      out.push(cur)
      cur = ch
    } else cur += ch
  }
  if (cur) out.push(cur)
  return out
}

// Greedy wrap. `width(text)` is measured at a fixed size. Words wider than
// the line are cut only when `breakWords` is on (the last resort).
export function wrapGreedy(text, width, maxWidth, { breakWords = true } = {}) {
  const lines = []
  let cur = ''
  for (const word of clean(text).split(' ').filter(Boolean)) {
    const pieces = breakWords && width(word) > maxWidth ? breakWord(word, width, maxWidth) : [word]
    for (const piece of pieces) {
      const next = cur ? `${cur} ${piece}` : piece
      if (cur && width(next) > maxWidth) {
        lines.push(cur)
        cur = piece
      } else cur = next
    }
  }
  if (cur) lines.push(cur)
  return lines
}

// Two lines as even as possible: "Sir Reginald / Fluffington III", not
// "Sir Reginald Fluffington / III".
export function wrapBalanced(text, width) {
  const words = clean(text).split(' ')
  if (words.length < 2) return [words.join(' ')]
  let best = null
  for (let k = 1; k < words.length; k++) {
    const lines = [words.slice(0, k).join(' '), words.slice(k).join(' ')]
    const worst = Math.max(width(lines[0]), width(lines[1]))
    if (!best || worst < best.worst) best = { lines, worst }
  }
  return best.lines
}

// Trim `text` until it, plus an ellipsis, fits.
export function ellipsize(text, width, maxWidth) {
  const s = clean(text)
  if (width(s) <= maxWidth) return s
  const chars = Array.from(s)
  while (chars.length && width(chars.join('').trimEnd() + ELLIPSIS) > maxWidth) chars.pop()
  return chars.join('').trimEnd() + ELLIPSIS
}

// Fit a headline into a box: shrink on one line down to `floor`, then wrap to
// `maxLines` (at most `wrapSize`, so two lines do not shout), then keep
// shrinking to `minSize`. If even that fails, the last line is ellipsized:
// whatever goes in, nothing leaves the box.
//
// Returns { size, lines, lineHeight, height, truncated }.
export function fitText(
  text,
  measure,
  { maxWidth, maxSize, minSize = Math.round(maxSize * 0.4), floor = Math.round(maxSize * 0.7), maxLines = 2, wrapSize = Math.round(maxSize * 0.86), leading = 1.08 },
) {
  const s = clean(text)
  const done = (size, lines, truncated = false) => ({
    size,
    lines,
    lineHeight: Math.round(size * leading),
    height: Math.round(size * leading) * lines.length,
    truncated,
  })
  if (!s) return done(maxSize, [])

  const at = (size) => (t) => measure(t, size)
  floor = Math.max(minSize, Math.min(floor, maxSize))

  const oneLine = largest(floor, maxSize, (size) => measure(s, size) <= maxWidth)
  if (oneLine != null) return done(oneLine, [s])

  // Wrapping happens between words only; a word is never cut to make a
  // bigger size fit.
  const single = largest(minSize, maxSize, (size) => measure(s, size) <= maxWidth)
  if (maxLines >= 2 && s.includes(' ')) {
    const wrapAt = (size) => {
      const w = at(size)
      let lines = wrapGreedy(s, w, maxWidth, { breakWords: false })
      // Two lines are always balanced: no one-word widow under a full line.
      if (lines.length === 2) {
        const even = wrapBalanced(s, w)
        if (even.every((l) => w(l) <= maxWidth)) lines = even
      }
      return lines.length <= maxLines && lines.every((l) => w(l) <= maxWidth) ? lines : null
    }
    const wrapped = largest(minSize, Math.min(wrapSize, maxSize), (size) => wrapAt(size) != null)
    if (wrapped != null && !(single != null && single >= wrapped)) return done(wrapped, wrapAt(wrapped))
  }
  if (single != null) return done(single, [s])

  const w = at(minSize)
  const lines = wrapGreedy(s, w, maxWidth)
  if (lines.length <= maxLines) return done(minSize, lines)
  const kept = lines.slice(0, maxLines)
  kept[maxLines - 1] = ellipsize(lines.slice(maxLines - 1).join(' '), w, maxWidth)
  return done(minSize, kept, true)
}

// Source rectangle for drawing a `sw`x`sh` image into a `dw`x`dh` box with
// CSS object-fit: cover. `focusY` < 0.5 keeps more of the top: pets' faces sit
// in the upper half of most phone photos.
export function coverRect(sw, sh, dw, dh, { focusX = 0.5, focusY = 0.5 } = {}) {
  if (!(sw > 0 && sh > 0 && dw > 0 && dh > 0)) return { sx: 0, sy: 0, sw: Math.max(0, sw), sh: Math.max(0, sh) }
  const scale = Math.max(dw / sw, dh / sh)
  const cw = dw / scale
  const ch = dh / scale
  return { sx: (sw - cw) * focusX, sy: (sh - ch) * focusY, sw: cw, sh: ch }
}

// "https://www.wausaupilotandreview.com/pet-contest/#/pet/1" ->
// "wausaupilotandreview.com/pet-contest"
export function displayUrl(url) {
  const s = String(url || '')
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
    .replace(/[?#].*$/, '')
    .replace(/^www\./i, '')
    .replace(/\/+$/, '')
  return s
}

// "1,234"
const intFmt = new Intl.NumberFormat('en-US')
export const fmtCount = (n) => intFmt.format(Math.max(0, Math.round(Number(n) || 0)))

// Urgency line for a closing time: "5 days left", "62 hours left",
// "45 minutes left". Rounds down, so the post never promises more time than
// there is.
export function timeLeft(closesAt, now = Date.now()) {
  const ms = new Date(closesAt).getTime() - now
  if (!Number.isFinite(ms)) return ''
  if (ms <= 0) return 'Voting has closed'
  const minutes = Math.floor(ms / 60000)
  const hours = Math.floor(ms / 3600000)
  const days = Math.floor(ms / 86400000)
  if (hours >= 72) return `${days} days left`
  if (hours >= 2) return `${hours} hours left`
  if (hours === 1) return '1 hour left'
  if (minutes >= 2) return `${minutes} minutes left`
  return 'Less than 2 minutes left'
}

// "biscuit-story-1080x1920.png". Safe on every OS, and never empty.
export function fileName(...parts) {
  const slug = parts
    .filter((p) => p !== null && p !== undefined && p !== '')
    .map((p) =>
      String(p)
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, ''),
    )
    .filter(Boolean)
    .join('-')
    .slice(0, 90)
    .replace(/-+$/, '')
  return `${slug || 'pet-contest'}.png`
}
