#!/usr/bin/env node
// A stand-in for the Supabase API over HTTP, for looking at the public site
// without a database: screenshots, accessibility and speed audits, sales
// demos. The contest itself lives in src/demo/contest.js, which the demo
// build also runs inside the browser; this file is the server around it.
// Reads only; the edge functions answer 503, except the toys: a checkout with
// no Stripe behind it (mock-pay settles it), a free vote with code 123456,
// one vote per browser per run, and an owner's goal.
//
//   node scripts/mock-api.mjs                     # http://127.0.0.1:8787, phase "open"
//   VITE_SUPABASE_URL=http://127.0.0.1:8787 VITE_SUPABASE_ANON_KEY=mock npm run dev
//   VOTE_SCALE=100 node scripts/mock-api.mjs      # five-figure counts
//
// Switch the contest's phase while it runs:
//   curl http://127.0.0.1:8787/__phase?set=submissions   (submissions | open | bracket | complete)

import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { createMock, photo } from '../src/demo/contest.js'

// Not in the 49152+ range: Windows reserves chunks of it for Hyper-V and WSL.
const PORT = Number(process.env.PORT || 8787)
const mock = createMock({ phase: process.env.PHASE || 'open', scale: process.env.VOTE_SCALE })

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Expose-Headers': 'Content-Range',
}

const json = (res, status, body, extra = {}) => {
  res.writeHead(status, { ...CORS, 'Content-Type': 'application/json', ...extra })
  res.end(JSON.stringify(body))
}

createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  if (req.method === 'OPTIONS') return res.writeHead(204, CORS).end()

  if (url.pathname === '/__phase') {
    const set = url.searchParams.get('set')
    if (set) mock.setPhase(set)
    return json(res, 200, { phase: mock.phase })
  }

  const pic = url.pathname.match(/\/storage\/v1\/(?:object|render\/image)\/public\/pets\/mock\/(\d+)\.svg$/)
  if (pic) {
    res.writeHead(200, { ...CORS, 'Content-Type': 'image/svg+xml', 'Cache-Control': 'max-age=3600' })
    return res.end(photo(Number(pic[1])))
  }
  // The partner's logo, the committed copy the live site serves from Pages.
  if (/\/storage\/v1\/(?:object|render\/image)\/public\/pets\/shelters\/moments-foster-care\.jpg$/.test(url.pathname)) {
    res.writeHead(200, { ...CORS, 'Content-Type': 'image/jpeg', 'Cache-Control': 'max-age=3600' })
    return res.end(readFileSync(new URL('../public/moments-foster-care.jpg', import.meta.url)))
  }

  const table = url.pathname.match(/\/rest\/v1\/([a-z_]+)$/)?.[1]
  const rows = table && mock.table(table, url.searchParams)
  if (rows) return json(res, 200, rows, { 'Content-Range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` })

  const fn = url.pathname.match(/\/functions\/v1\/([a-z-]+)$/)?.[1]
  if (fn && req.method === 'POST') {
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      const out = mock.call(fn, JSON.parse(raw || '{}'))
      if (out) return json(res, out.status || 200, out.body)
      json(res, 503, { error: 'This is a mock backend: checkout and entries are switched off.' })
    })
    return
  }

  json(res, 404, { code: 'PGRST205', message: `mock has no ${url.pathname}` })
}).listen(PORT, '127.0.0.1', () => console.log(`mock API on http://127.0.0.1:${PORT} (phase: ${mock.phase})`))
