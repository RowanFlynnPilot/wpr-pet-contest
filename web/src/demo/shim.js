// The demo build's backend, inside the browser. Loaded first (vite.config.js
// injects it ahead of the app in `--mode demo`), it answers the app's fetch
// calls to the pretend API host with src/demo/contest.js and lets everything
// else through. The photos are files published beside the page
// (VITE_STORAGE_URL=.), so an <img> never needs this.
//
// A small bar at the bottom switches the contest's phase and the vote scale;
// both stick in localStorage for this browser.
import { createMock, PHASES } from './contest.js'
import { DEFAULT_NEWSROOM, NEWSROOMS } from '../newsrooms.js'

const HOST = 'demo.invalid'
const KEY = 'wpr-demo'

// The demo is shown inside other pages (a hosted preview frames it); it is
// still the whole site, masthead and all, not the WordPress embed.
window.WPR_DEMO = true

function settings() {
  try {
    const q = new URLSearchParams(window.location.search)
    const saved = JSON.parse(window.localStorage.getItem(KEY) || '{}')
    const phase = q.get('phase') || saved.phase || 'open'
    const scale = q.get('scale') || saved.scale || 1
    const newsroom = q.get('newsroom') || saved.newsroom || DEFAULT_NEWSROOM
    const mode = q.get('mode') || saved.mode || 'auto'
    return {
      phase: PHASES.includes(phase) ? phase : 'open',
      scale: Number(scale) === 100 ? 100 : 1,
      newsroom: NEWSROOMS[newsroom] ? newsroom : DEFAULT_NEWSROOM,
      // auto follows the OS; light and dark are set on <html> by the inline
      // script in vite.config.js before any module runs.
      mode: ['light', 'dark'].includes(mode) ? mode : 'auto',
    }
  } catch {
    return { phase: 'open', scale: 1, newsroom: DEFAULT_NEWSROOM, mode: 'auto' }
  }
}

function remember(next) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Private mode: the bar still works for this page view.
  }
}

const chosen = settings()
remember(chosen)
// Before config.js reads it: the newsroom this page is.
document.documentElement.dataset.newsroom = chosen.newsroom
const paper = NEWSROOMS[chosen.newsroom]
const mock = createMock({ ...chosen, region: paper.region, towns: paper.towns, photos: import.meta.env.VITE_SAMPLE_PHOTOS === 'true' ? 'jpg' : 'svg' })
const realFetch = window.fetch.bind(window)

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })

window.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url, window.location.href)
  if (url.host !== HOST) return realFetch(input, init)
  const method = (init.method || (typeof input !== 'string' && input.method) || 'GET').toUpperCase()

  const table = url.pathname.match(/\/rest\/v1\/([a-z_]+)$/)?.[1]
  if (table) {
    const rows = mock.table(table, url.searchParams)
    if (rows) return json(rows, 200, { 'Content-Range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` })
    return json({ code: 'PGRST205', message: `demo has no ${table}` }, 404)
  }

  const fn = url.pathname.match(/\/functions\/v1\/([a-z-]+)$/)?.[1]
  if (fn && method === 'POST') {
    let body = {}
    try {
      body = JSON.parse(init.body || '{}')
    } catch {
      body = {}
    }
    const out = mock.call(fn, body)
    if (out) return json(out.body, out.status || 200)
    return json({ error: 'This is a demo: entries and sign-in are switched off.' }, 503)
  }

  return json({ error: 'not in the demo' }, 404)
}

// The bar: phase buttons and the scale toggle. Plain DOM, outside React.
function bar() {
  const el = document.createElement('div')
  el.id = 'wpr-demo-bar'
  el.setAttribute('role', 'group')
  el.setAttribute('aria-label', 'Demo controls')
  const labels = { submissions: 'Entries', open: 'Open Round', bracket: 'Bracket', complete: 'Final' }
  const papers = Object.values(NEWSROOMS)
  el.innerHTML = `
    <style>
      #wpr-demo-bar { position: fixed; left: 0; right: 0; bottom: 0; z-index: 2147483000; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; justify-content: center; padding: 6px 10px calc(6px + env(safe-area-inset-bottom, 0px)); background: #1f4b45; color: #fff; font: 600 12px/1 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; box-shadow: 0 -4px 16px rgba(0,0,0,.2); }
      #wpr-demo-bar .k { font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: #cfe3de; margin-right: 4px; }
      #wpr-demo-bar button { appearance: none; border: 1px solid rgba(255,255,255,.35); background: transparent; color: #fff; font: inherit; padding: 7px 10px; border-radius: 999px; min-height: 32px; }
      #wpr-demo-bar button[aria-pressed="true"] { background: #f4b942; color: #1a1a1a; border-color: #f4b942; }
      #wpr-demo-bar .sep { width: 1px; height: 22px; background: rgba(255,255,255,.3); margin: 0 4px; }
      body { padding-bottom: 56px; }
      @media print { #wpr-demo-bar { display: none; } }
    </style>
    <span class="k">Demo</span>
    ${PHASES.map((p) => `<button type="button" data-phase="${p}" aria-pressed="${p === chosen.phase}">${labels[p]}</button>`).join('')}
    <button type="button" data-scale="${chosen.scale === 100 ? 1 : 100}" aria-pressed="${chosen.scale === 100}">Big numbers</button>
    <span class="sep" aria-hidden="true"></span>
    <span class="k">Newsroom</span>
    ${papers.map((p) => `<button type="button" data-newsroom="${p.key}" aria-pressed="${p.key === chosen.newsroom}">${p.shortName}</button>`).join('')}
    <span class="sep" aria-hidden="true"></span>
    <span class="k">Look</span>
    ${['auto', 'light', 'dark'].map((m) => `<button type="button" data-mode="${m}" aria-pressed="${m === chosen.mode}">${m === 'auto' ? 'Auto' : m === 'light' ? 'Light' : 'Dark'}</button>`).join('')}
  `
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button')
    if (!b) return
    const next = { ...chosen }
    if (b.dataset.phase) next.phase = b.dataset.phase
    if (b.dataset.scale) next.scale = Number(b.dataset.scale)
    if (b.dataset.newsroom) next.newsroom = b.dataset.newsroom
    if (b.dataset.mode) next.mode = b.dataset.mode
    remember(next)
    // A fresh page rather than a live swap: every counter and clock starts
    // clean. The address loses any ?phase= so the choice sticks.
    const u = new URL(window.location.href)
    u.searchParams.delete('phase')
    u.searchParams.delete('scale')
    u.searchParams.delete('newsroom')
    u.searchParams.delete('mode')
    window.location.replace(u.toString())
  })
  document.body.appendChild(el)
}

// Not on the article widget, which is a box inside a story.
if (!/widget\.html$/.test(window.location.pathname)) {
  if (document.body) bar()
  else document.addEventListener('DOMContentLoaded', bar)
}
