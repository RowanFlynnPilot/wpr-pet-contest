// The owner's share images: the pet first, then its name, then what to do
// about it. Drawn at export size; render() scales for previews.
import { NEWSROOM } from '../../config.js'
import { C, F, doubleRule, drawBlock, drawFlag, drawPhoto, fillRect, fitBlock, loadPhoto, pawTexture, render, runs, textBlock } from './draw.js'
import { fmtCount } from './layout.js'
import { shelterLine } from './content.js'
import { drawQr } from './qr.js'
import { clubLabel } from '../milestones.js'

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

// A five-point star, for the club medal.
function star(ctx, cx, cy, outer, inner, fill) {
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const r = i % 2 ? inner : outer
    ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a))
  }
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
}

// The milestone club (lib/milestones.js) as a sun pill with a medal: on the
// photo of a story or a flyer, under the town on a square. Clubs only ever
// grow, so a printed flyer never goes stale. Returns its width.
function clubPill(ctx, x, y, h, tier) {
  const size = Math.round(h * 0.4)
  const text = clubLabel(tier).toUpperCase()
  const track = size * 0.08
  ctx.save()
  ctx.font = F.sans(800)(size)
  const tw = [...text].reduce((w, ch) => w + ctx.measureText(ch).width + track, -track)
  const medal = h * 0.62
  const padX = h * 0.3
  const gap = h * 0.2
  const w = padX + medal + gap + tw + padX * 1.2
  ctx.shadowColor = 'rgba(0, 0, 0, 0.28)'
  ctx.shadowBlur = h * 0.3
  ctx.shadowOffsetY = h * 0.06
  fillRect(ctx, x, y, w, h, C.sun, h / 2)
  ctx.shadowColor = 'transparent'
  const mx = x + padX + medal / 2
  const my = y + h / 2
  ctx.beginPath()
  ctx.arc(mx, my, medal / 2, 0, Math.PI * 2)
  ctx.fillStyle = C.ink
  ctx.fill()
  star(ctx, mx, my, medal * 0.32, medal * 0.13, C.sun)
  ctx.fillStyle = C.ink
  ctx.textBaseline = 'middle'
  let tx = x + padX + medal + gap
  for (const ch of text) {
    ctx.fillText(ch, tx, my + size * 0.05)
    tx += ctx.measureText(ch).width + track
  }
  ctx.restore()
  return w
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
  if (d.club) clubPill(ctx, M + 26, photoTop + 26, 66, d.club)

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
  if (d.club) {
    y += 20
    clubPill(ctx, cx, y, 52, d.club)
    y += 52
  }
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
  if (d.club) clubPill(ctx, M + 24, photoTop + 24, 72, d.club)
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
  textBlock(ctx, `A reader contest from ${NEWSROOM.name} · ${NEWSROOM.phone}`, { x: M, y: Math.max(y + 18, H - 62), maxWidth: colW, font: F.sans(600), color: C.onDeep, maxSize: 20, minSize: 16, maxLines: 1 })
}

// ------------------------------------------------------------ keepsake

// A certificate every entrant can keep once the pet's run is over: 11 x 8.5
// in, landscape, at 150 dpi. Cream paper inside a newspaper double rule, the
// photo on the left, the words on the right, and no vote call: by now there
// is nothing left to vote on. d.keepsake is keepsakeCopy (content.js).
async function keepsake(ctx, d, { brand }) {
  const W = 1650
  const H = 1275
  const k = d.keepsake
  const photo = loadPhoto(d.entry, 1400)

  fillRect(ctx, 0, 0, W, H, C.cream)
  pawTexture(ctx, 0, 0, W, H, C.teal, 0.045, 300)
  // The frame: thick over thin, as under a masthead, all the way round.
  const frame = (inset, width, color) => {
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.strokeRect(inset + width / 2, inset + width / 2, W - 2 * inset - width, H - 2 * inset - width)
  }
  frame(40, 10, C.tealDeep)
  frame(60, 2, C.tealDeep)

  // Left: the photo, with its club on it.
  const px = 110
  const py = 150
  const pw = 600
  const ph = H - py - 150
  drawPhoto(ctx, await photo, px, py, pw, ph, { radius: 24 })
  if (d.club) clubPill(ctx, px + 24, py + 24, 66, d.club)

  // Right: the words, centered in their column.
  const cx = px + pw + 80
  const cw = W - 110 - cx
  drawFlag(ctx, brand, { cx: cx + cw / 2, y: 120, badge: 84, wordmark: 40, gap: 20, tone: 'light' })
  const top = doubleRule(ctx, cx, 236, cw, C.slate, { thick: 6, gap: 5, thin: 2 }) + 30
  const footY = H - 150

  // Fit every line first, then center the stack between the rule and the
  // signature lines, so a short name and a long one both sit well.
  const blocks = [
    [fitBlock(ctx, k.kicker, { maxWidth: cw, font: F.sans(800), upper: true, track: 0.14, maxSize: 24, minSize: 16, maxLines: 2, leading: 1.3 }), C.tealInk, 26],
    [fitBlock(ctx, k.title, { maxWidth: cw, font: F.display(600), maxSize: 76, floor: 58, minSize: 40, maxLines: 2, leading: 1.04 }), C.ink, 30],
    [fitBlock(ctx, k.lead, { maxWidth: cw, font: F.sans(600), maxSize: 30, maxLines: 1 }), C.muted, 12],
    [fitBlock(ctx, k.name, { maxWidth: cw, font: F.display(600), maxSize: 136, floor: 96, wrapSize: 100, minSize: 48, maxLines: 2, leading: 1.0 }), C.tealInk, d.entry.town ? 8 : 28],
    ...(d.entry.town ? [[fitBlock(ctx, `of ${d.entry.town}`, { maxWidth: cw, font: F.sans(600), maxSize: 32, minSize: 22, maxLines: 1 }), C.muted, 28]] : []),
    [fitBlock(ctx, k.achievement, { maxWidth: cw, font: F.sans(700), maxSize: 36, floor: 30, minSize: 22, maxLines: 4, leading: 1.3 }), C.ink, 24],
    [fitBlock(ctx, k.raised, { maxWidth: cw, font: F.sans(600), maxSize: 28, floor: 24, minSize: 18, maxLines: 2, leading: 1.3 }), C.muted, 0],
  ]
  const stack = blocks.reduce((h, [f, , gap]) => h + f.height + gap, 0)
  let y = top + Math.max(0, (footY - 40 - top - stack) / 2)
  for (const [f, color, gap] of blocks) y = drawBlock(ctx, f, { x: cx, y, color, align: 'center' }) + gap

  // The foot: the newsroom's name on a signature line, and the date.
  const half = (cw - 60) / 2
  ctx.fillStyle = C.ink
  ctx.fillRect(cx, footY, half, 2)
  ctx.fillRect(cx + half + 60, footY, half, 2)
  textBlock(ctx, NEWSROOM.name, { x: cx, y: footY + 14, maxWidth: half, font: F.display(600), color: C.ink, align: 'center', maxSize: 28, minSize: 18, maxLines: 1 })
  if (k.date) textBlock(ctx, k.date, { x: cx + half + 60, y: footY + 14, maxWidth: half, font: F.sans(700), color: C.ink, align: 'center', maxSize: 26, minSize: 18, maxLines: 1 })
}

export const OWNER_FORMATS = [
  { id: 'story', label: 'Story', hint: 'Instagram and Facebook stories', width: 1080, height: 1920, draw: story },
  { id: 'square', label: 'Square', hint: 'Feed posts', width: 1080, height: 1080, draw: square },
  { id: 'flyer', label: 'Flyer', hint: 'Print on 8.5 x 11 paper', width: 1275, height: 1650, draw: flyer },
  // Offered once the pet's run is over (ShareImagePanel decides).
  { id: 'keepsake', label: 'Keepsake', hint: 'A certificate to print on 11 x 8.5 paper, or share', width: 1650, height: 1275, draw: keepsake },
]

export function renderOwner(format, data, { scale = 1 } = {}) {
  const k = data.keepsake
  const text = [data.entry.pet_name, data.entry.town, data.copy.headline, data.copy.detail, data.copy.kicker, data.where, data.club ? clubLabel(data.club).toUpperCase() : '', k ? `${k.kicker} ${k.title} ${k.lead} ${k.achievement} ${k.raised} ${k.date || ''}`.toUpperCase() + `${k.title} ${k.achievement} ${k.raised}` : ''].join(' ')
  return render({ width: format.width, height: format.height, scale, text, draw: (ctx, assets) => format.draw(ctx, data, assets) })
}

