// The newsroom's daily posts: leaderboard, the bubble, matchups, results,
// champion and money raised. Every card comes in 1080x1080 and 1080x1350 and
// is laid out from the edges in, so both sizes share one drawing function.
import { apDateTime, fmtMoney } from '../format.js'
import { C, F, doubleRule, drawBlock, drawFlag, drawPhoto, fillRect, fitBlock, loadPhoto, pawTexture, render, roundRect, runs, sampleBands, textBlock, trackedMeasurer } from './draw.js'
import { fileName, fmtCount, timeLeft } from './layout.js'
import { glue, leaderboardRows, matchupLine, shelterLine, winnerLines } from './content.js'

export const STAFF_SIZES = [
  { id: 'square', label: 'Square', width: 1080, height: 1080 },
  { id: 'portrait', label: 'Portrait', width: 1080, height: 1350 },
]

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
  const fine = fitBlock(ctx, [extra, shelter ? shelterLine(o.splitPct) : null].filter(Boolean).join(' · '), { maxWidth: CW, font: F.sans(600), maxSize: 22, floor: 19, minSize: 16, maxLines: 2, leading: 1.3 })
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
// `slots` keeps two side-by-side tables on the same row height.
async function table(ctx, rows, { x, y, w, h, cut = null, second, rows: slots = rows.length }) {
  const cutBand = cut != null && rows.some((r) => r.rank > cut) && rows.some((r) => r.rank <= cut) ? 52 : 0
  const rowH = Math.min(118, (h - cutBand) / slots)
  const total = rowH * rows.length + cutBand
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
        await table(ctx, rows, { ...box, x: M, w: W - M * 2, second: town })
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
      const photoY = top + 26
      const photoH = Math.max(260, Math.min(colW * 1.4, bottom - photoY - stack))
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
  const py = top + 24
  const ph = Math.max(300, Math.min(CW * 0.9, bottom - py - stack))
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
      // it, so the type never sits on (or hides) the photo.
      const names = results.winners.map((w) =>
        fitBlock(ctx, w.entry.pet_name, { maxWidth: cellW - 20, font: F.display(600), maxSize: Math.round(Math.min(38, cellW * 0.13)), floor: 20, minSize: 14, maxLines: 2, leading: 1.04 }),
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
        line3: o.shelterCents > 0 ? `${fmtMoney(o.shelterCents, { whole: true })} raised for local animal shelters` : null,
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
      const body = list ? `${pct ? `${pct}% of every vote pack` : 'A share of every vote pack'} goes to ${list}.` : `${shelterLine(o.splitPct)}.`
      const lead = rounded ? fitBlock(ctx, 'More than', { maxWidth: CW, font: F.italic(500), maxSize: 56, maxLines: 1, leading: 1.1 }) : null
      const big = fitBlock(ctx, money, { maxWidth: CW, font: F.display(700), maxSize: H > 1100 ? 300 : 260, floor: 120, minSize: 100, maxLines: 1, leading: 1 })
      const label = fitBlock(ctx, 'raised for local animal shelters', { maxWidth: CW, font: F.italic(500), maxSize: 64, floor: 48, minSize: 32, maxLines: 2, leading: 1.1 })
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

// ---------------------------------------------------------------- build

// Every card worth posting right now. `s` comes from the Social tab:
//   { contest, rounds, phase, ranked, openRound, bubble, bracket: { round,
//     label, cards }, results, champion, stats, shelters, where, now }
export function buildCards(s) {
  const o = {
    where: s.where,
    splitPct: s.contest.beneficiary_split_pct,
    year: s.contest.year,
    contestName: s.contest.name || 'Cutest Pet in Marathon County',
    bracketSize: s.bracketSize,
    now: s.now,
    shelterCents: s.stats?.shelter_cents || 0,
    voting: s.phase === 'voting',
  }
  const groups = []
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
  if (s.champion?.entry) groups.push({ key: 'champion', title: 'Champion', cards: [champion(s.champion, o)] })
  if (o.shelterCents > 0) {
    const cents = s.milestone && s.milestoneCents ? s.milestoneCents : o.shelterCents
    groups.push({ key: 'raised', title: 'Raised for shelters', cards: [milestone({ cents, exact: o.shelterCents, shelters: s.shelters || [] }, o)] })
  }
  return groups
}

export function cardFile(card, size, sample) {
  return fileName(sample ? 'sample' : null, card.file, `${size.width}x${size.height}`)
}

export function renderCard(card, size, { scale = 1, sample = false, text = '' } = {}) {
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

