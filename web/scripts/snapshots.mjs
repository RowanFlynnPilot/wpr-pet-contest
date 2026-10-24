// Screenshots of every public page in every phase, for showing the newsroom
// how the contest looks today: docs/preview/current-look.html, one file that
// carries its own images, plus the PNGs beside it.
//
//   npm --prefix web run snapshots
//   VOTE_SCALE=100 npm --prefix web run snapshots   # five-figure counts
//
// Runs the mock API and a dev server itself (no Supabase, no Docker) and
// drives the installed Edge; PW_CHANNEL=chromium uses Playwright's own.
// Everything on the pages is placeholder data: drawn pets, made-up towns and
// totals, the real partner shelter.

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

/* global document, window -- inside page.evaluate, which runs in the browser */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, '..', 'docs', 'preview')
const MOCK_PORT = 18795
const PORT = 5179
const MOCK = `http://127.0.0.1:${MOCK_PORT}`
const SITE = `http://127.0.0.1:${PORT}`
const OWNER_TOKEN = '11111111-1111-1111-1111-111111111111'
const DESKTOP = { width: 1280, height: 900 }
const PHONE = { width: 390, height: 844 }

// What each phase is, in a sentence or two, for the person reading the file.
const PHASES = [
  ['submissions', 'Week 1: entries open', 'Owners enter one photo, a name and a town. Nothing is public until staff approve it. The money counter sits at zero and the site explains how the contest works.'],
  ['open', 'Week 2: the Open Round', 'Every approved pet is on the board. Readers buy vote packs (or cast the free daily vote, if that is switched on); the top 16 make the bracket. A sponsored Double Vote Hour is running in these shots.'],
  ['bracket', 'Weeks 3 and 4: the bracket', 'Sweet 16, Elite Eight, Final Four, Championship: two days a round, head to head, and every total starts over. A sponsor match hour is running in these shots.'],
  ['complete', 'After the final', 'The champion, the full results, the side awards and the final total for the shelters. The site stays up as the record of the year.'],
]

// Each shot: a route (or a special), a title, and what to look for.
const SHOTS = {
  submissions: [
    ['', 'Home', 'The masthead, the countdown to voting, the shelter goal meter and the entry call. The strip at the top says where the contest is.'],
    ['enter', 'Enter a pet', 'Phone-first: the photo picker opens the camera roll, the release is one paragraph, and WPR staff households are told they cannot enter.'],
    ['rules', 'Rules', 'The published rules, including the split, the reset every round, withdrawals, the free daily vote (only if it is on) and the privacy promise.'],
    ['shelters', 'Shelters', 'Moments Foster Care, called out with a Follow on Facebook button, and where the money goes.'],
  ],
  open: [
    ['', 'Home', 'The live top 16 with the cut line, the money counter, the bonus bar for the Double Vote Hour, and recent activity.'],
    ['gallery', 'All pets', 'Every pet, with a heart to save favorites on this phone, a share button on each card, and filters by species and town.'],
    ['pet', 'A pet page', 'The Open Round scoreboard: this pet’s votes, its rank, how far it is from the cut, the vote button, the free daily vote, and “Remind me before voting closes.”'],
    ['checkout', 'Checkout', 'Vote packs, never a donation. The receipt email, the “tell me when this pet plays again” box (unchecked), and the newsletter box.'],
    ['bracket', 'The bracket, projected', 'If voting ended now: who would be seeded where. It fills in for real when the Open Round closes.'],
    ['widget', 'The article widget', 'The compact version that sits inside a WordPress article: the leaders and a vote button.'],
  ],
  bracket: [
    ['', 'Home', 'The round’s matchups, the closest race, the money counter with the sponsor match included, and the match hour bar.'],
    ['bracket', 'The bracket', 'All four rounds, winners carried forward, the live round lit.'],
    ['pet', 'A pet page in a matchup', 'Head to head with the opponent, the tug bar, the road through the bracket, the owner’s vote goal, and sharing that previews both pets.'],
    ['owner', 'The owner’s panel', 'What the link in the approval email opens: set or change the goal, and a reminder of the share tools.'],
    ['shelters', 'Shelters', 'The same page during voting, with the running total.'],
  ],
  complete: [
    ['', 'Home after the final', 'The champion, the final total, and thanks.'],
    ['results', 'Results', 'The full bracket, the Open Round standings and the side awards (biggest upset, best comeback, hometown favorite).'],
    ['sponsors', 'Sponsors', 'Where sponsors are credited, and the open slots.'],
  ],
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitFor(url, label) {
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {
      // not up yet
    }
    await sleep(500)
  }
  throw new Error(`${label} did not come up at ${url}`)
}

function start(args, env, label) {
  const child = spawn(process.execPath, args, { cwd: ROOT, env: { ...process.env, ...env }, stdio: 'ignore', windowsHide: true })
  child.on('exit', (code) => {
    if (code && !stopping) console.warn(`[snapshots] ${label} exited with ${code}`)
  })
  return child
}

let stopping = false
function stop(child) {
  if (!child || child.exitCode !== null) return
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
  else child.kill()
}

async function settle(page) {
  await page.waitForLoadState('networkidle')
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), null, { timeout: 15000 }).catch(() => {})
  await page.evaluate(() => document.fonts.ready)
  await sleep(400)
}

// A whole page, but no more than MAX_HEIGHT of it: the rules run long, and
// the file carries every image inside it.
const MAX_HEIGHT = 3200
async function shoot(page, file, { fullPage = true } = {}) {
  if (fullPage) {
    const height = await page.evaluate(() => document.documentElement.scrollHeight)
    const { width } = page.viewportSize()
    await page.setViewportSize({ width, height: Math.min(MAX_HEIGHT, Math.max(height, 600)) })
    await page.evaluate(() => window.scrollTo(0, 0))
    await sleep(250)
  }
  await page.screenshot({ path: file, type: 'jpeg', quality: 66 })
}

async function capture(browser, phase, route, petId, stamp) {
  const files = {}
  for (const [kind, viewport, mobile] of [['desktop', DESKTOP, false], ['phone', PHONE, true]]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: mobile ? 1.5 : 1, isMobile: mobile, hasTouch: mobile, reducedMotion: 'reduce' })
    const page = await context.newPage()
    let url = `${SITE}/#/${route}`
    if (route === 'pet' || route === 'checkout') url = `${SITE}/#/pet/${petId}`
    if (route === 'owner') url = `${SITE}/#/pet/${petId}?owner=${OWNER_TOKEN}`
    if (route === 'widget') url = `${SITE}/widget.html`
    await page.goto(url)
    await settle(page)
    let fullPage = true
    if (route === 'checkout') {
      await page.getByRole('button', { name: /^Vote for/ }).first().click()
      await page.getByRole('dialog').waitFor()
      await sleep(400)
      fullPage = false
    }
    if (route === 'owner') {
      await page.locator('.owner-tools').scrollIntoViewIfNeeded()
      await sleep(200)
    }
    const name = `${stamp}-${phase}-${route || 'home'}-${kind}.jpg`
    await shoot(page, join(OUT, name), { fullPage })
    files[kind] = name
    await context.close()
  }
  return files
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

async function dataUri(file) {
  const buf = await readFile(join(OUT, file))
  const type = file.endsWith('.png') ? 'image/png' : 'image/jpeg'
  return `data:${type};base64,${buf.toString('base64')}`
}

async function html(sections, extras, date) {
  const toc = sections.map(([id, title]) => `<li><a href="#${id}">${esc(title)}</a></li>`).join('')
  let body = ''
  for (const [id, title, intro, shots] of sections) {
    body += `<section id="${id}"><h2>${esc(title)}</h2><p class="intro">${esc(intro)}</p>`
    for (const s of shots) {
      body += `<figure class="shot"><figcaption><strong>${esc(s.title)}</strong> ${esc(s.note)}</figcaption><div class="pair"><img class="desktop" src="${await dataUri(s.files.desktop)}" alt="${esc(s.title)}, desktop" loading="lazy"><img class="phone" src="${await dataUri(s.files.phone)}" alt="${esc(s.title)}, phone" loading="lazy"></div></figure>`
    }
    body += '</section>'
  }
  if (extras.length) {
    body += '<section id="cards"><h2>What a share looks like</h2><p class="intro">Facebook and X show these when someone shares a link. The pet card is the default; during the bracket a share from a pet’s page shows the matchup instead.</p>'
    for (const e of extras) body += `<figure class="shot card"><figcaption><strong>${esc(e.title)}</strong> ${esc(e.note)}</figcaption><img src="${await dataUri(e.file)}" alt="${esc(e.title)}" loading="lazy"></figure>`
    body += '</section>'
  }
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cutest Pet in Marathon County: how it looks today</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,650&family=Public+Sans:wght@400;600;800&display=swap" rel="stylesheet">
<style>
:root { --teal: #3a867c; --teal-deep: #1f4b45; --cream: #f6f2e9; --ink: #1a1a1a; --muted: #5b5b5b; --rule: #e3ddd0; --sun: #f4b942; }
body { margin: 0; background: var(--cream); color: var(--ink); font: 16px/1.55 'Public Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
header { background: var(--teal-deep); color: #fff; padding: 36px 20px 30px; border-top: 8px solid var(--sun); }
.wrap { max-width: 1180px; margin: 0 auto; padding: 0 20px; }
h1 { font: 650 clamp(30px, 5vw, 48px)/1.05 'Fraunces', Georgia, serif; margin: 0 0 10px; }
header p { margin: 6px 0 0; color: #cfe3de; max-width: 760px; }
.kicker { font-size: 12px; font-weight: 800; letter-spacing: 0.16em; text-transform: uppercase; color: var(--sun); margin-bottom: 10px; }
nav ol { display: flex; flex-wrap: wrap; gap: 8px 18px; padding: 0; margin: 18px 0 0; list-style: none; }
nav a { color: #fff; font-weight: 600; text-decoration: none; border-bottom: 2px solid rgba(255,255,255,0.35); }
h2 { font: 650 30px/1.1 'Fraunces', Georgia, serif; color: var(--teal-deep); margin: 44px 0 6px; }
.intro { color: var(--muted); max-width: 760px; margin: 0 0 18px; }
.shot { margin: 0 0 28px; background: #fff; border: 1px solid var(--rule); border-radius: 14px; padding: 16px; box-shadow: 0 10px 24px -20px rgba(31,75,69,0.6); }
.shot figcaption { margin: 0 0 12px; max-width: 900px; }
.shot figcaption strong { font: 650 19px/1.2 'Fraunces', Georgia, serif; color: var(--teal-deep); display: block; margin-bottom: 2px; }
.pair { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 16px; align-items: start; }
.pair img { width: 100%; height: auto; border: 1px solid var(--rule); border-radius: 8px; background: #fff; }
.card img { max-width: 720px; width: 100%; border-radius: 10px; border: 1px solid var(--rule); }
footer { margin: 50px 0 40px; color: var(--muted); font-size: 14px; border-top: 1px solid var(--rule); padding-top: 16px; }
@media (max-width: 760px) { .pair { grid-template-columns: 1fr; } .pair .phone { max-width: 320px; } }
</style>
</head>
<body>
<header><div class="wrap">
<div class="kicker">Wausau Pilot &amp; Review · Reader contest</div>
<h1>Cutest Pet in Marathon County: how it looks today</h1>
<p>Captured ${esc(date)} from the current build, on a laptop and on a phone, in each phase of the contest. The pets, towns and totals are placeholders; the partner shelter, the vote packs, the copy and the rules are real. Not shown: the staff panel (moderation, rounds, emails, payouts) and the emails themselves.</p>
<p>This is year one of a contest WPR plans to run every year. The engine is built for that: next year&rsquo;s contest starts as a copy of this year&rsquo;s packs and shelters, each year&rsquo;s results stay up as the record, and the same share pages, emails and sponsor placements come back with new pets.</p>
<nav><ol>${toc}${extras.length ? '<li><a href="#cards">Share cards</a></li>' : ''}</ol></nav>
</div></header>
<main class="wrap">${body}</main>
<footer class="wrap">Generated by <code>npm --prefix web run snapshots</code> against the mock API. Wausau Pilot &amp; Review · 715-301-5539</footer>
</body>
</html>
`
}

async function main() {
  await mkdir(OUT, { recursive: true })
  const stamp = new Date().toISOString().slice(0, 10)
  const mock = start([join(ROOT, 'scripts', 'mock-api.mjs')], { PORT: String(MOCK_PORT), PHASE: 'submissions' }, 'mock API')
  const vite = start(
    [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
    { VITE_SUPABASE_URL: MOCK, VITE_SUPABASE_ANON_KEY: 'mock-anon-key', VITE_STRIPE_PUBLISHABLE_KEY: '', VITE_PUBLIC_URL: '', VITE_IMAGE_TRANSFORMS: 'false', VITE_TURNSTILE_SITE_KEY: '' },
    'dev server',
  )
  const cleanup = () => {
    stopping = true
    stop(vite)
    stop(mock)
  }
  process.on('SIGINT', () => {
    cleanup()
    process.exit(130)
  })
  try {
    await waitFor(`${MOCK}/rest/v1/contests`, 'the mock API')
    await waitFor(SITE, 'the dev server')
    const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'msedge' })
    const sections = []
    for (const [phase, title, intro] of PHASES) {
      await fetch(`${MOCK}/__phase?set=${phase}`)
      const rows = await (await fetch(`${MOCK}/rest/v1/entries?select=id&status=eq.approved&order=created_at&limit=1`)).json()
      const petId = rows[0]?.id
      const shots = []
      for (const [route, shotTitle, note] of SHOTS[phase]) {
        console.log(`[snapshots] ${phase}: ${shotTitle}`)
        shots.push({ title: shotTitle, note, files: await capture(browser, phase, route, petId, stamp) })
      }
      sections.push([phase, title, intro, shots])
    }
    await browser.close()

    const extras = []
    const og = join(ROOT, 'public', 'og-card.png')
    if (existsSync(og)) {
      await writeFile(join(OUT, `${stamp}-og-card.png`), await readFile(og))
      extras.push({ title: 'The contest card', note: 'The preview for the contest link itself.', file: `${stamp}-og-card.png` })
    }
    const cardsDir = join(ROOT, 'dist', 'm')
    if (existsSync(cardsDir)) {
      const dirs = (await readdir(cardsDir, { withFileTypes: true })).filter((d) => d.isDirectory())
      const first = dirs.map((d) => join(cardsDir, d.name, 'card.png')).find((f) => existsSync(f))
      if (first) {
        await writeFile(join(OUT, `${stamp}-matchup-card.png`), await readFile(first))
        extras.push({ title: 'A matchup card', note: 'Drawn at deploy time for every live matchup: both pets, seeds, the round and the deadline. These two are placeholders; real pets get their photos.', file: `${stamp}-matchup-card.png` })
      }
    }

    const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' })
    const file = join(OUT, 'current-look.html')
    await writeFile(file, await html(sections, extras, date))
    console.log(`[snapshots] wrote ${file}`)
  } finally {
    cleanup()
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
