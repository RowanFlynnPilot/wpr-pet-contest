// Phone captures of the contest for the walkthrough video (walkthrough.html):
// the entry form, the Open Round home page, checkout and a bracket matchup,
// from the mock API with the sample photos, at 390 px and 2x. Writes
// shots/<name>.png and shots/shots.json (each shot's size and the rects of
// the parts the video rings, in CSS px).
//
//   node docs/video/capture.mjs
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const WEB = join(HERE, '..', '..', 'web')
const SHOTS = join(HERE, 'shots')
const { chromium } = createRequire(join(WEB, 'package.json'))('playwright')
const MOCK_PORT = 18803
const PORT = 5191
const MOCK = `http://127.0.0.1:${MOCK_PORT}`
const SITE = `http://127.0.0.1:${PORT}`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const kids = []
const start = (args, env) => { const c = spawn(process.execPath, args, { cwd: WEB, env: { ...process.env, ...env }, stdio: 'ignore', windowsHide: true }); kids.push(c) }
async function waitFor(url) {
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(url)).ok) return } catch { /* not up yet */ }
    await sleep(500)
  }
  throw new Error(url)
}

await mkdir(SHOTS, { recursive: true })
start([join(WEB, 'scripts', 'mock-api.mjs')], { PORT: String(MOCK_PORT), PHASE: 'submissions' })
start([join(WEB, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
  VITE_SUPABASE_URL: MOCK, VITE_SUPABASE_ANON_KEY: 'mock-anon-key', VITE_STRIPE_PUBLISHABLE_KEY: '', VITE_PUBLIC_URL: '', VITE_IMAGE_TRANSFORMS: 'false', VITE_TURNSTILE_SITE_KEY: '', VITE_MOCK_CHECKOUT: 'true', VITE_DATA_TOGGLE: 'off',
})
const out = {}
try {
  await waitFor(`${MOCK}/__phase`)
  await waitFor(SITE)
  const browser = await chromium.launch({ channel: 'msedge' })
  const rect = (page, sel) => page.locator(sel).first().evaluate((el) => { const b = el.getBoundingClientRect(); return { x: b.x + scrollX, y: b.y + scrollY, w: b.width, h: b.height } })

  async function shot(name, { phase, path, full = false, prepare, parts = {}, bonus = false }) {
    await fetch(`${MOCK}/__phase?set=${phase}`)
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
    const page = await ctx.newPage()
    // No Double Vote Hour, so the packs read at their real counts, and no
    // sponsor bars: readers must never see a made-up sponsor.
    const none = (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    if (!bonus) await page.route('**/bonus_windows*', none)
    await page.route('**/sponsor_matches*', none)
    // The real entry deadline (Friday, Nov. 20), never a sample date a reader
    // could take for it.
    await page.route('**/rest/v1/contests*', async (route) => {
      const res = await route.fetch()
      const rows = await res.json()
      for (const r of [].concat(rows)) if (r && phase === 'submissions') r.submissions_close_at = '2026-11-21T05:59:00Z'
      // The finale's real night, Saturday, Dec. 5 at 8 p.m., not a sample date.
      for (const r of [].concat(rows)) if (r && r.finale_at) r.finale_at = '2026-12-06T02:00:00Z'
      await route.fulfill({ response: res, json: rows })
    })
    // No money counter: before launch a sample "raised" figure reads as real.
    await page.addInitScript(() => document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = '.raised{display:none!important}'; document.head.append(st) }))
    await page.goto(`${SITE}/${path}`)
    await page.waitForLoadState('networkidle')
    await page.evaluate(() => document.fonts.ready)
    await sleep(900)
    if (prepare) await prepare(page)
    // Every lazy photo in, then back to the top.
    const h = await page.evaluate(() => document.documentElement.scrollHeight)
    for (let y = 0; y < h; y += 500) { await page.evaluate((y) => window.scrollTo(0, y), y); await sleep(80) }
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 15000 }).catch(() => {})
    await sleep(600)
    const rects = {}
    for (const [k, sel] of Object.entries(parts)) rects[k] = await rect(page, sel)
    await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: full })
    const size = full ? { w: 390, h: await page.evaluate(() => document.documentElement.scrollHeight) } : { w: 390, h: 844 }
    out[name] = { ...size, parts: rects }
    console.log('ok', name, JSON.stringify(out[name]))
    await ctx.close()
  }

  await shot('enter', { phase: 'submissions', path: '#/enter', full: true, parts: { photo: '.field, .photo-pick, input[type=file]' } })
  await shot('home', { phase: 'open', path: '#/', full: true, parts: { board: '.scoreboard', top16: 'section:has(#top16-title), section:has(h2:text("top 16"))' } })
  // Checkout: a pet a little down the board, the cheer left closed, no bonus
  // running, so the packs show the real ladder (5 votes for $5 to 600 for $250).
  const pets = await (await fetch(`${MOCK}/rest/v1/entries?select=id&status=eq.approved&order=created_at`)).json()
  await shot('checkout', {
    phase: 'open', path: `#/pet/${pets[4].id}`,
    prepare: async (page) => {
      await page.getByRole('button', { name: /^Vote for/ }).first().click()
      await page.getByRole('dialog').waitFor()
      await sleep(900)
    },
    parts: { impact: '.pack-impact', packs: '.packs' },
    bonus: false,
  })
  await shot('bracket', { phase: 'bracket', path: '#/', full: true, parts: { matchup: '.scoreboard' } })
  await browser.close()
} finally {
  for (const c of kids) spawn('taskkill', ['/pid', String(c.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
  await writeFile(join(SHOTS, 'shots.json'), JSON.stringify(out, null, 1))
}
