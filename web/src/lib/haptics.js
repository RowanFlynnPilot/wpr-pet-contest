// A short tick when votes land, on phones that can (Android Chrome; iOS
// Safari has no vibration API, so nothing happens there). Skipped when the
// reader asks for less motion: some people turn haptics off for the same
// reason.
export function buzz(ms = 12) {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    navigator.vibrate(ms)
  } catch {
    // Some browsers throw when the page has not been interacted with: ignore.
  }
}
