// Per-pet share pages: dist/p/<id>/index.html, written after `vite build`.
// Per-matchup share pages: dist/m/<id>/index.html, with a card drawn by
// scripts/matchup-cards.py showing both pets and the deadline.
//
// Facebook and X read Open Graph tags from the HTML they fetch and never run
// JavaScript, so a hash route inside the app (#/pet/<id>) previews as the
// generic contest card. Each pet gets a tiny static page carrying its own
// photo and name, which then sends the person on to the WordPress page. Each
// live or upcoming matchup gets one too, so a share during the bracket reads
// "Biscuit vs. Mochi, Sweet 16, voting closes Tuesday" with both faces.
//
// Pages only exist for pets approved before the build ran. Rebuild on a
// schedule during the contest; dist/404.html catches the gap by redirecting any
// /p/<id>/ or /m/<id>/ it does not have.
//
// No Supabase env (a fork, a lint-only CI job): skip with a warning, never fail.
// Cards are drawn only with SHARE_CARDS=true (pages.yml sets it, and installs
// Pillow); elsewhere the matchup page carries the first pet's photo.

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadEnv } from 'vite'
import { apDateTime, period } from '../src/lib/format.js'
import { roundLabel } from '../src/lib/rounds.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist')
const env = { ...loadEnv(process.env.MODE || 'production', ROOT, ''), ...process.env }

const SUPABASE_URL = (env.VITE_SUPABASE_URL || '').replace(/\/+$/, '')
const KEY = env.VITE_SUPABASE_ANON_KEY || ''
const TRANSFORMS = env.VITE_IMAGE_TRANSFORMS === 'true'
// Set on the scheduled rebuild (pages.yml), whose only job is these pages.
const REQUIRED = env.SHARE_PAGES_REQUIRED === 'true'
const repo = env.GITHUB_REPOSITORY
const SITE = (
  env.VITE_SITE_URL ||
  (repo ? `https://${repo.split('/')[0].toLowerCase()}.github.io/${repo.split('/')[1]}/` : 'https://rowanflynnpilot.github.io/wpr-pet-contest/')
).replace(/\/?$/, '/')
const PUBLIC = (env.VITE_PUBLIC_URL || SITE).replace(/#.*$/, '')

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
// A JSON string that is also safe inside <script>.
const jsString = (s) => JSON.stringify(String(s)).replace(/</g, '\\u003c')
const SPECIES = { dog: 'dog', cat: 'cat', other: 'pet' }

function photoUrl(path, width = 1200, height = 630) {
  const clean = path.split('/').map(encodeURIComponent).join('/')
  return TRANSFORMS
    ? `${SUPABASE_URL}/storage/v1/render/image/public/pets/${clean}?width=${width}&height=${height}&resize=cover&quality=80`
    : `${SUPABASE_URL}/storage/v1/object/public/pets/${clean}`
}

async function rest(path) {
  const headers = { apikey: KEY }
  if (KEY.startsWith('eyJ')) headers.Authorization = `Bearer ${KEY}`
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return res.json()
}

async function allEntries() {
  const out = []
  for (let offset = 0; ; offset += 1000) {
    // Explicit columns and an explicit approved filter, as everywhere else.
    const rows = await rest(
      `entries?select=id,contest_id,pet_name,species,town,photo_path,seed&status=eq.approved&order=created_at,id&limit=1000&offset=${offset}`,
    )
    out.push(...rows)
    if (rows.length < 1000) return out
  }
}

export function sharePage({ entry, contestName, target, selfUrl, image, transforms }) {
  const title = `Vote for ${entry.pet_name} in the ${contestName} contest`
  const kind = SPECIES[entry.species] || 'pet'
  const description = `${entry.pet_name}, a ${kind} from ${entry.town}, is in the running for ${contestName}. Every vote pack helps local animal shelters.`
  const dims = transforms ? '\n<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">' : ''
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Wausau Pilot &amp; Review">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(selfUrl)}">
<meta property="og:image" content="${esc(image)}">${dims}
<meta property="og:image:alt" content="${esc(`${entry.pet_name}, a ${kind} from ${entry.town}`)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(image)}">
<link rel="icon" href="../../wpr-typewriter-badge.png">
<style>
body{margin:0;background:#f6f2e9;color:#1a1a1a;font:17px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;display:grid;place-items:center;min-height:100vh;text-align:center}
main{max-width:420px;padding:24px}
img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:10px;background:#ede6d6}
h1{font:600 30px/1.1 Georgia,serif;margin:18px 0 8px}
a{display:inline-block;margin-top:10px;background:#2b655d;color:#fff;padding:12px 22px;border-radius:999px;font-weight:700;text-decoration:none}
</style>
</head>
<body>
<main>
<img src="${esc(image)}" alt="">
<h1>Vote for ${esc(entry.pet_name)}</h1>
<p>${esc(contestName)} · Wausau Pilot &amp; Review</p>
<a href="${esc(target)}">Go to ${esc(entry.pet_name)}&rsquo;s page</a>
</main>
<script>location.replace(${jsString(target)} + (new URLSearchParams(location.search).get('via') === 'o' ? '?via=o' : ''))</script>
</body>
</html>
`
}

// One matchup, both pets. `?p=<entry id>` on the link names the pet whose
// page the reader should land on; the crawlers see one page either way.
export function matchupPage({ card, selfUrl, image, cardImage }) {
  const { a, b } = card
  const seed = (s) => (s.seed != null ? `No. ${s.seed} ` : '')
  const title = `${a.pet_name} vs. ${b.pet_name}: ${card.round}`
  const description = `${seed(a)}${a.pet_name} meets ${seed(b)}${b.pet_name} in the ${card.round} of the ${card.contest} contest. ${period(`Voting closes ${card.closes}`)} Every vote pack helps local animal shelters.`
  const dims = cardImage ? '\n<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">' : ''
  const alt = cardImage ? `${a.pet_name} and ${b.pet_name}, ${card.round}` : `${a.pet_name}, a ${SPECIES[a.species] || 'pet'} from ${a.town}`
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Wausau Pilot &amp; Review">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(selfUrl)}">
<meta property="og:image" content="${esc(image)}">${dims}
<meta property="og:image:alt" content="${esc(alt)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(image)}">
<link rel="icon" href="../../wpr-typewriter-badge.png">
<style>
body{margin:0;background:#f6f2e9;color:#1a1a1a;font:17px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;display:grid;place-items:center;min-height:100vh;text-align:center}
main{max-width:520px;padding:24px}
.pair{display:flex;gap:16px;align-items:center;justify-content:center}
.pair img{width:42%;aspect-ratio:1;object-fit:cover;border-radius:10px;background:#ede6d6}
.pair b{font:700 22px Georgia,serif;color:#2b655d}
h1{font:600 28px/1.15 Georgia,serif;margin:18px 0 8px}
a{display:inline-block;margin-top:10px;background:#2b655d;color:#fff;padding:12px 22px;border-radius:999px;font-weight:700;text-decoration:none}
</style>
</head>
<body>
<main>
<div class="pair"><img src="${esc(a.photo)}" alt=""><b>vs.</b><img src="${esc(b.photo)}" alt=""></div>
<h1>${esc(a.pet_name)} vs. ${esc(b.pet_name)}</h1>
<p>${esc(card.round)} · Voting closes ${esc(card.closes)}</p>
<a href="${esc(`${PUBLIC}#/bracket`)}">See the matchup</a>
</main>
<script>
var p = new URLSearchParams(location.search).get('p');
var ids = [${jsString(a.id)}, ${jsString(b.id)}];
// An owner's link (?via=o) keeps its tag on the way to the pet's page.
var via = (new URLSearchParams(location.search).get('via') === 'o' ? '?via=o' : '');
location.replace(${jsString(PUBLIC)} + (ids.indexOf(p) >= 0 ? '#/pet/' + p + via : '#/bracket'));
</script>
</body>
</html>
`
}

// The matchups of bracket rounds that are open or about to open, with what
// the card needs. Resolved rounds get no page: 404.html sends those links on.
async function matchupCards(contests, entries) {
  const rounds = await rest('rounds?select=id,contest_id,seq,closes_at&kind=eq.bracket&status=in.(pending,open)&order=seq')
  if (!rounds.length) return []
  const matchups = await rest(`matchups?select=id,round_id,slot,entry_a_id,entry_b_id&round_id=in.(${rounds.map((r) => r.id).join(',')})&order=slot`)
  const byRound = new Map(rounds.map((r) => [r.id, r]))
  const byContest = new Map(contests.map((c) => [c.id, c]))
  const byEntry = new Map(entries.map((e) => [e.id, e]))
  const side = (e) => ({ id: e.id, pet_name: e.pet_name, seed: e.seed, town: e.town, species: e.species, photo: photoUrl(e.photo_path, 600, 600), photo_path: e.photo_path })
  const cards = []
  for (const m of matchups) {
    const round = byRound.get(m.round_id)
    const contest = round && byContest.get(round.contest_id)
    const a = byEntry.get(m.entry_a_id)
    const b = byEntry.get(m.entry_b_id)
    if (!contest || !a || !b) continue
    cards.push({ id: m.id, round: roundLabel(round.seq, contest.bracket_size || 16), closes: apDateTime(round.closes_at), contest: contest.name, a: side(a), b: side(b) })
  }
  return cards
}

async function writeMatchupPages(cards) {
  const dir = join(DIST, 'm')
  if (cards.length && env.SHARE_CARDS === 'true') {
    const manifest = join(dir, 'manifest.json')
    await mkdir(dir, { recursive: true })
    await writeFile(manifest, JSON.stringify(cards))
    const python = process.platform === 'win32' ? 'python' : 'python3'
    const run = spawnSync(python, [join(ROOT, 'scripts', 'matchup-cards.py'), manifest, dir], { stdio: 'inherit' })
    if (run.status !== 0) console.warn('[share-pages] matchup cards did not all render; those pages carry the first pet\'s photo instead.')
    await rm(manifest, { force: true })
  }
  for (const card of cards) {
    const pageDir = join(dir, card.id)
    await mkdir(pageDir, { recursive: true })
    const cardImage = existsSync(join(pageDir, 'card.png'))
    const html = matchupPage({
      card,
      selfUrl: `${SITE}m/${card.id}/`,
      image: cardImage ? `${SITE}m/${card.id}/card.png` : photoUrl(card.a.photo_path),
      cardImage,
    })
    await writeFile(join(pageDir, 'index.html'), html)
  }
  console.log(`[share-pages] wrote ${cards.length} matchup pages under dist/m/`)
}

// GitHub Pages serves this for any path it does not have, including share
// pages for pets approved after the last build and matchups of rounds since
// resolved.
function notFoundPage() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cutest Pet in Marathon County — Wausau Pilot &amp; Review</title>
<meta name="robots" content="noindex">
</head>
<body style="font:17px/1.5 -apple-system,sans-serif;text-align:center;padding:48px 16px;background:#f6f2e9">
<p><a href=${JSON.stringify(esc(PUBLIC))}>Go to the pet contest</a></p>
<script>
var m = location.pathname.match(/\\/([pm])\\/([0-9a-f-]{36})\\/?$/i);
var p = new URLSearchParams(location.search).get('p');
var via = (new URLSearchParams(location.search).get('via') === 'o' ? '?via=o' : '');
var to = !m ? '' : m[1] === 'p' ? '#/pet/' + m[2] + via : /^[0-9a-f-]{36}$/i.test(p || '') ? '#/pet/' + p + via : '#/bracket';
location.replace(${jsString(PUBLIC)} + to);
</script>
</body>
</html>
`
}

async function main() {
  await mkdir(DIST, { recursive: true })
  await writeFile(join(DIST, '404.html'), notFoundPage())

  if (!SUPABASE_URL || !KEY) {
    console.warn('[share-pages] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set; skipping per-pet share pages.')
    return
  }
  let contests, entries
  try {
    contests = await rest('contests?select=id,name,status,bracket_size')
    entries = await allEntries()
  } catch (err) {
    if (REQUIRED) {
      // A scheduled rebuild exists only to refresh these pages. Deploying
      // without them would break every shared pet link until the next run,
      // so fail and leave the last good deployment up.
      console.error(`[share-pages] could not reach Supabase (${err.message}); failing so the last deployment stays up.`)
      process.exitCode = 1
      return
    }
    console.warn(`[share-pages] could not reach Supabase (${err.message}); skipping per-pet share pages.`)
    return
  }
  const names = new Map(contests.map((c) => [c.id, c.name]))
  for (const entry of entries) {
    const dir = join(DIST, 'p', entry.id)
    await mkdir(dir, { recursive: true })
    const html = sharePage({
      entry,
      contestName: names.get(entry.contest_id) || 'Cutest Pet in Marathon County',
      target: `${PUBLIC}#/pet/${entry.id}`,
      selfUrl: `${SITE}p/${entry.id}/`,
      image: photoUrl(entry.photo_path),
      transforms: TRANSFORMS,
    })
    await writeFile(join(dir, 'index.html'), html)
  }
  console.log(`[share-pages] wrote ${entries.length} share pages under dist/p/ (redirecting to ${PUBLIC})`)

  try {
    await writeMatchupPages(await matchupCards(contests, entries))
  } catch (err) {
    // The pet pages are up; a matchup link without its page still lands on
    // the bracket through 404.html.
    console.warn(`[share-pages] matchup pages skipped (${err.message})`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    // A share-page problem must never take the site down with it: a push
    // still deploys, and a scheduled refresh keeps the last deployment.
    console.warn(`[share-pages] ${err.stack || err}`)
    if (REQUIRED) process.exitCode = 1
  })
}
