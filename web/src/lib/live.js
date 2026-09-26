import { useSyncExternalStore } from 'react'

// Shared polling. Every component that shows round totals subscribes to the
// same keyed store, so a page with a leaderboard, a ticker and twelve cards
// still makes one request per interval. Polling pauses while the tab is hidden
// and catches up the moment it is visible again.

const TICK = 5000
const BOOST_INTERVAL = 5000
const stores = new Map()
const IDLE = { data: undefined, error: null, loading: false, updatedAt: 0 }
let ticking = null

function set(s, patch) {
  s.state = { ...s.state, ...patch }
  s.subs.forEach((cb) => cb())
}

function refresh(s) {
  if (s.inflight) return s.inflight
  if (!s.state.updatedAt) set(s, { loading: true })
  s.inflight = Promise.resolve()
    .then(() => s.fetcher())
    .then(
      (data) => set(s, { data, error: null, loading: false, updatedAt: Date.now() }),
      (error) => set(s, { error, loading: false, updatedAt: Date.now() }),
    )
    .finally(() => {
      s.inflight = null
    })
  return s.inflight
}

function due(s, now) {
  const every = s.boostUntil > now ? BOOST_INTERVAL : s.interval
  return every > 0 && now - s.state.updatedAt >= every
}

function tick() {
  if (typeof document !== 'undefined' && document.hidden) return
  const now = Date.now()
  for (const s of stores.values()) if (s.subs.size && due(s, now)) refresh(s)
}

function ensureTicking() {
  if (ticking || typeof window === 'undefined') return
  ticking = setInterval(tick, TICK)
  document.addEventListener('visibilitychange', () => !document.hidden && tick())
}

function getStore(key, fetcher, interval) {
  let s = stores.get(key)
  if (!s) {
    s = { key, fetcher, interval, state: IDLE, subs: new Set(), inflight: null, boostUntil: 0 }
    s.subscribe = (cb) => {
      s.subs.add(cb)
      ensureTicking()
      if (!s.state.updatedAt || due(s, Date.now())) refresh(s)
      return () => s.subs.delete(cb)
    }
    s.snapshot = () => s.state
    stores.set(key, s)
  }
  s.fetcher = fetcher
  return s
}

const noop = () => () => {}
const idle = () => IDLE

// `interval` 0 loads once and never polls.
export function useLive(key, fetcher, interval = 20000) {
  const s = key ? getStore(key, fetcher, interval) : null
  return useSyncExternalStore(s ? s.subscribe : noop, s ? s.snapshot : idle, s ? s.snapshot : idle)
}

// Poll one store every few seconds for a while: after a purchase, so the
// buyer sees the webhook credit their votes without reloading.
export function boostLive(key, durationMs = 120000) {
  const s = stores.get(key)
  if (!s) return
  s.boostUntil = Date.now() + durationMs
  refresh(s)
}
