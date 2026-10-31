import { useEffect, useState } from 'react'

export function useNow(interval = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), interval)
    return () => clearInterval(t)
  }, [interval])
  return now
}

// Like useNow, but also wakes exactly at the next of `boundaries` (ms
// timestamps): a round's closing time flips every Vote button on the page at
// the deadline, not up to one polling interval later.
export function useClock(boundaries, interval = 30000) {
  const [now, setNow] = useState(() => Date.now())
  const next = boundaries.filter((t) => Number.isFinite(t) && t > now).sort((a, b) => a - b)[0]
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const t = setInterval(tick, interval)
    // setTimeout caps at ~24.8 days; anything further waits for the interval.
    const wait = next ? next - Date.now() + 50 : null
    const b = wait != null && wait < 2 ** 31 - 1 ? setTimeout(tick, Math.max(0, wait)) : null
    return () => {
      clearInterval(t)
      if (b) clearTimeout(b)
    }
  }, [interval, next])
  return now
}

export function useMediaQuery(query) {
  const get = () => typeof window !== 'undefined' && window.matchMedia(query).matches
  const [matches, setMatches] = useState(get)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setMatches(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return matches
}

export const useReducedMotion = () => useMediaQuery('(prefers-reduced-motion: reduce)')

export function useDocumentTitle(title) {
  useEffect(() => {
    if (title) document.title = title
  }, [title])
}
