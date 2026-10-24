// Sponsor-kit mock-ups: the contest app against the mock API, each shot with
// its placement ringed and a mock-up label underneath. Writes
// <outDir>/<shot>.png (and <outDir>/raw/); copy the PNGs into
// docs/sponsor-kit/assets/ as mockup-<shot>.png, then run build.py.
//
//   PORT=8795 node web/scripts/mock-api.mjs
//   cd web && VITE_SUPABASE_URL=http://127.0.0.1:8795 VITE_SUPABASE_ANON_KEY=mock npx vite --port 5185
//   node docs/sponsor-kit/src/capture.mjs <absolute outDir> [shotName ...]
//
// Slot shots use sales demo mode (?demo), with only the featured slot left in
// frame. Double Vote shots run without demo mode, so the unsold slots show
// what readers would really see (an upsell) and only the window's credit
// carries the placeholder. The buyer's thank-you screen is not sold, so it
// has no shot.
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
const require = createRequire(new URL('../../../web/package.json', import.meta.url))
const { chromium } = require('playwright')

// Override to shoot against servers already running, e.g.
//   KIT_APP=http://127.0.0.1:5180/ KIT_API=http://127.0.0.1:8787 KIT_NO_PHASE_WRITE=1
// KIT_NO_PHASE_WRITE refuses to switch a shared mock's phase: a shot needing
// another phase fails instead of changing someone else's mock under them.
const APP = process.env.KIT_APP || 'http://127.0.0.1:5185/'
const API = process.env.KIT_API || 'http://127.0.0.1:8795'
const NO_PHASE_WRITE = process.env.KIT_NO_PHASE_WRITE === '1'
const OUT = process.argv[2]
const ONLY = process.argv.slice(3)
mkdirSync(`${OUT}/raw`, { recursive: true })

const PLACEHOLDER = 'Your Business Here'
const TAG_WHAT = 'Your tagline goes here'
const TAG_WHERE = 'Your address'
const LABEL = 'MOCK-UP — for discussion, not final creative · Sample data: the pets, vote counts and dollar figures are not real'

const browser = await chromium.launch({ channel: 'msedge' })

async function setPhase(p) {
  const now = await (await fetch(`${API}/__phase`)).json()
  if (now.phase === p) return
  if (NO_PHASE_WRITE) throw new Error(`mock is in phase "${now.phase}", shot needs "${p}" (KIT_NO_PHASE_WRITE is set)`)
  const r = await fetch(`${API}/__phase?set=${p}`)
  if (!r.ok) throw new Error(`phase ${p}: ${r.status}`)
}

async function open({ url, width, height, phase, bonus }) {
  await setPhase(phase)
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  await page.route(`${API}/**`, async (route) => {
    if (!bonus && route.request().url().includes('bonus_windows')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    }
    const res = await route.fetch()
    const body = (await res.text()).replaceAll('Example Pet Supply', PLACEHOLDER)
    return route.fulfill({ response: res, body })
  })
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  return { ctx, page }
}

// What a reader would see with the slot sold to a business with no logo yet:
// no demo ribbon, no "· preview", a tagline where the demo puts the address.
async function normalize(page) {
  await page.evaluate(
    ({ PLACEHOLDER, TAG_WHAT, TAG_WHERE }) => {
      document.querySelectorAll('.demo-ribbon').forEach((n) => n.remove())
      const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      const nodes = []
      while (walk.nextNode()) nodes.push(walk.currentNode)
      for (const n of nodes) {
        let t = n.nodeValue
        t = t.replaceAll('Your Brand Here', PLACEHOLDER).replace(' · preview', '')
        if (t.trim() === 'This placement is open') t = TAG_WHAT
        if (t.trim() === 'weber.chris@wausaupilotandreview.com' && n.parentElement?.closest('.sponsor-tag')) t = TAG_WHERE
        if (t !== n.nodeValue) n.nodeValue = t
      }
    },
    { PLACEHOLDER, TAG_WHAT, TAG_WHERE },
  )
}

async function settleImages(page) {
  const h = await page.evaluate(() => document.documentElement.scrollHeight)
  for (let y = 0; y < h; y += 600) {
    await page.evaluate((y) => window.scrollTo(0, y), y)
    await page.waitForTimeout(60)
  }
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 15000 }).catch(() => console.log('  (some images did not load)'))
  await page.waitForTimeout(500)
}

async function rectOf(page, sel, nth = 0) {
  const loc = page.locator(sel)
  const n = await loc.count()
  if (n <= nth) throw new Error(`selector ${sel} matched ${n}`)
  return loc.nth(nth).evaluate((el) => {
    const b = el.getBoundingClientRect()
    return { x: b.x + window.scrollX, y: b.y + window.scrollY, width: b.width, height: b.height }
  })
}

// Ring each target and put the label (placement name first) under the picture.
async function compose(name, rawPath, clip, rings, placement) {
  const b64 = readFileSync(rawPath).toString('base64')
  const W = Math.round(clip.width)
  const H = Math.round(clip.height)
  const ringHtml = rings
    .map((r) => {
      const pad = 5
      return `<div class="ring" style="left:${r.x - clip.x - pad}px;top:${r.y - clip.y - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px"></div>`
    })
    .join('')
  const html = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Public+Sans:wght@600;800&display=swap" rel="stylesheet">
<style>
html,body{margin:0;background:#fff}
.frame{position:relative;width:${W}px;height:${H}px;overflow:hidden}
.frame img{display:block;width:${W}px;height:${H}px}
.ring{position:absolute;border:3px solid #f4b942;border-radius:12px;box-shadow:0 0 0 2px rgba(255,255,255,.9),0 0 0 6px rgba(244,185,66,.3)}
.label{width:${W}px;box-sizing:border-box;padding:8px 11px;background:#1f4b45;color:#e3efec;font:600 ${W < 500 ? 10.5 : 12}px/1.4 'Public Sans',sans-serif;letter-spacing:.02em}
.label b{color:#f4b942;font-weight:800}
</style></head><body><div class="frame"><img src="data:image/png;base64,${b64}">${ringHtml}</div><div class="label"><b>${placement} (ringed in gold)</b> · ${LABEL}</div></body></html>`
  const ctx = await browser.newContext({ viewport: { width: W, height: 200 }, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  await page.setContent(html, { waitUntil: 'networkidle' })
  await page.waitForTimeout(300)
  const h = await page.evaluate(() => Math.ceil(document.body.getBoundingClientRect().height))
  await page.screenshot({ path: `${OUT}/${name}.png`, clip: { x: 0, y: 0, width: W, height: h }, fullPage: true })
  await ctx.close()
}

async function clipShot(page, name, clip) {
  const raw = `${OUT}/raw/${name}.png`
  await page.screenshot({ path: raw, clip, fullPage: true })
  return raw
}

const D = { width: 1440, height: 900 }
const M = { width: 390, height: 844 }

async function galleryShot(name, { size, fromHeading, below }) {
  const { ctx, page } = await open({ url: `${APP}?demo#/gallery`, ...size, phase: 'open', bonus: false })
  await normalize(page)
  await settleImages(page)
  const card = await rectOf(page, '.grid-break .sponsor-card')
  const grid = await rectOf(page, '.grid:has(.grid-break)')
  if (card.y < grid.y + 100) throw new Error('gallery: sponsor card is not after a row of photos')
  const top = fromHeading ? (await rectOf(page, 'main h1')).y - 24 : grid.y - 40
  const y = Math.max(0, Math.round(top))
  const clip = { x: 0, y, width: size.width, height: Math.round(card.y + card.height + below - y) }
  const raw = await clipShot(page, name, clip)
  await compose(name, raw, clip, [card], 'Gallery sponsor')
  await ctx.close()
}

// A lockup card shot: from just above the page heading to below the card.
async function cardShot(name, { url, size, phase, placement, below }) {
  const { ctx, page } = await open({ url, ...size, phase, bonus: false })
  await normalize(page)
  await settleImages(page)
  const h1 = await rectOf(page, 'main h1')
  const card = await rectOf(page, '.sponsor-card.full')
  const y = Math.max(0, Math.round(h1.y - 24))
  const clip = { x: 0, y, width: size.width, height: Math.round(card.y + card.height + below - y) }
  const raw = await clipShot(page, name, clip)
  await compose(name, raw, clip, [card], placement)
  await ctx.close()
}

const SHOTS = {
  // Presenting: the credit in the contest bar, on an inner page.
  async 'presenting-bar-desktop'() {
    const { ctx, page } = await open({ url: `${APP}?demo#/gallery`, ...D, phase: 'open', bonus: false })
    await normalize(page)
    await settleImages(page)
    const credit = await rectOf(page, '.banner .banner-status:has-text("Presented by")')
    const h1 = await rectOf(page, 'main h1')
    const clip = { x: 0, y: 0, width: 1440, height: Math.round(h1.y + h1.height + 24) }
    const raw = await clipShot(page, 'presenting-bar-desktop', clip)
    await compose('presenting-bar-desktop', raw, clip, [credit], 'Presenting sponsor')
    await ctx.close()
  },

  // Presenting: the same credit on a phone, where it wraps under the title.
  async 'presenting-bar-mobile'() {
    const { ctx, page } = await open({ url: `${APP}?demo#/gallery`, ...M, phase: 'open', bonus: false })
    await normalize(page)
    await settleImages(page)
    const credit = await rectOf(page, '.banner .banner-credit')
    const h1 = await rectOf(page, 'main h1')
    const clip = { x: 0, y: 0, width: 390, height: Math.round(h1.y + h1.height + 24) }
    const raw = await clipShot(page, 'presenting-bar-mobile', clip)
    await compose('presenting-bar-mobile', raw, clip, [credit], 'Presenting sponsor')
    await ctx.close()
  },

  // Presenting: the full lockup on the home page.
  async 'presenting-home-desktop'() {
    const { ctx, page } = await open({ url: `${APP}?demo#/`, ...D, phase: 'open', bonus: false })
    await normalize(page)
    await settleImages(page)
    const card = await rectOf(page, 'section[aria-label="Presenting sponsor"] .sponsor-card')
    const clip = { x: 0, y: Math.round(card.y - 200), width: 1440, height: Math.round(card.height + 200 + 230) }
    const raw = await clipShot(page, 'presenting-home-desktop', clip)
    await compose('presenting-home-desktop', raw, clip, [card], 'Presenting sponsor')
    await ctx.close()
  },

  async 'presenting-home-mobile'() {
    const { ctx, page } = await open({ url: `${APP}?demo#/`, ...M, phase: 'open', bonus: false })
    await normalize(page)
    await settleImages(page)
    const card = await rectOf(page, 'section[aria-label="Presenting sponsor"] .sponsor-card')
    const clip = { x: 0, y: Math.round(card.y - 300), width: 390, height: Math.round(card.height + 300 + 250) }
    const raw = await clipShot(page, 'presenting-home-mobile', clip)
    await compose('presenting-home-mobile', raw, clip, [card], 'Presenting sponsor')
    await ctx.close()
  },

  // Presenting: the footer of the article widget that runs in WPR stories.
  async 'presenting-widget'() {
    const { ctx, page } = await open({ url: `${APP}widget.html?demo`, width: 400, height: 700, phase: 'open', bonus: false })
    await normalize(page)
    await settleImages(page)
    const card = await rectOf(page, '.w-card')
    const credit = await rectOf(page, '.w-sponsor')
    const clip = { x: 0, y: 0, width: 400, height: Math.round(card.y + card.height + 12) }
    const raw = await clipShot(page, 'presenting-widget', clip)
    await compose('presenting-widget', raw, clip, [credit], 'Presenting sponsor')
    await ctx.close()
  },

  // Presenting: the contest block staff paste into the daily newsletters.
  async 'presenting-newsletter'() {
    await newsletterShot('presenting-newsletter', false)
  },

  // The gallery slot is a full-width .grid-break after the first full row of
  // photos (2/3/4 per row; one fewer in the Open Round, when the leader's card
  // spans two cells), so the shot keeps that row in frame above the card.
  async 'gallery-desktop'() {
    await galleryShot('gallery-desktop', { size: D, fromHeading: true, below: 200 })
  },
  async 'gallery-mobile'() {
    await galleryShot('gallery-mobile', { size: M, fromHeading: false, below: 230 })
  },
  async 'bracket-desktop'() {
    await cardShot('bracket-desktop', { url: `${APP}?demo#/bracket`, size: D, phase: 'bracket', placement: 'Bracket sponsor', below: 420 })
  },
  async 'bracket-mobile'() {
    await cardShot('bracket-mobile', { url: `${APP}?demo#/bracket`, size: M, phase: 'bracket', placement: 'Bracket sponsor', below: 380 })
  },

  // Double Vote: the site-wide bar, on the gallery. No demo mode.
  async 'bonus-bar-desktop'() {
    const { ctx, page } = await open({ url: `${APP}#/gallery`, ...D, phase: 'open', bonus: true })
    await normalize(page)
    await settleImages(page)
    const bar = await rectOf(page, '.bonus-bar')
    const h1 = await rectOf(page, 'main h1')
    const clip = { x: 0, y: 0, width: 1440, height: Math.round(h1.y + h1.height + 24) }
    const raw = await clipShot(page, 'bonus-bar-desktop', clip)
    await compose('bonus-bar-desktop', raw, clip, [{ ...bar, x: bar.x + 8, width: bar.width - 16 }], 'Double Vote sponsor')
    await ctx.close()
  },

  async 'bonus-bar-mobile'() {
    const { ctx, page } = await open({ url: `${APP}#/gallery`, ...M, phase: 'open', bonus: true })
    await normalize(page)
    await settleImages(page)
    const bar = await rectOf(page, '.bonus-bar')
    const h1 = await rectOf(page, 'main h1')
    const clip = { x: 0, y: 0, width: 390, height: Math.round(h1.y + h1.height + 24) }
    const raw = await clipShot(page, 'bonus-bar-mobile', clip)
    await compose('bonus-bar-mobile', raw, clip, [{ ...bar, x: bar.x + 6, width: bar.width - 12 }], 'Double Vote sponsor')
    await ctx.close()
  },

  async 'bonus-widget'() {
    const { ctx, page } = await open({ url: `${APP}widget.html`, width: 400, height: 700, phase: 'open', bonus: true })
    await normalize(page)
    await settleImages(page)
    const card = await rectOf(page, '.w-card')
    const line = await rectOf(page, '.w-bonus')
    const clip = { x: 0, y: 0, width: 400, height: Math.round(card.y + card.height + 12) }
    const raw = await clipShot(page, 'bonus-widget', clip)
    await compose('bonus-widget', raw, clip, [line], 'Double Vote sponsor')
    await ctx.close()
  },

  async 'bonus-checkout-mobile'() {
    const { ctx, page } = await openCheckout({ width: 390, height: 1400 }, { bonus: true, demo: false })
    const note = await rectOf(page, '.modal .notice.warn')
    const modal = await rectOf(page, '.modal')
    const clip = { x: 0, y: Math.round(modal.y), width: 390, height: Math.round(note.y - modal.y + note.height + 330) }
    const raw = await clipShot(page, 'bonus-checkout-mobile', clip)
    await compose('bonus-checkout-mobile', raw, clip, [note], 'Double Vote sponsor')
    await ctx.close()
  },

  async 'bonus-newsletter'() {
    await newsletterShot('bonus-newsletter', true)
  },
}

async function openCheckout(size, { bonus, demo }) {
  const q = demo ? '?demo' : ''
  const { ctx, page } = await open({ url: `${APP}${q}#/gallery`, ...size, phase: 'open', bonus })
  const href = await page.locator('a[href^="#/pet/"]').first().getAttribute('href')
  await page.goto(`${APP}${q}${href}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)
  await page.locator('main button.btn-primary', { hasText: /vote/i }).first().click()
  await page.waitForSelector('.modal', { timeout: 10000 })
  await page.waitForTimeout(800)
  await normalize(page)
  await page.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 10000 }).catch(() => {})
  return { ctx, page }
}

async function newsletterShot(name, bonus) {
  const { ctx, page } = await open({ url: `${APP}#/`, width: 700, height: 900, phase: 'open', bonus })
  const html = await page.evaluate(
    async ({ PLACEHOLDER, bonus }) => {
      const { gatherNewsletter } = await import('/src/admin/NewsletterBlock.jsx')
      const { buildNewsletterBlock } = await import('/src/lib/newsletter.js')
      const { fetchContests } = await import('/src/lib/api.js')
      const { pickActiveContest } = await import('/src/lib/phase.js')
      const contest = pickActiveContest(await fetchContests())
      const model = await gatherNewsletter(contest, Date.now())
      return buildNewsletterBlock(model, {
        base: `${location.origin}/`,
        campaign: 'morning-demo',
        sponsor: bonus ? null : { name: PLACEHOLDER, url: null },
      })
    },
    { PLACEHOLDER, bonus },
  )
  if (!html) throw new Error('newsletter: empty block')
  const marked = bonus
    ? html.includes(`Presented by ${PLACEHOLDER}.</td>`)
      ? html.replace('<td bgcolor="#FED850"', '<td id="hl" bgcolor="#FED850"')
      : html
    : html.replace(`<b>${PLACEHOLDER}</b>`, `<b id="hl">${PLACEHOLDER}</b>`)
  if (!marked.includes('id="hl"')) throw new Error('newsletter: sponsor credit not found')
  const doc =
    '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" ' +
    'href="https://fonts.googleapis.com/css2?family=Merriweather:wght@700&family=Oswald:wght@600;700&family=Source+Sans+3:wght@400;700&display=swap">' +
    '</head><body style="margin:0;padding:16px 0;background:#f6f2e9;">' +
    marked +
    '</body></html>'
  writeFileSync(`${OUT}/raw/${name}.html`, doc)
  const p2 = await ctx.newPage()
  await p2.setViewportSize({ width: 640, height: 300 })
  await p2.goto(`file:///${OUT}/raw/${name}.html`, { waitUntil: 'networkidle' })
  await p2.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 10000 }).catch(() => {})
  await p2.waitForTimeout(600)
  const r = await rectOf(p2, '#hl')
  const h = await p2.evaluate(() => Math.ceil(document.body.getBoundingClientRect().height))
  const clip = { x: 0, y: 0, width: 640, height: h }
  const raw = await clipShot(p2, name, clip)
  await compose(name, raw, clip, [r], bonus ? 'Double Vote sponsor' : 'Presenting sponsor')
  await ctx.close()
}

const names = ONLY.length ? ONLY : Object.keys(SHOTS)
const failed = []
for (const n of names) {
  try {
    await SHOTS[n]()
    console.log('ok  ', n)
  } catch (e) {
    failed.push(n)
    console.log('FAIL', n, e.message.split('\n')[0])
  }
}
await setPhase('open')
await browser.close()
if (failed.length) process.exitCode = 1
