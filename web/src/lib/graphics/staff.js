// The newsroom's daily posts: the launch (before and during entries), the
// leaderboard, the bubble, matchups, results, champion and money raised.
// Every card comes square, portrait and story size, laid out from the edges
// in, so all three share one drawing function.
import { NEWSROOM } from '../../config.js'
import { apCount, apDate, apDateTime, apTime, fmtMoney } from '../format.js'
import { sprintParts, sprintTitle, sprintWhen } from '../sprints.js'
import { C, F, doubleRule, drawBlock, drawFlag, drawPhoto, fillRect, fitBlock, loadPhoto, pawTexture, render, roundRect, runs, sampleBands, textBlock, trackedMeasurer } from './draw.js'
import { drawQr } from './qr.js'
import { fileName, fmtCount, timeLeft } from './layout.js'
import { countdownWords, glue, leaderboardRows, matchupLine, shelterLine, winnerLines } from './content.js'

export const STAFF_SIZES = [
  { id: 'square', label: 'Square', width: 1080, height: 1080 },
  { id: 'portrait', label: 'Portrait', width: 1080, height: 1350 },
  // Instagram and Facebook Stories, and the countdown sticker's backdrop.
  { id: 'story', label: 'Story', width: 1080, height: 1920 },
]
// The poster has its own size, whatever the desk's size chips say: 8.5 x 11
// in at 150 dpi, as the owners' flyer.
const LETTER = { id: 'letter', label: 'Letter', width: 1275, height: 1650 }

const M = 60
const RESET = 'Vote totals reset every round'

// ---------------------------------------------------------------- frame

function ground(ctx, W, H, tone) {
  if (tone === 'dark') {
    fillRect(ctx, 0, 0, W, H, C.tealDeep)
    pawTexture(ctx, 0, 0, W, H, '#ffffff', 0.05, 240)
    fillRect(ctx, 0, 0, W, 10, C.sun)
  } else {
    fillRect(ctx, 0, 0, W, H, C.cream)
    fillRect(ctx, 0, 0, W, 10, C.slate)
  }
}

// Flag, double rule, then kicker / title / sub, all centered. Returns the y
// below the last line.
function header(ctx, W, brand, { tone, kicker, title, titleSize = 74, sub }) {
  const dark = tone === 'dark'
  const CW = W - M * 2
  drawFlag(ctx, brand, { cx: W / 2, y: 40, badge: 72, wordmark: 34, gap: 18, tone })
  let y = doubleRule(ctx, M, 132, CW, dark ? '#ffffff' : C.slate, { thick: 6, gap: 5, thin: 2 }) + 28
  if (kicker) {
    y = textBlock(ctx, kicker, { x: M, y, maxWidth: CW, font: F.sans(800), color: dark ? C.sun : C.tealInk, align: 'center', upper: true, track: 0.16, maxSize: 24, minSize: 18, maxLines: 1 }).bottom + 12
  }
  if (title) {
    y = textBlock(ctx, title, { x: M, y, maxWidth: CW, font: F.display(600), color: dark ? '#ffffff' : C.ink, align: 'center', maxSize: titleSize, floor: Math.round(titleSize * 0.75), minSize: 40, maxLines: 2, leading: 1.04 }).bottom + 8
  }
  if (sub) {
    y = textBlock(ctx, sub, { x: M, y, maxWidth: CW, font: F.sans(600), color: dark ? C.onDeep : C.tealInk, align: 'center', maxSize: 28, floor: 24, minSize: 20, maxLines: 2, leading: 1.25 }).bottom
  }
  return y
}

// Where to vote, and the fine print, anchored to the bottom edge. Returns
// the top of the footer.
function footer(ctx, W, H, o, { tone, extra = RESET, urlLead = 'Vote at', shelter = true } = {}) {
  const dark = tone === 'dark'
  const CW = W - M * 2
  const fine = fitBlock(ctx, [extra, shelter ? shelterLine(o.splitPct, o.shelterNames) : null].filter(Boolean).join(' · '), { maxWidth: CW, font: F.sans(600), maxSize: 22, floor: 19, minSize: 16, maxLines: 2, leading: 1.3 })
  const fineY = H - 50 - fine.height
  drawBlock(ctx, fine, { x: M, y: fineY, color: dark ? C.onDeep : C.muted, align: 'center' })
  const base = fineY - 16
  runs(
    ctx,
    [
      { text: `${urlLead} `, font: F.sans(600), size: 30, color: dark ? C.onDeep : C.ink2 },
      { text: o.where, font: F.sans(800), size: 30, color: dark ? '#ffffff' : C.tealInk },
    ],
    { x: M, y: base, maxWidth: CW, align: 'center' },
  )
  return base - 30
}

// A small uppercase label in a sun capsule ("SEED 4", "WINNER").
function pill(ctx, text, x, y, { size = 22, fill = C.sun, color = C.ink }) {
  const f = fitBlock(ctx, text, { maxWidth: 400, font: F.sans(800), upper: true, track: 0.1, maxSize: size, maxLines: 1, leading: 1 })
  const w = trackedMeasurer(ctx, f.font, 0.1)(f.lines[0] || '', f.size) + size * 1.3
  const h = size * 1.7
  fillRect(ctx, x, y, w, h, fill, h / 2)
  drawBlock(ctx, { ...f, maxWidth: w }, { x, y: y + (h - f.size * 0.72) / 2 - f.size * 0.08, color, align: 'center' })
  return w
}

// ---------------------------------------------------------------- rows

// A standings table: rank, photo, name over a second line, votes.
// `slots` keeps two side-by-side tables on the same row height. Centered in
// its box when the rows don't fill it (a story-size canvas); `maxRow` lets
// rows grow there.
async function table(ctx, rows, { x, y: boxY, w, h, cut = null, second, rows: slots = rows.length, maxRow = 118 }) {
  const cutBand = cut != null && rows.some((r) => r.rank > cut) && rows.some((r) => r.rank <= cut) ? 52 : 0
  const rowH = Math.min(maxRow, (h - cutBand) / slots)
  const total = rowH * rows.length + cutBand
  const y = boxY + Math.max(0, (h - (rowH * slots + cutBand)) / 2)
  const photos = await Promise.all(rows.map((r) => loadPhoto(r.entry, 400)))
  fillRect(ctx, x, y, w, total, '#ffffff', 16)
  // Rank and vote columns as wide as their widest entry, so the names get
  // everything else.
  const rankSize = Math.round(Math.min(40, rowH * 0.4))
  const vSize = Math.round(Math.min(42, rowH * 0.42))
  const mono = trackedMeasurer(ctx, F.mono(700), 0, true)
  const rankW = Math.ceil(Math.max(...rows.map((r) => mono(String(r.rank), rankSize)))) + 12
  const votesW = Math.ceil(Math.max(...rows.map((r) => mono(fmtCount(r.votes), vSize)))) + 4
  const thumb = Math.round(rowH * (w < 600 ? 0.68 : 0.74))
  let ry = y
  rows.forEach((r, i) => {
    if (cutBand && r.rank === cut + 1) {
      fillRect(ctx, x, ry, w, cutBand, C.tealDeep)
      const label = `Top ${cut} make the bracket`
      const f = fitBlock(ctx, label, { maxWidth: w - 120, font: F.sans(800), upper: true, track: 0.16, maxSize: 22, maxLines: 1 })
      drawBlock(ctx, f, { x: x + 60, y: ry + (cutBand - f.size * 0.72) / 2 - f.size * 0.08, color: C.sun, align: 'center' })
      for (const tx of [x + 40, x + w - 40]) {
        ctx.fillStyle = C.sun
        ctx.beginPath()
        ctx.moveTo(tx - 10, ry + cutBand / 2 + 6)
        ctx.lineTo(tx + 10, ry + cutBand / 2 + 6)
        ctx.lineTo(tx, ry + cutBand / 2 - 8)
        ctx.closePath()
        ctx.fill()
      }
      ry += cutBand
    } else if (i > 0) {
      ctx.fillStyle = C.rule
      ctx.fillRect(x + 16, ry, w - 32, 2)
    }
    const mid = ry + rowH / 2
    textBlock(ctx, String(r.rank), { x: x + 8, y: mid - rankSize * 0.44, maxWidth: rankW, font: F.mono(700), color: C.tealInk, align: 'right', maxSize: rankSize, maxLines: 1, leading: 1 })
    const tx = x + 8 + rankW + 16
    drawPhoto(ctx, photos[i], tx, mid - thumb / 2, thumb, thumb, { radius: Math.round(thumb * 0.16) })
    const nx = tx + thumb + 20
    const nameW = x + w - 24 - votesW - 24 - nx
    const sub = second(r)
    const name = fitBlock(ctx, r.entry.pet_name, { maxWidth: nameW, font: F.display(600), maxSize: Math.round(Math.min(38, rowH * 0.38)), floor: Math.round(Math.min(38, rowH * 0.38) * 0.72), minSize: 16, maxLines: 3, leading: 1.02 })
    const subF = sub ? fitBlock(ctx, sub.text, { maxWidth: nameW, font: F.sans(sub.weight || 600), maxSize: Math.round(Math.min(23, rowH * 0.25)), minSize: 15, floor: 16, maxLines: 1 }) : null
    const block = name.height + (subF ? 4 + subF.height : 0)
    let ny = mid - block / 2
    ny = drawBlock(ctx, name, { x: nx, y: ny, color: C.ink })
    if (subF) drawBlock(ctx, subF, { x: nx, y: ny + 4, color: sub.color || C.muted })
    textBlock(ctx, fmtCount(r.votes), { x: x + w - votesW - 24, y: mid - vSize * 0.44, maxWidth: votesW, font: F.mono(700), tight: true, color: C.ink, align: 'right', maxSize: vSize, maxLines: 1, leading: 1 })
    ry += rowH
  })
  return y + total
}

// ---------------------------------------------------------------- cards

function leaderboard({ ranked, round, final }, o) {
  return {
    key: `leaderboard-${round.id}`,
    meta: { kind: 'leaderboard', ranked, round, final, o },
    label: final ? 'Open Round final standings' : 'Leaderboard, top 10',
    file: 'leaderboard-top-10',
    async draw(ctx, W, H, { brand }) {
      ground(ctx, W, H, 'light')
      const left = final ? null : timeLeft(round.closes_at, o.now)
      const top = header(ctx, W, brand, {
        tone: 'light',
        kicker: `Open Round · ${final ? 'final standings' : 'leaderboard'}`,
        title: final ? `The top ${Math.min(10, ranked.length)}` : 'Top 10 right now',
        sub: [left && left !== 'Voting has closed' ? `${left} to vote` : null, `Top ${o.bracketSize} make the bracket`].filter(Boolean).join(' · '),
      })
      const bottom = footer(ctx, W, H, o, { tone: 'light', urlLead: final ? 'Follow along at' : 'Vote at' })
      // Ten rows in a square are too thin to read in a feed: two columns of
      // five there, one column of ten in the taller format.
      const rows = leaderboardRows(ranked, 10)
      const town = (r) => (r.entry.town ? { text: r.entry.town } : null)
      const box = { y: top + 26, h: bottom - top - 26 - 30 }
      if (H < 1200 && rows.length > 5) {
        const g = 24
        const colW = (W - M * 2 - g) / 2
        const half = Math.ceil(rows.length / 2)
        await table(ctx, rows.slice(0, half), { ...box, x: M, w: colW, second: town, rows: half })
        await table(ctx, rows.slice(half), { ...box, x: M + colW + g, w: colW, second: town, rows: half })
      } else {
        await table(ctx, rows, { ...box, x: M, w: W - M * 2, second: town, maxRow: H > 1500 ? 140 : 118 })
      }
    },
  }
}

function bubble({ rows, cut, round }, o) {
  return {
    key: `bubble-${round.id}`,
    meta: { kind: 'bubble', rows, cut, round, o },
    label: `On the bubble (${rows[0].rank} to ${rows[rows.length - 1].rank})`,
    file: 'leaderboard-bubble',
    async draw(ctx, W, H, { brand }) {
      ground(ctx, W, H, 'light')
      const left = timeLeft(round.closes_at, o.now)
      const top = header(ctx, W, brand, {
        tone: 'light',
        kicker: 'Open Round · the bubble',
        title: 'On the bubble',
        sub: [`Top ${cut} make the bracket`, left !== 'Voting has closed' ? left : null].filter(Boolean).join(' · '),
      })
      const bottom = footer(ctx, W, H, o, { tone: 'light' })
      await table(ctx, rows, {
        x: M,
        y: top + 26,
        w: W - M * 2,
        h: bottom - top - 26 - 30,
        cut,
        second: (r) => ({ text: r.note, weight: 700, color: r.inside ? C.tealInk : C.sunInk }),
        maxRow: H > 1500 ? 140 : 118,
      })
    },
  }
}

function seedPill(ctx, seed, x, y, size = 22) {
  if (seed == null) return
  pill(ctx, `Seed ${seed}`, x, y, { size })
}

function matchup(st, round, label, o) {
  const name = (s) => s.entry?.pet_name || 'TBD'
  return {
    key: `matchup-${st.matchup.id}`,
    meta: { kind: 'matchup', st, round, label, o },
    label: `${name(st.a)} vs. ${name(st.b)}`,
    file: `matchup-${st.index}-${name(st.a)}-vs-${name(st.b)}`,
    async draw(ctx, W, H, { brand }) {
      ground(ctx, W, H, 'dark')
      const pending = round.status === 'pending'
      const decided = Boolean(st.winner)
      const sub = decided ? 'Final' : pending ? 'Voting opens soon' : glue(`Voting closes ${apDateTime(round.closes_at)}`)
      const top = header(ctx, W, brand, { tone: 'dark', kicker: `${label} · matchup ${st.index} of ${st.count}`, sub })
      const bottom = footer(ctx, W, H, o, { tone: 'dark', urlLead: decided ? 'Follow along at' : 'Vote at' })
      const photos = Promise.all([loadPhoto(st.a.entry, 1000), loadPhoto(st.b.entry, 1000)])

      const gap = 40
      const colW = (W - M * 2 - gap) / 2
      const names = [st.a, st.b].map((s) => fitBlock(ctx, name(s), { maxWidth: colW, font: F.display(600), maxSize: 58, floor: 44, wrapSize: 48, minSize: 28, maxLines: 2, leading: 1.02 }))
      const nameH = Math.max(...names.map((f) => f.height))
      const showVotes = !pending
      const lead = fitBlock(ctx, matchupLine(st, { status: round.status }), { maxWidth: W - M * 2, font: F.italic(500), maxSize: 38, floor: 30, minSize: 24, maxLines: 2, leading: 1.2 })
      const stack = 26 + nameH + 6 + 32 + (showVotes ? 14 + 70 + 24 + 18 : 0) + 22 + lead.height + 26
      const photoH = Math.max(260, Math.min(colW * (H > 1500 ? 1.75 : 1.4), bottom - top - 26 - stack))
      const photoY = top + 26 + Math.max(0, (bottom - top - 26 - photoH - stack) / 2)
      const imgs = await photos
      ;[st.a, st.b].forEach((s, i) => {
        const x = M + i * (colW + gap)
        drawPhoto(ctx, imgs[i], x, photoY, colW, photoH, { radius: 20 })
        if (decided && st.winner !== s.id) {
          fillRect(ctx, x, photoY, colW, photoH, 'rgba(31, 75, 69, 0.55)', 20)
        }
        seedPill(ctx, s.seed, x + 16, photoY + 16)
        if (decided && st.winner === s.id) pill(ctx, 'Winner', x + 16, photoY + photoH - 16 - 22 * 1.7, { size: 22 })
      })
      // "vs." in a sun disc where the two photos meet.
      const vsY = photoY + photoH / 2
      ctx.beginPath()
      ctx.arc(W / 2, vsY, 52, 0, Math.PI * 2)
      ctx.fillStyle = C.sun
      ctx.fill()
      ctx.lineWidth = 6
      ctx.strokeStyle = C.tealDeep
      ctx.stroke()
      textBlock(ctx, 'vs.', { x: W / 2 - 50, y: vsY - 22, maxWidth: 100, font: F.italic(600), color: C.ink, align: 'center', maxSize: 44, maxLines: 1, leading: 1 })

      let y = photoY + photoH + 26
      ;[st.a, st.b].forEach((s, i) => {
        const x = M + i * (colW + gap)
        drawBlock(ctx, names[i], { x, y, color: '#ffffff' })
        const yy = y + nameH + 6
        if (s.entry?.town) textBlock(ctx, s.entry.town, { x, y: yy, maxWidth: colW, font: F.sans(600), color: C.onDeep, maxSize: 26, minSize: 18, floor: 20, maxLines: 1 })
        if (showVotes) {
          runs(
            ctx,
            [
              { text: fmtCount(s.votes), font: F.mono(700), size: 70, color: i === 0 ? '#ffffff' : C.sun },
              { text: s.votes === 1 ? ' vote' : ' votes', font: F.sans(700), size: 24, color: C.onDeep },
            ],
            { x, y: yy + 32 + 14 + 58, maxWidth: colW },
          )
        }
      })
      y += nameH + 6 + 32
      if (showVotes) {
        y += 14 + 70 + 24
        const total = st.a.votes + st.b.votes
        const share = total ? st.a.votes / total : 0.5
        const barW = W - M * 2
        const aW = Math.round(barW * Math.min(0.97, Math.max(0.03, share)))
        ctx.globalAlpha = total ? 1 : 0.3
        fillRect(ctx, M, y, aW - 3, 18, '#ffffff', 9)
        fillRect(ctx, M + aW + 3, y, barW - aW - 3, 18, C.sun, 9)
        ctx.globalAlpha = 1
        y += 18
      }
      drawBlock(ctx, lead, { x: M, y: y + 22, color: C.onDeep, align: 'center' })
    },
  }
}

// A big photo with copy under it: the winner and champion cards.
async function heroCard(ctx, W, H, brand, o, { kicker, entry, seed, title, line1, line2, line3, urlLead, extra }) {
  ground(ctx, W, H, 'dark')
  const top = header(ctx, W, brand, { tone: 'dark', kicker })
  const bottom = footer(ctx, W, H, o, { tone: 'dark', urlLead, extra })
  const photo = loadPhoto(entry, 1400)
  const CW = W - M * 2
  const name = fitBlock(ctx, title, { maxWidth: CW, font: F.display(600), maxSize: 112, floor: 80, wrapSize: 90, minSize: 48, maxLines: 2, leading: 1.0 })
  const l1 = line1 ? fitBlock(ctx, line1, { maxWidth: CW, font: F.italic(500), maxSize: 52, floor: 40, minSize: 28, maxLines: 2, leading: 1.15 }) : null
  const l2 = line2 ? fitBlock(ctx, line2, { maxWidth: CW, font: F.sans(600), maxSize: 28, floor: 24, minSize: 18, maxLines: 2, leading: 1.25 }) : null
  const l3 = line3 ? fitBlock(ctx, line3, { maxWidth: CW, font: F.sans(800), maxSize: 30, floor: 26, minSize: 20, maxLines: 2, leading: 1.25 }) : null
  const stack = 30 + name.height + (l1 ? 8 + l1.height : 0) + (l2 ? 14 + l2.height : 0) + (l3 ? 14 + l3.height : 0) + 30
  const ph = Math.max(300, Math.min(CW * (H > 1500 ? 1.15 : 0.9), bottom - top - 24 - stack))
  const py = top + 24 + (H > 1500 ? Math.max(0, (bottom - top - 24 - ph - stack) / 2) : 0)
  // In the square the photo above the words would be a sliver (a nose and
  // no eyes), so it stands beside them instead, as tall as the space allows.
  if (bottom - py - stack < CW * 0.62) {
    const pw = Math.round(CW * 0.46)
    const tall = bottom - py - 24
    drawPhoto(ctx, await photo, M, py, pw, tall, { radius: 24 })
    seedPill(ctx, seed, M + 20, py + 20, 24)
    const tx = M + pw + 40
    const tw = CW - pw - 40
    const n2 = fitBlock(ctx, title, { maxWidth: tw, font: F.display(600), maxSize: 96, floor: 64, wrapSize: 72, minSize: 40, maxLines: 3, leading: 1.0 })
    const a2 = line1 ? fitBlock(ctx, line1, { maxWidth: tw, font: F.italic(500), maxSize: 46, floor: 34, minSize: 24, maxLines: 3, leading: 1.15 }) : null
    const b2 = line2 ? fitBlock(ctx, line2, { maxWidth: tw, font: F.sans(600), maxSize: 26, floor: 22, minSize: 17, maxLines: 3, leading: 1.25 }) : null
    const c2 = line3 ? fitBlock(ctx, line3, { maxWidth: tw, font: F.sans(800), maxSize: 28, floor: 22, minSize: 18, maxLines: 3, leading: 1.25 }) : null
    const h2 = n2.height + (a2 ? 12 + a2.height : 0) + (b2 ? 18 + b2.height : 0) + (c2 ? 18 + c2.height : 0)
    let y2 = py + Math.max(0, (tall - h2) / 2)
    y2 = drawBlock(ctx, n2, { x: tx, y: y2, color: '#ffffff' })
    if (a2) y2 = drawBlock(ctx, a2, { x: tx, y: y2 + 12, color: C.sun })
    if (b2) y2 = drawBlock(ctx, b2, { x: tx, y: y2 + 18, color: C.onDeep })
    if (c2) drawBlock(ctx, c2, { x: tx, y: y2 + 18, color: '#ffffff' })
    return
  }
  drawPhoto(ctx, await photo, M, py, CW, ph, { radius: 24 })
  seedPill(ctx, seed, M + 20, py + 20, 24)
  let y = drawBlock(ctx, name, { x: M, y: py + ph + 30, color: '#ffffff', align: 'center' })
  if (l1) y = drawBlock(ctx, l1, { x: M, y: y + 8, color: C.sun, align: 'center' })
  if (l2) y = drawBlock(ctx, l2, { x: M, y: y + 14, color: C.onDeep, align: 'center' })
  if (l3) drawBlock(ctx, l3, { x: M, y: y + 14, color: '#ffffff', align: 'center' })
}

function winner(w, results, o) {
  const lines = winnerLines(w, results)
  return {
    key: `winner-${results.round.id}-${w.entry.id}`,
    meta: { kind: 'winner', w, results, o },
    label: `${w.entry.pet_name} ${lines.headline}`,
    file: `${results.label}-winner-${w.entry.pet_name}`,
    draw: (ctx, W, H, { brand }) =>
      heroCard(ctx, W, H, brand, o, {
        kicker: `${results.label} result`,
        entry: w.entry,
        seed: w.seed,
        title: w.entry.pet_name,
        line1: lines.headline,
        line2: glue(lines.detail),
        urlLead: 'Follow along at',
      }),
  }
}

// Everyone who advanced, in one post.
function field(results, o) {
  const n = results.winners.length
  return {
    key: `field-${results.round.id}`,
    meta: { kind: 'field', results, o },
    label: `The ${results.nextLabel} is set (${n} pets)`,
    file: `${results.nextLabel}-field`,
    async draw(ctx, W, H, { brand }) {
      ground(ctx, W, H, 'dark')
      const top = header(ctx, W, brand, { tone: 'dark', kicker: `${results.label} results`, title: `The ${results.nextLabel} is set`, titleSize: H < 1200 && n > 8 ? 60 : 70 })
      const bottom = footer(ctx, W, H, o, { tone: 'dark', urlLead: 'Follow along at' })
      const photos = await Promise.all(results.winners.map((w) => loadPhoto(w.entry, 600)))
      const cols = n >= 8 ? 4 : n >= 3 ? 2 : Math.max(1, n)
      const rows = Math.ceil(n / cols)
      const g = 16
      const CW = W - M * 2
      const cellW = (CW - g * (cols - 1)) / cols
      const areaH = bottom - top - 26 - 30
      const cellH = Math.min(cellW * 1.45, (areaH - g * (rows - 1)) / rows)
      const y0 = top + 26 + (areaH - (cellH * rows + g * (rows - 1))) / 2
      const r = 14
      // One card per pet: photo on top, the name in a solid caption under
      // it, so the type never sits on (or hides) the photo. A long name
      // stops shrinking at a size a phone can read, then ends in an ellipsis.
      const names = results.winners.map((w) =>
        fitBlock(ctx, w.entry.pet_name, { maxWidth: cellW - 20, font: F.display(600), maxSize: Math.round(Math.min(38, cellW * 0.13)), floor: 24, minSize: 22, maxLines: 2, leading: 1.04 }),
      )
      const caption = Math.max(...names.map((f) => f.height)) + 16
      results.winners.forEach((w, i) => {
        const cx = M + (i % cols) * (cellW + g)
        const cy = y0 + Math.floor(i / cols) * (cellH + g)
        ctx.save()
        roundRect(ctx, cx, cy, cellW, cellH, r)
        ctx.clip()
        fillRect(ctx, cx, cy, cellW, cellH, '#173834')
        drawPhoto(ctx, photos[i], cx, cy, cellW, cellH - caption, { focusY: 0.42 })
        ctx.restore()
        const name = names[i]
        drawBlock(ctx, name, { x: cx + 10, y: cy + cellH - caption + (caption - name.height) / 2, color: '#ffffff', align: 'center' })
        if (w.seed != null) {
          const d = Math.round(Math.min(56, Math.max(32, cellW * 0.19)))
          ctx.beginPath()
          ctx.arc(cx + 10 + d / 2, cy + 10 + d / 2, d / 2, 0, Math.PI * 2)
          ctx.fillStyle = C.sun
          ctx.fill()
          textBlock(ctx, String(w.seed), { x: cx + 10, y: cy + 10 + d / 2 - d * 0.25, maxWidth: d, font: F.mono(700), color: C.ink, align: 'center', maxSize: Math.round(d * 0.46), maxLines: 1, leading: 1 })
        }
      })
    },
  }
}

function champion(c, o) {
  return {
    key: `champion-${c.entry.id}`,
    meta: { kind: 'champion', c, o },
    label: `Champion: ${c.entry.pet_name}`,
    file: `champion-${c.entry.pet_name}`,
    draw: (ctx, W, H, { brand }) =>
      heroCard(ctx, W, H, brand, o, {
        kicker: `${o.year} champion`,
        entry: c.entry,
        seed: c.seed,
        title: c.entry.pet_name,
        line1: `is the ${o.contestName}`,
        line2: c.opponent ? glue(`Beat ${c.opponent.pet_name} in the Championship, ${fmtCount(c.votes)}–${fmtCount(c.opponentVotes)}`) : null,
        line3: o.shelterCents > 0 ? `${fmtMoney(o.shelterCents, { whole: true })} raised for ${joinNames(o.shelterNames) || 'local animal shelters'}` : null,
        urlLead: 'Results at',
        extra: 'Thank you for voting',
      }),
  }
}

// "and" before the last of a list: "A, B and C".
const joinNames = (names) => (names.length <= 1 ? names[0] || '' : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`)

function milestone({ cents, exact, shelters }, o) {
  const money = fmtMoney(cents, { whole: true })
  const rounded = cents < exact
  return {
    key: `raised-${cents}`,
    meta: { kind: 'milestone', cents, exact, shelters, o },
    label: `${rounded ? 'More than ' : ''}${money} raised`,
    file: `raised-${money}`,
    async draw(ctx, W, H, { brand }) {
      ground(ctx, W, H, 'dark')
      const top = header(ctx, W, brand, { tone: 'dark', kicker: o.contestName })
      const bottom = footer(ctx, W, H, o, { tone: 'dark', urlLead: o.voting ? 'Vote at' : 'Follow along at', extra: 'Thank you for voting', shelter: false })
      const CW = W - M * 2
      const list = joinNames(shelters.map((s) => s.name).filter(Boolean))
      const pct = Number(o.splitPct) || 0
      const body = list ? `${pct ? `${pct}% of every vote pack` : 'A share of every vote pack'} goes to ${list}.` : `${shelterLine(o.splitPct, o.shelterNames)}.`
      const lead = rounded ? fitBlock(ctx, 'More than', { maxWidth: CW, font: F.italic(500), maxSize: 56, maxLines: 1, leading: 1.1 }) : null
      const big = fitBlock(ctx, money, { maxWidth: CW, font: F.display(700), maxSize: H > 1100 ? 300 : 260, floor: 120, minSize: 100, maxLines: 1, leading: 1 })
      const label = fitBlock(ctx, `raised for ${list || 'local animal shelters'}`, { maxWidth: CW, font: F.italic(500), maxSize: 64, floor: 48, minSize: 32, maxLines: 2, leading: 1.1 })
      const copy = fitBlock(ctx, body, { maxWidth: CW - 80, font: F.sans(600), maxSize: 32, floor: 26, minSize: 20, maxLines: 4, leading: 1.3 })
      const block = (lead ? lead.height + 6 : 0) + big.height + 10 + label.height + 44 + 8 + 44 + copy.height
      let y = top + (bottom - top - block) / 2
      if (lead) y = drawBlock(ctx, lead, { x: M, y, color: C.onDeep, align: 'center' }) + 6
      y = drawBlock(ctx, big, { x: M, y, color: '#ffffff', align: 'center' }) + 10
      y = drawBlock(ctx, label, { x: M, y, color: C.sun, align: 'center' }) + 44
      fillRect(ctx, W / 2 - 60, y, 120, 8, C.sun, 4)
      y += 8 + 44
      drawBlock(ctx, copy, { x: M + 40, y, color: C.onDeep, align: 'center' })
    },
  }
}

// ------------------------------------------------- sprints, Last Chance, finale

// A sprint (0030): announced or running, or its winner.
function sprintCard({ sprint, state, top = [], winner = null }, o) {
  const title = sprintTitle(sprint)
  if (state === 'won' && winner) {
    return {
      key: `sprint-won-${sprint.id}`,
      meta: { kind: 'sprintWinner', sprint, winner, o },
      label: `${title}: ${winner.entry.pet_name} won`,
      file: `sprint-winner-${winner.entry.pet_name}`,
      draw: (ctx, W, H, { brand }) =>
        heroCard(ctx, W, H, brand, o, {
          kicker: `${title} winner`,
          entry: winner.entry,
          seed: winner.entry.seed,
          title: winner.entry.pet_name,
          line1: `won ${sprint.prize}`,
          line2: glue(`${fmtCount(winner.votes)} votes, ${sprintWhen(sprint)}`),
          line3: `Prize from ${sprint.sponsor_name}`,
          urlLead: 'Follow along at',
          extra: 'Thank you for voting',
        }),
    }
  }
  const live = state === 'live'
  return {
    key: `sprint-${state}-${sprint.id}`,
    meta: { kind: 'sprint', sprint, state, top, o },
    label: live ? `${title}: on now` : `${title}: announcement`,
    file: `sprint-${live ? 'live' : 'announce'}`,
    async draw(ctx, W, H, { brand }) {
      ground(ctx, W, H, 'dark')
      const top0 = header(ctx, W, brand, {
        tone: 'dark',
        kicker: live ? `${title} · on now` : title,
        title: `The most votes wins ${sprint.prize}`,
        titleSize: 66,
        sub: live ? glue(`Until ${apTime(sprint.ends_at)}`) : null,
      })
      const bottom = footer(ctx, W, H, o, { tone: 'dark', extra: 'Sprint votes count toward the round like any other' })
      const CW = W - M * 2
      const from = fitBlock(ctx, `Prize from ${sprint.sponsor_name}`, { maxWidth: CW, font: F.italic(500), maxSize: 46, floor: 34, minSize: 26, maxLines: 2, leading: 1.15 })
      const avail = bottom - top0 - 40
      if (live && top.length) {
        // The top three, centered with the prize line under them.
        const th = Math.min(3 * 118, avail - from.height - 40)
        const y0 = top0 + 20 + (avail - th - 40 - from.height) / 2
        const end = await table(ctx, top, { x: M, y: y0, w: CW, h: th, second: (r) => (r.entry.town ? { text: r.entry.town } : null), rows: 3 })
        drawBlock(ctx, from, { x: M, y: end + 40, color: C.sun, align: 'center' })
        return
      }
      // The day, then the hours large, a sun rule, then the prize line.
      const p = sprintParts(sprint)
      const day = fitBlock(ctx, glue(p.day), { maxWidth: CW, font: F.sans(700), maxSize: 38, floor: 30, minSize: 22, maxLines: 2, leading: 1.2 })
      const time = fitBlock(ctx, glue(p.time), { maxWidth: CW, font: F.display(600), maxSize: 120, floor: 72, minSize: 44, maxLines: 2, leading: 1.02 })
      const block = day.height + 14 + time.height + 34 + 8 + 34 + from.height
      let y = top0 + 20 + (avail - block) / 2
      y = drawBlock(ctx, day, { x: M, y, color: C.onDeep, align: 'center' }) + 14
      y = drawBlock(ctx, time, { x: M, y, color: '#ffffff', align: 'center' }) + 34
      fillRect(ctx, W / 2 - 60, y, 120, 8, C.sun, 4)
      drawBlock(ctx, from, { x: M, y: y + 8 + 34, color: C.sun, align: 'center' })
    },
  }
}

// Last Chance (0032): the pets racing for the last seed, best first.
function lastChanceCard({ rows, closesAt }, o) {
  return {
    key: `lastchance-${closesAt}`,
    meta: { kind: 'lastchance', rows, closesAt, o },
    label: `Last Chance (${rows.length} pets)`,
    file: 'last-chance',
    async draw(ctx, W, H, { brand }) {
      ground(ctx, W, H, 'light')
      const left = timeLeft(closesAt, o.now)
      const top = header(ctx, W, brand, {
        tone: 'light',
        kicker: 'Open Round · Last Chance',
        title: 'One spot left',
        sub: [left && left !== 'Voting has closed' ? left : null, 'Open Round votes carry over'].filter(Boolean).join(' · '),
      })
      const bottom = footer(ctx, W, H, o, { tone: 'light', extra: `The most votes takes seed ${o.bracketSize}` })
      await table(ctx, rows, {
        x: M,
        y: top + 26,
        w: W - M * 2,
        h: bottom - top - 26 - 30,
        second: (r) => (r.entry.town ? { text: r.entry.town } : null),
        maxRow: H > 1500 ? 150 : 118,
      })
    },
  }
}

// The finale (0031): when the champion is revealed, with the two finalists
// once the Championship is set.
function finaleCard({ at, finalists }, o) {
  return {
    key: `finale-${at}`,
    meta: { kind: 'finale', at, finalists, o },
    label: finalists ? `The finale: ${finalists[0].entry.pet_name} vs. ${finalists[1].entry.pet_name}` : 'The finale',
    file: 'finale',
    async draw(ctx, W, H, { brand }) {
      ground(ctx, W, H, 'dark')
      const top = header(ctx, W, brand, { tone: 'dark', kicker: o.contestName, title: 'The champion is revealed live', titleSize: 66, sub: glue(apDateTime(at)) })
      const bottom = footer(ctx, W, H, o, { tone: 'dark', urlLead: 'Countdown at', extra: 'Watch the reveal live' })
      const CW = W - M * 2
      if (!finalists) {
        const when = fitBlock(ctx, glue(apDateTime(at)), { maxWidth: CW, font: F.display(600), maxSize: 96, floor: 64, minSize: 40, maxLines: 2, leading: 1.05 })
        drawBlock(ctx, when, { x: M, y: top + (bottom - top - when.height) / 2, color: '#ffffff', align: 'center' })
        return
      }
      // The two finalists side by side, "vs." between them.
      const photos = await Promise.all(finalists.map((f) => loadPhoto(f.entry, 800)))
      const g = 70
      const cw = (CW - g) / 2
      const names = finalists.map((f) => fitBlock(ctx, f.entry.pet_name, { maxWidth: cw, font: F.display(600), maxSize: 56, floor: 40, minSize: 24, maxLines: 2, leading: 1.02 }))
      const nameH = Math.max(...names.map((n) => n.height))
      const ph = Math.min(cw * 1.15, bottom - top - 60 - nameH - 20)
      const py = top + 30 + (bottom - top - 60 - ph - nameH - 20) / 2
      finalists.forEach((f, i) => {
        const x = M + i * (cw + g)
        drawPhoto(ctx, photos[i], x, py, cw, ph, { radius: 22 })
        seedPill(ctx, f.seed, x + 14, py + 14, 22)
        drawBlock(ctx, names[i], { x, y: py + ph + 20, color: '#ffffff', align: 'center' })
      })
      textBlock(ctx, 'vs.', { x: M + cw, y: py + ph / 2 - 24, maxWidth: g, font: F.display(600), color: C.sun, align: 'center', maxSize: 44, maxLines: 1 })
    },
  }
}

// ---------------------------------------------------------------- the launch

// A centered stack of fitted blocks in the space between header and footer.
function centerStack(ctx, blocks, top, bottom) {
  const h = blocks.reduce((sum, b) => sum + (b.fit ? b.fit.height : b.h) + (b.gap || 0), 0)
  let y = top + Math.max(0, (bottom - top - h) / 2)
  for (const b of blocks) {
    if (b.fit) y = drawBlock(ctx, b.fit, { x: b.x ?? M, y, color: b.color, align: 'center' })
    else if (b.rule) {
      fillRect(ctx, b.W / 2 - 60, y, 120, 8, C.sun, 4)
      y += b.h
    } else y += b.h
    y += b.gap || 0
  }
}

// Before and during entries (D-14 to the Open Round), when there are no
// votes yet: the contest itself. `l`: { stage: 'soon' | 'open' | 'closed' |
// 'all' (sample), opensAt, closesAt, votingAt, entries, fromCents, shelters }.
function launchCards(l, o) {
  const cards = []
  const who = joinNames((l.shelters || []).map((s) => s.name)) || 'local animal shelters'
  const pct = Number(o.splitPct) || 0
  const share = pct ? `${pct}% of every pack` : 'a share of every pack'
  const from = l.fromCents ? `Packs from ${fmtMoney(l.fromCents, { whole: true })}.` : ''
  const region = NEWSROOM.region
  const soon = l.stage === 'soon' || l.stage === 'all'
  const open = l.stage === 'open' || l.stage === 'all'
  const closed = l.stage === 'closed' || l.stage === 'all'
  const meta = (kind, extra = {}) => ({ kind, o, ...l, who, ...extra })

  if (soon) {
    cards.push({
      key: 'launch-announce',
      meta: meta('announce'),
      label: 'Announcement',
      file: 'announce',
      draw(ctx, W, H, { brand }) {
        ground(ctx, W, H, 'dark')
        const top = header(ctx, W, brand, { tone: 'dark', kicker: `${o.year} · a reader contest`, title: `Is your pet the cutest in ${region}?`, titleSize: 72 })
        const bottom = footer(ctx, W, H, o, { tone: 'dark', urlLead: 'Details at', extra: 'Vote packs are not donations', shelter: false })
        const CW = W - M * 2
        const tall = H > 1500
        centerStack(ctx, [
          { fit: fitBlock(ctx, 'Entries open', { maxWidth: CW, font: F.sans(800), upper: true, track: 0.16, maxSize: 30, maxLines: 1 }), color: C.sun, gap: 18 },
          { fit: fitBlock(ctx, glue(apDate(l.opensAt)), { maxWidth: CW, font: F.display(700), maxSize: tall ? 150 : 124, floor: 80, minSize: 56, maxLines: 2, leading: 1 }), color: '#ffffff', gap: 40 },
          { rule: true, W, h: 8, gap: 40 },
          { fit: fitBlock(ctx, `Enter free with one photo. Readers vote with vote packs, and ${share} goes to ${who}.`, { maxWidth: CW - 60, font: F.sans(600), maxSize: tall ? 40 : 34, floor: 26, minSize: 22, maxLines: 4, leading: 1.3 }), x: M + 30, color: C.onDeep },
        ], top + 20, bottom - 20)
      },
    })
    const cd = countdownWords(l.opensAt, o.now)
    cards.push({
      key: `launch-countdown-${cd.days}`,
      meta: meta('countdown', { cd }),
      label: cd.days > 1 ? `Countdown: ${cd.days} days` : cd.line,
      file: cd.days > 1 ? `countdown-${cd.days}-days` : cd.days === 1 ? 'entries-open-tomorrow' : 'entries-open-today',
      draw(ctx, W, H, { brand }) {
        ground(ctx, W, H, 'dark')
        const top = header(ctx, W, brand, { tone: 'dark', kicker: o.contestName })
        const bottom = footer(ctx, W, H, o, { tone: 'dark', urlLead: 'Get ready at', extra: 'Enter free with one photo', shelter: false })
        const CW = W - M * 2
        const tall = H > 1500
        const numeric = cd.days > 1
        centerStack(ctx, [
          { fit: fitBlock(ctx, cd.big, { maxWidth: CW, font: numeric ? F.mono(700) : F.display(700), maxSize: numeric ? (tall ? 420 : H > 1200 ? 360 : 300) : tall ? 180 : 150, floor: 100, minSize: 72, maxLines: 1, leading: 1 }), color: C.sun, gap: 20 },
          { fit: fitBlock(ctx, numeric ? cd.line : 'Entries open', { maxWidth: CW, font: F.italic(500), maxSize: tall ? 72 : 60, floor: 40, minSize: 30, maxLines: 2, leading: 1.1 }), color: '#ffffff', gap: 30 },
          { rule: true, W, h: 8, gap: 30 },
          { fit: fitBlock(ctx, glue(apDateTime(l.opensAt)), { maxWidth: CW, font: F.sans(700), maxSize: tall ? 44 : 38, floor: 28, minSize: 22, maxLines: 2, leading: 1.2 }), color: C.onDeep },
        ], top + 10, bottom - 20)
      },
    })
  }

  // How it works, as a three-card carousel: before entries open and while they are.
  if (soon || open) {
    const steps = [
      ['Enter your pet free', `One phone photo, a name and a town. An editor checks every entry before it goes live.`],
      ['Vote with vote packs', `${from} ${pct === 50 ? 'Half' : pct ? `Every pack sends ${pct}%` : 'A share'}${pct === 50 || !pct ? ' of every pack goes' : ''} to ${who}. Vote packs are purchases, not donations.`.trim()],
      [`Then a ${o.bracketSize}-pet bracket`, `The top ${o.bracketSize} go head to head, two days a round. Vote totals reset every round, so any pet can win.`],
    ]
    steps.forEach(([title, body], i) => {
      cards.push({
        key: `launch-how-${i + 1}`,
        meta: meta('how', { step: i + 1 }),
        label: `How it works, ${i + 1} of 3`,
        file: `how-it-works-${i + 1}`,
        draw(ctx, W, H, { brand }) {
          ground(ctx, W, H, 'light')
          const top = header(ctx, W, brand, { tone: 'light', kicker: `How it works · ${i + 1} of 3`, title })
          const bottom = footer(ctx, W, H, o, { tone: 'light', urlLead: 'The rules at', extra: i === 2 ? RESET : `Entries open ${glue(apDate(l.opensAt, { weekday: false }))}`, shelter: false })
          const CW = W - M * 2
          const tall = H > 1500
          const d = tall ? 300 : H > 1200 ? 240 : 190
          const copy = fitBlock(ctx, body, { maxWidth: CW - 40, font: F.sans(600), maxSize: tall ? 46 : 38, floor: 28, minSize: 22, maxLines: 5, leading: 1.32 })
          const block = d + 50 + copy.height + 50 + 18
          let y = top + Math.max(20, (bottom - top - block) / 2)
          ctx.beginPath()
          ctx.arc(W / 2, y + d / 2, d / 2, 0, Math.PI * 2)
          ctx.fillStyle = C.sun
          ctx.fill()
          textBlock(ctx, String(i + 1), { x: W / 2 - d / 2, y: y + d * 0.16, maxWidth: d, font: F.display(700), color: C.ink, align: 'center', maxSize: Math.round(d * 0.66), maxLines: 1, leading: 1 })
          y += d + 50
          y = drawBlock(ctx, copy, { x: M + 20, y, color: C.ink2, align: 'center' }) + 50
          // Three dots, this card's filled: it reads as a carousel.
          ;[0, 1, 2].forEach((k) => {
            ctx.beginPath()
            ctx.arc(W / 2 + (k - 1) * 36, y + 9, 9, 0, Math.PI * 2)
            ctx.fillStyle = k === i ? C.tealInk : C.ruleStrong
            ctx.fill()
          })
        },
      })
    })
  }

  const closeAt = glue(apDateTime(l.closesAt))
  // A poster to print: a shelter's adoption events, the newsroom's office, a
  // sponsor's counter. White paper, no numbers that date it, a code to scan.
  if ((soon || open) && o.url) {
    cards.push({
      key: `launch-poster-${soon && !open ? 'soon' : 'open'}`,
      meta: meta('poster'),
      label: 'Poster to print (letter)',
      file: 'poster-letter',
      size: LETTER,
      draw(ctx, W, H, { brand }) {
        const P = 75
        const CW = W - P * 2
        fillRect(ctx, 0, 0, W, H, '#ffffff')
        drawFlag(ctx, brand, { cx: W / 2, y: 60, badge: 120, wordmark: 54, gap: 28, tone: 'light' })
        textBlock(ctx, 'Where Locals Look First For News', { x: P, y: 196, maxWidth: CW, font: F.sans(600), color: C.slate, align: 'center', upper: true, track: 0.28, maxSize: 17, maxLines: 1 })
        let y = doubleRule(ctx, P, 232, CW, C.slate, { thick: 8, gap: 6, thin: 2 }) + 40
        y = textBlock(ctx, `${o.year} · a reader contest`, { x: P, y, maxWidth: CW, font: F.sans(800), color: C.tealInk, align: 'center', upper: true, track: 0.16, maxSize: 30, maxLines: 1 }).bottom + 22
        y = textBlock(ctx, `Is your pet the cutest in ${region}?`, { x: P, y, maxWidth: CW, font: F.display(700), color: C.ink, align: 'center', maxSize: 108, floor: 80, minSize: 56, maxLines: 3, leading: 1.0 }).bottom + 30
        // When, large, in a sun band.
        const when = soon && !open ? ['Entries open', glue(apDate(l.opensAt))] : ['Entries are open', glue(`Until ${apDateTime(l.closesAt)}`)]
        const bandH = 190
        fillRect(ctx, P, y, CW, bandH, C.sun, 22)
        textBlock(ctx, when[0], { x: P, y: y + 28, maxWidth: CW, font: F.sans(800), color: C.ink, align: 'center', upper: true, track: 0.16, maxSize: 28, maxLines: 1 })
        textBlock(ctx, when[1], { x: P + 30, y: y + 72, maxWidth: CW - 60, font: F.display(700), color: C.ink, align: 'center', maxSize: 78, floor: 52, minSize: 36, maxLines: 1, leading: 1 })
        y += bandH + 50
        // Three steps, each a numbered line.
        const lines = [
          ['1', 'Enter your pet free', 'One phone photo, a name and a town.'],
          ['2', 'Vote with vote packs', `${pct === 50 ? 'Half of every pack goes' : pct ? `Every pack sends ${pct}%` : 'A share of every pack goes'} to ${who}.`],
          ['3', `Then a ${o.bracketSize}-pet bracket`, 'Totals reset every round, so any pet can win.'],
        ]
        const d = 92
        for (const [n, head, body] of lines) {
          ctx.beginPath()
          ctx.arc(P + d / 2, y + d / 2, d / 2, 0, Math.PI * 2)
          ctx.fillStyle = C.tealDeep
          ctx.fill()
          textBlock(ctx, n, { x: P, y: y + 14, maxWidth: d, font: F.display(700), color: '#ffffff', align: 'center', maxSize: 60, maxLines: 1, leading: 1 })
          const tx = P + d + 30
          const tw = CW - d - 30
          const h1 = textBlock(ctx, head, { x: tx, y: y + 2, maxWidth: tw, font: F.display(600), color: C.ink, maxSize: 46, floor: 36, minSize: 28, maxLines: 1, leading: 1.05 })
          textBlock(ctx, body, { x: tx, y: h1.bottom + 6, maxWidth: tw, font: F.sans(600), color: C.ink2, maxSize: 30, floor: 24, minSize: 20, maxLines: 2, leading: 1.25 })
          y += d + 44
        }
        // The band at the foot: the code to scan and where to go.
        const bandTop = 1290
        fillRect(ctx, 0, bandTop, W, H - bandTop, C.tealDeep)
        pawTexture(ctx, 0, bandTop, W, H - bandTop, '#ffffff', 0.05, 260)
        fillRect(ctx, 0, bandTop, W, 10, C.sun)
        const plate = 250
        const px = W - P - plate
        const py = bandTop + 40
        fillRect(ctx, px, py, plate, plate + 40, '#ffffff', 16)
        drawQr(ctx, o.url, px, py, plate, { dark: C.ink, quiet: 3 })
        textBlock(ctx, soon && !open ? 'Scan for details' : 'Scan to enter', { x: px + 14, y: py + plate + 4, maxWidth: plate - 28, font: F.sans(800), color: C.tealInk, align: 'center', upper: true, track: 0.1, maxSize: 20, maxLines: 1 })
        const colW = px - 50 - P
        // Centered on the plate beside it.
        let by = bandTop + 96
        by = textBlock(ctx, 'Enter, vote and follow along at', { x: P, y: by, maxWidth: colW, font: F.sans(600), color: C.onDeep, maxSize: 30, minSize: 22, maxLines: 1 }).bottom + 10
        by = textBlock(ctx, o.where, { x: P, y: by, maxWidth: colW, font: F.sans(800), color: '#ffffff', maxSize: 40, minSize: 24, maxLines: 2, leading: 1.15 }).bottom + 22
        textBlock(ctx, `Vote packs are purchases, not donations. A reader contest from ${NEWSROOM.name} · ${NEWSROOM.phone}`, { x: P, y: by, maxWidth: colW, font: F.sans(600), color: C.onDeep, maxSize: 22, minSize: 16, maxLines: 3, leading: 1.3 })
      },
    })
  }
  if (open) {
    cards.push({
      key: 'launch-open',
      meta: meta('entriesOpen'),
      label: 'Entries are open',
      file: 'entries-open',
      draw(ctx, W, H, { brand }) {
        ground(ctx, W, H, 'dark')
        const top = header(ctx, W, brand, { tone: 'dark', kicker: o.contestName })
        const bottom = footer(ctx, W, H, o, { tone: 'dark', urlLead: 'Enter at', extra: 'An editor checks every entry before it goes live', shelter: false })
        const CW = W - M * 2
        const tall = H > 1500
        centerStack(ctx, [
          { fit: fitBlock(ctx, 'Entries are open', { maxWidth: CW, font: F.display(700), maxSize: tall ? 150 : 124, floor: 80, minSize: 56, maxLines: 2, leading: 1 }), color: '#ffffff', gap: 24 },
          { fit: fitBlock(ctx, 'Enter your pet free, with one photo', { maxWidth: CW, font: F.italic(500), maxSize: tall ? 60 : 52, floor: 36, minSize: 26, maxLines: 2, leading: 1.12 }), color: C.sun, gap: 40 },
          { rule: true, W, h: 8, gap: 40 },
          { fit: fitBlock(ctx, `Until ${closeAt}`, { maxWidth: CW, font: F.sans(700), maxSize: tall ? 44 : 38, floor: 28, minSize: 22, maxLines: 2, leading: 1.2 }), color: C.onDeep },
        ], top + 20, bottom - 20)
      },
    })
  }
  // Entries so far, or the field once entries close: a grid of the newest.
  const field = l.entries || []
  for (const which of [open && 'so-far', closed && 'field'].filter(Boolean)) {
    if (!field.length) continue
    const n = field.length
    const isField = which === 'field'
    cards.push({
      key: `launch-${which}-${n}`,
      meta: meta(isField ? 'fieldSet' : 'entriesSoFar', { count: n }),
      label: isField ? `The field: ${apCount(n, 'pet')}` : `Entries so far: ${n}`,
      file: isField ? `the-field-${n}` : `entries-so-far-${n}`,
      async draw(ctx, W, H, { brand }) {
        ground(ctx, W, H, 'light')
        const top = header(ctx, W, brand, {
          tone: 'light',
          kicker: isField ? 'Entries are closed' : 'Entries so far',
          title: isField ? `The field is set: ${apCount(n, 'pet')}` : `${apCount(n, 'pet')} entered`,
          sub: isField ? (l.votingAt ? glue(`The Open Round opens ${apDateTime(l.votingAt)}`) : null) : `Enter yours by ${closeAt}`,
        })
        const bottom = footer(ctx, W, H, o, isField ? { tone: 'light', urlLead: 'Meet them at', extra: `The top ${o.bracketSize} make the bracket` } : { tone: 'light', urlLead: 'Enter at', extra: 'Free to enter', shelter: false })
        const CW = W - M * 2
        const cols = 3
        const g = 18
        const cell = (CW - g * (cols - 1)) / cols
        const capH = 46
        const avail = bottom - top - 50
        const rows = Math.max(1, Math.min(Math.ceil(Math.min(n, 12) / cols), Math.floor((avail + g) / (cell + capH + g))))
        const shown = [...field].slice(-rows * cols).reverse()
        const photos = await Promise.all(shown.map((e) => loadPhoto(e, 500)))
        const gridH = rows * (cell + capH) + (rows - 1) * g
        const y0 = top + 26 + Math.max(0, (avail - gridH) / 2)
        shown.forEach((e, i) => {
          const x = M + (i % cols) * (cell + g)
          const y = y0 + Math.floor(i / cols) * (cell + capH + g)
          drawPhoto(ctx, photos[i], x, y, cell, cell, { radius: 18 })
          textBlock(ctx, e.pet_name, { x, y: y + cell + 8, maxWidth: cell, font: F.sans(700), color: C.ink, align: 'center', maxSize: 26, minSize: 16, floor: 20, maxLines: 1 })
        })
      },
    })
  }
  // The last two days of entries.
  const left = l.closesAt ? (Date.parse(l.closesAt) - o.now) / 3600000 : Infinity
  if (open && (l.stage === 'all' || (left > 0 && left <= 48))) {
    const lastDay = left <= 24
    cards.push({
      key: `launch-last-${lastDay ? 'day' : '48'}`,
      meta: meta('lastCall', { lastDay }),
      label: lastDay ? 'Last day to enter' : 'Last 48 hours to enter',
      file: lastDay ? 'last-day-to-enter' : 'last-48-hours-to-enter',
      draw(ctx, W, H, { brand }) {
        ground(ctx, W, H, 'dark')
        const top = header(ctx, W, brand, { tone: 'dark', kicker: 'Last call' })
        const bottom = footer(ctx, W, H, o, { tone: 'dark', urlLead: 'Enter at', extra: 'Free to enter, with one photo', shelter: false })
        const CW = W - M * 2
        const tall = H > 1500
        centerStack(ctx, [
          { fit: fitBlock(ctx, lastDay ? 'Last day to enter' : 'Two days left to enter', { maxWidth: CW, font: F.display(700), maxSize: tall ? 140 : 116, floor: 80, minSize: 56, maxLines: 2, leading: 1 }), color: '#ffffff', gap: 30 },
          { rule: true, W, h: 8, gap: 30 },
          { fit: fitBlock(ctx, `Entries close ${closeAt}`, { maxWidth: CW, font: F.italic(500), maxSize: tall ? 60 : 52, floor: 36, minSize: 26, maxLines: 2, leading: 1.12 }), color: C.sun },
        ], top + 20, bottom - 20)
      },
    })
  }
  return cards
}

// ---------------------------------------------------------------- build

// Every card worth posting right now. `s` comes from the Social tab:
//   { contest, rounds, phase, ranked, openRound, bubble, bracket: { round,
//     label, cards }, results, champion, stats, shelters, where, now }
export function buildCards(s) {
  const o = {
    where: s.where,
    // The full address, for the poster's code.
    url: s.publicUrl || null,
    splitPct: s.contest.beneficiary_split_pct,
    year: s.contest.year,
    contestName: s.contest.name || `Cutest Pet in ${NEWSROOM.region}`,
    bracketSize: s.bracketSize,
    now: s.now,
    shelterCents: s.stats?.shelter_cents || 0,
    // The shelters by name, for every card's money line.
    shelterNames: (s.shelters || s.launch?.shelters || []).map((x) => x.name).filter(Boolean),
    voting: s.phase === 'voting',
  }
  const groups = []
  if (s.launch) groups.push({ key: 'launch', title: s.launch.stage === 'closed' ? 'The field' : 'The launch', cards: launchCards(s.launch, o) })
  if (s.openRound && s.ranked?.length) {
    const final = s.openRound.status !== 'open'
    const cards = [leaderboard({ ranked: s.ranked, round: s.openRound, final }, o)]
    if (!final && s.bubble) cards.push(bubble({ ...s.bubble, round: s.openRound }, o))
    groups.push({ key: 'leaderboard', title: final ? 'Open Round standings' : 'Leaderboard', cards })
  }
  if (s.bracket?.cards.length) {
    groups.push({ key: 'matchups', title: `${s.bracket.label} matchups`, cards: s.bracket.cards.map((st) => matchup(st, s.bracket.round, s.bracket.label, o)) })
  }
  if (s.results?.winners.length && !s.results.final) {
    groups.push({ key: 'results', title: `${s.results.label} results`, cards: [field(s.results, o), ...s.results.winners.map((w) => winner(w, s.results, o))] })
  }
  if (s.lastChance?.rows.length) groups.push({ key: 'lastchance', title: 'Last Chance', cards: [lastChanceCard(s.lastChance, o)] })
  if (s.sprints?.length) groups.push({ key: 'sprints', title: 'Sprints', cards: s.sprints.map((sp) => sprintCard(sp, o)) })
  if (s.finale) groups.push({ key: 'finale', title: 'The finale', cards: [finaleCard(s.finale, o)] })
  if (s.champion?.entry) groups.push({ key: 'champion', title: 'Champion', cards: [champion(s.champion, o)] })
  if (o.shelterCents > 0) {
    const cents = s.milestone && s.milestoneCents ? s.milestoneCents : o.shelterCents
    groups.push({ key: 'raised', title: 'Raised for shelters', cards: [milestone({ cents, exact: o.shelterCents, shelters: s.shelters || [] }, o)] })
  }
  return groups
}

// A card with its own size (the poster) keeps it, whatever was asked.
export const cardSize = (card, size) => card.size || size

export function cardFile(card, size, sample) {
  const sz = cardSize(card, size)
  return fileName(sample ? 'sample' : null, card.file, `${sz.width}x${sz.height}`)
}

export function renderCard(card, asked, { scale = 1, sample = false, text = '' } = {}) {
  const size = cardSize(card, asked)
  return render({
    width: size.width,
    height: size.height,
    scale,
    text: `${card.label} ${text}`,
    draw: async (ctx, assets) => {
      await card.draw(ctx, size.width, size.height, assets)
      if (sample) sampleBands(ctx, size.width, size.height)
    },
  })
}

