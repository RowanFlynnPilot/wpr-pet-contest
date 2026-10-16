// The owner's share images: the pet first, then its name, then what to do
// about it. Drawn at export size; render() scales for previews.
import { C, F, doubleRule, drawBlock, drawFlag, drawPhoto, fillRect, fitBlock, loadPhoto, pawTexture, render, runs, textBlock } from './draw.js'
import { fmtCount } from './layout.js'
import { shelterLine } from './content.js'
import { drawQr } from './qr.js'

// d: { entry, copy (ownerCopy), votes, where, shareUrl, splitPct }

// The vote count as a sun sticker on the photo's corner.
function voteSticker(ctx, cx, cy, d, votes, label) {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate((-7 * Math.PI) / 180)
  ctx.shadowColor = 'rgba(0, 0, 0, 0.28)'
  ctx.shadowBlur = d * 0.08
  ctx.shadowOffsetY = d * 0.025
  ctx.beginPath()
  ctx.arc(0, 0, d / 2, 0, Math.PI * 2)
  ctx.fillStyle = C.sun
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.lineWidth = Math.max(2, d * 0.012)
  ctx.strokeStyle = C.ink
  ctx.beginPath()
  ctx.arc(0, 0, d / 2 - d * 0.055, 0, Math.PI * 2)
  ctx.stroke()
  // Stack by cap height so the cluster centers optically in the disc.
  const w = d * 0.72
  const num = fitBlock(ctx, fmtCount(votes), { maxWidth: w, font: F.mono(700), tight: true, maxSize: Math.round(d * 0.3), minSize: Math.round(d * 0.12), floor: Math.round(d * 0.12), maxLines: 1 })
  const unit = fitBlock(ctx, votes === 1 ? 'vote' : 'votes', { maxWidth: w, font: F.sans(800), upper: true, track: 0.16, maxSize: Math.round(d * 0.08), maxLines: 1 })
  const tag = label ? fitBlock(ctx, label, { maxWidth: w * 0.9, font: F.sans(700), upper: true, track: 0.1, maxSize: Math.round(d * 0.066), maxLines: 1 }) : null
  const cap = (f) => f.size * 0.72
  const g1 = d * 0.06
  const g2 = d * 0.035
  const total = cap(num) + g1 + cap(unit) + (tag ? g2 + cap(tag) : 0)
  const top = (f, capTop) => capTop - f.size * (0.8 - 0.72)
  let capTop = -total / 2
  drawBlock(ctx, num, { x: -w / 2, y: top(num, capTop), color: C.ink, align: 'center' })
  capTop += cap(num) + g1
  drawBlock(ctx, unit, { x: -w / 2, y: top(unit, capTop), color: C.ink, align: 'center' })
  capTop += cap(unit) + g2
  if (tag) drawBlock(ctx, tag, { x: -(w * 0.9) / 2, y: top(tag, capTop), color: C.ink, align: 'center' })
  ctx.restore()
}

// The call to action in a sun pill. Returns its bottom edge.
function ctaPill(ctx, f, { x, y, w, padY, fill = C.sun, color = C.ink }) {
  const h = f.height + padY * 2
  fillRect(ctx, x, y, w, h, fill, Math.min(h / 2, 999))
  drawBlock(ctx, f, { x: x + (w - f.maxWidth) / 2, y: y + padY + f.size * 0.04, color, align: 'center' })
  return y + h
}

const voteAt = (d, size, { lead = C.onDeep, url = '#ffffff' } = {}) => [
  { text: `${d.copy.urlLead || 'Vote at'} `, font: F.sans(600), size, color: lead },
  { text: d.where, font: F.sans(800), size, color: url },
]

// ------------------------------------------------------------- story 9:16

async function story(ctx, d, { brand }) {
  const W = 1080
  const H = 1920
  const M = 80
  const CW = W - M * 2
  const photo = loadPhoto(d.entry, 1600)
  const { copy } = d

  fillRect(ctx, 0, 0, W, H, C.tealDeep)
  pawTexture(ctx, 0, 0, W, H, '#ffffff', 0.055, 270)
  fillRect(ctx, 0, 0, W, 14, C.sun)

  // Instagram and Facebook draw their own chrome over the top ~250px and
  // bottom ~220px, so the flag sits low and the last line ends by 1720.
  drawFlag(ctx, brand, { cx: W / 2, y: 176, badge: 100, wordmark: 46, gap: 24, tone: 'dark' })
  const ruleEnd = doubleRule(ctx, M, 300, CW, '#ffffff', { thick: 7, gap: 6, thin: 2 })
  const kicker = textBlock(ctx, copy.kicker, { x: M, y: ruleEnd + 30, maxWidth: CW, font: F.sans(800), color: C.sun, align: 'center', upper: true, track: 0.16, maxSize: 30, minSize: 20, maxLines: 1 })
  const photoTop = kicker.bottom + 28

  const name = fitBlock(ctx, d.entry.pet_name, { maxWidth: CW, font: F.display(600), maxSize: 150, floor: 104, wrapSize: 118, minSize: 64, maxLines: 2, leading: 1.0 })
  const town = fitBlock(ctx, d.entry.town || '', { maxWidth: CW, font: F.sans(600), maxSize: 40, floor: 32, minSize: 26, maxLines: 2, leading: 1.2 })
  const cta = fitBlock(ctx, copy.headline, { maxWidth: CW - 80, font: F.sans(800), maxSize: 46, floor: 38, minSize: 30, maxLines: 2, leading: 1.14 })
  const detail = copy.detail ? fitBlock(ctx, copy.detail, { maxWidth: CW, font: F.sans(600), maxSize: 34, floor: 28, minSize: 24, maxLines: 2, leading: 1.25 }) : null
  const share = fitBlock(ctx, shelterLine(d.splitPct), { maxWidth: CW, font: F.sans(600), maxSize: 30, floor: 26, minSize: 22, maxLines: 2, leading: 1.25 })

  const padY = 26
  const stack = 44 + name.height + 10 + town.height + 40 + cta.height + padY * 2 + (detail ? 28 + detail.height : 0) + 40 + 44 + 18 + share.height
  const photoH = Math.max(560, Math.min(940, 1730 - photoTop - stack))

  drawPhoto(ctx, await photo, M, photoTop, CW, photoH, { radius: 28 })
  // No sticker at zero: "0 votes" talks people out of voting.
  if (copy.showVotes && d.votes > 0) voteSticker(ctx, W - M - 92, photoTop + 96, 236, d.votes, copy.votesLabel)

  let y = photoTop + photoH + 44
  y = drawBlock(ctx, name, { x: M, y, color: '#ffffff', align: 'center' }) + 10
  y = drawBlock(ctx, town, { x: M, y, color: C.onDeep, align: 'center' }) + 40
  y = ctaPill(ctx, cta, { x: M, y, w: CW, padY })
  if (detail) y = drawBlock(ctx, detail, { x: M, y: y + 28, color: C.onDeep, align: 'center' })
  runs(ctx, voteAt(d, 36), { x: M, y: y + 40 + 36, maxWidth: CW, align: 'center' })
  drawBlock(ctx, share, { x: M, y: y + 40 + 44 + 18, color: C.onDeep, align: 'center' })
}

// ------------------------------------------------------------- square 1:1

async function square(ctx, d, { brand }) {
  const W = 1080
  const H = 1080
  const M = 60
  const CW = W - M * 2
  const photo = loadPhoto(d.entry, 1200)
  const { copy } = d

  fillRect(ctx, 0, 0, W, H, C.tealDeep)
  pawTexture(ctx, 0, 0, W, H, '#ffffff', 0.05, 240)
  fillRect(ctx, 0, 0, W, 10, C.sun)
  drawFlag(ctx, brand, { cx: W / 2, y: 42, badge: 78, wordmark: 36, gap: 20, tone: 'dark' })
  const top = doubleRule(ctx, M, 142, CW, '#ffffff', { thick: 6, gap: 5, thin: 2 }) + 30

  // Bottom up: the shelter line, where to vote, then the call to action.
  const share = fitBlock(ctx, shelterLine(d.splitPct), { maxWidth: CW, font: F.sans(600), maxSize: 26, minSize: 20, floor: 22, maxLines: 1 })
  const shareY = H - 44 - share.height
  const urlBase = shareY - 22
  const cta = fitBlock(ctx, copy.headline, { maxWidth: CW - 70, font: F.sans(800), maxSize: 40, floor: 34, minSize: 26, maxLines: 2, leading: 1.14 })
  const padY = 22
  const ctaTop = urlBase - 34 - 30 - (cta.height + padY * 2)
  const photoW = 500
  const photoH = ctaTop - 36 - top

  drawPhoto(ctx, await photo, M, top, photoW, photoH, { radius: 22 })

  const cx = M + photoW + 40
  const colW = W - M - cx
  let y = top - 4
  y = textBlock(ctx, copy.kicker, { x: cx, y, maxWidth: colW, font: F.sans(800), color: C.sun, upper: true, track: 0.14, maxSize: 22, minSize: 18, floor: 20, maxLines: 2, leading: 1.35 }).bottom + 18
  y = textBlock(ctx, d.entry.pet_name, { x: cx, y, maxWidth: colW, font: F.display(600), color: '#ffffff', maxSize: 104, floor: 76, wrapSize: 84, minSize: 32, maxLines: 2, leading: 1.0 }).bottom + 10
  if (d.entry.town) y = textBlock(ctx, d.entry.town, { x: cx, y, maxWidth: colW, font: F.sans(600), color: C.onDeep, maxSize: 30, floor: 26, minSize: 22, maxLines: 2, leading: 1.2 }).bottom
  y += 34
  ctx.fillStyle = 'rgba(214, 230, 226, 0.35)'
  ctx.fillRect(cx, y, colW, 2)
  y += 34
  if (copy.showVotes && d.votes > 0) {
    y = textBlock(ctx, fmtCount(d.votes), { x: cx, y, maxWidth: colW, font: F.mono(700), tight: true, color: C.sun, maxSize: 96, minSize: 48, floor: 48, maxLines: 1, leading: 1.0 }).bottom + 6
    y = textBlock(ctx, `${d.votes === 1 ? 'vote' : 'votes'} in the ${copy.votesLabel === 'Open Round' ? 'Open Round' : copy.votesLabel}`, { x: cx, y, maxWidth: colW, font: F.sans(700), color: C.onDeep, maxSize: 26, minSize: 20, maxLines: 2, leading: 1.25 }).bottom + 24
  }
  if (copy.detail) textBlock(ctx, copy.detail, { x: cx, y, maxWidth: colW, font: F.sans(600), color: C.onDeep, maxSize: 28, floor: 24, minSize: 20, maxLines: 4, leading: 1.3 })

  ctaPill(ctx, cta, { x: M, y: ctaTop, w: CW, padY })
  runs(ctx, voteAt(d, 32), { x: M, y: urlBase, maxWidth: CW, align: 'center' })
  drawBlock(ctx, share, { x: M, y: shareY, color: C.onDeep, align: 'center' })
}

// ------------------------------------------------------------- flyer, print

// 8.5 x 11 in at 150 dpi. White paper (it gets printed on office printers),
// a QR code to the pet's page, and no live vote count: a flyer on a shop
// counter outlives any number printed on it.
async function flyer(ctx, d, { brand }) {
  const W = 1275
  const H = 1650
  const M = 75
  const CW = W - M * 2
  const photo = loadPhoto(d.entry, 1800)
  const { copy } = d

  fillRect(ctx, 0, 0, W, H, '#ffffff')
  drawFlag(ctx, brand, { cx: W / 2, y: 60, badge: 120, wordmark: 54, gap: 28, tone: 'light' })
  textBlock(ctx, 'Where Locals Look First For News', { x: M, y: 196, maxWidth: CW, font: F.sans(600), color: C.slate, align: 'center', upper: true, track: 0.28, maxSize: 17, maxLines: 1 })
  const ruleEnd = doubleRule(ctx, M, 232, CW, C.slate, { thick: 8, gap: 6, thin: 2 })
  const kicker = textBlock(ctx, copy.kicker, { x: M, y: ruleEnd + 28, maxWidth: CW, font: F.sans(800), color: C.tealInk, align: 'center', upper: true, track: 0.16, maxSize: 30, minSize: 20, maxLines: 1 })
  const photoTop = kicker.bottom + 26

  // The band at the foot: what to do, and the code to scan.
  const bandTop = 1250
  const name = fitBlock(ctx, d.entry.pet_name, { maxWidth: CW, font: F.display(600), maxSize: 150, floor: 110, wrapSize: 116, minSize: 64, maxLines: 2, leading: 1.0 })
  const town = fitBlock(ctx, d.entry.town || '', { maxWidth: CW, font: F.sans(600), maxSize: 40, floor: 32, minSize: 26, maxLines: 1, leading: 1.2 })
  const photoH = Math.max(560, bandTop - 44 - town.height - 8 - name.height - 34 - photoTop)
  drawPhoto(ctx, await photo, M, photoTop, CW, photoH, { radius: 18 })
  let y = drawBlock(ctx, name, { x: M, y: photoTop + photoH + 34, color: C.ink, align: 'center' }) + 8
  drawBlock(ctx, town, { x: M, y, color: C.muted, align: 'center' })

  fillRect(ctx, 0, bandTop, W, H - bandTop, C.tealDeep)
  pawTexture(ctx, 0, bandTop, W, H - bandTop, '#ffffff', 0.05, 260)
  fillRect(ctx, 0, bandTop, W, 10, C.sun)

  // The code keeps its own white quiet zone on the dark band.
  // 270px is 1.8 in at 150 dpi: an easy scan from arm's length.
  const plate = 270
  const px = W - M - plate
  const py = bandTop + 46
  const caption = 42
  fillRect(ctx, px, py, plate, plate + caption, '#ffffff', 16)
  drawQr(ctx, d.shareUrl, px, py, plate, { dark: C.ink, quiet: 3 })
  textBlock(ctx, 'Scan to vote', { x: px, y: py + plate + 2, maxWidth: plate, font: F.sans(800), color: C.tealInk, align: 'center', upper: true, track: 0.14, maxSize: 22, maxLines: 1 })

  const colW = px - 50 - M
  y = bandTop + 50
  y = textBlock(ctx, copy.headline, { x: M, y, maxWidth: colW, font: F.display(600), color: '#ffffff', maxSize: 62, floor: 50, wrapSize: 56, minSize: 36, maxLines: 2, leading: 1.06 }).bottom + 18
  if (copy.detail) y = textBlock(ctx, copy.detail, { x: M, y, maxWidth: colW, font: F.sans(600), color: C.onDeep, maxSize: 30, floor: 26, minSize: 22, maxLines: 2, leading: 1.25 }).bottom + 18
  runs(ctx, voteAt(d, 34), { x: M, y: y + 34, maxWidth: colW })
  y += 34 + 26
  y = textBlock(ctx, shelterLine(d.splitPct), { x: M, y, maxWidth: colW, font: F.sans(600), color: C.onDeep, maxSize: 28, floor: 24, minSize: 20, maxLines: 2, leading: 1.25 }).bottom
  textBlock(ctx, 'A Wausau Pilot & Review reader contest · 715-301-5539', { x: M, y: Math.max(y + 18, H - 62), maxWidth: colW, font: F.sans(600), color: C.onDeep, maxSize: 20, minSize: 16, maxLines: 1 })
}

export const OWNER_FORMATS = [
  { id: 'story', label: 'Story', hint: 'Instagram and Facebook stories', width: 1080, height: 1920, draw: story },
  { id: 'square', label: 'Square', hint: 'Feed posts', width: 1080, height: 1080, draw: square },
  { id: 'flyer', label: 'Flyer', hint: 'Print on 8.5 x 11 paper', width: 1275, height: 1650, draw: flyer },
]

export function renderOwner(format, data, { scale = 1 } = {}) {
  const text = [data.entry.pet_name, data.entry.town, data.copy.headline, data.copy.detail, data.copy.kicker, data.where].join(' ')
  return render({ width: format.width, height: format.height, scale, text, draw: (ctx, assets) => format.draw(ctx, data, assets) })
}

