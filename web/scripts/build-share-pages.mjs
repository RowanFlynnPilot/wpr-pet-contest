// Per-pet share pages: dist/p/<id>/index.html, written after `vite build`.
//
// Facebook and X read Open Graph tags from the HTML they fetch and never run
// JavaScript, so a hash route inside the app (#/pet/<id>) previews as the
// generic contest card. Each pet gets a tiny static page carrying its own
// photo and name, which then sends the person on to the WordPress page.
//
// Pages only exist for pets approved before the build ran. Rebuild on a
// schedule during the contest; dist/404.html catches the gap by redirecting any
// /p/<id>/ it does not have.
//
// No Supabase env (a fork, a lint-only CI job): skip with a warning, never fail.

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadEnv } from 'vite'

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

function photoUrl(path) {
  const clean = path.split('/').map(encodeURIComponent).join('/')
  return TRANSFORMS
    ? `${SUPABASE_URL}/storage/v1/render/image/public/pets/${clean}?width=1200&height=630&resize=cover&quality=80`
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
      `entries?select=id,contest_id,pet_name,species,town,photo_path&status=eq.approved&order=created_at,id&limit=1000&offset=${offset}`,
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
<script>location.replace(${jsString(target)})</script>
</body>
</html>
`
}

// GitHub Pages serves this for any path it does not have, including share
// pages for pets approved after the last build.
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
var m = location.pathname.match(/\\/p\\/([0-9a-f-]{36})\\/?$/i);
location.replace(${jsString(PUBLIC)} + (m ? '#/pet/' + m[1] : ''));
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
    contests = await rest('contests?select=id,name,status')
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
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    // A share-page problem must never take the site down with it: a push
    // still deploys, and a scheduled refresh keeps the last deployment.
    console.warn(`[share-pages] ${err.stack || err}`)
    if (REQUIRED) process.exitCode = 1
  })
}
