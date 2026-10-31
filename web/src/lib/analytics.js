// Cookieless analytics: load Plausible only if a domain is configured, and
// expose track(). Unconfigured, every call is a no-op.
import { ANALYTICS } from '../config.js'

let started = false

// Queue stub from module load, so an event fired before the script arrives is
// kept instead of dropped.
if (typeof window !== 'undefined' && ANALYTICS.domain) {
  window.plausible =
    window.plausible ||
    function () {
      ;(window.plausible.q = window.plausible.q || []).push(arguments)
    }
}

export function initAnalytics() {
  if (started || !ANALYTICS.domain) return
  started = true
  const s = document.createElement('script')
  s.defer = true
  s.src = ANALYTICS.src
  s.setAttribute('data-domain', ANALYTICS.domain)
  document.head.appendChild(s)
}

// track('Checkout Completed', { pack: 'medium' }, { amount: 20, currency: 'USD' })
export function track(event, props, revenue) {
  if (typeof window === 'undefined' || !window.plausible) return
  const opts = {}
  if (props) opts.props = props
  if (revenue) opts.revenue = revenue
  window.plausible(event, Object.keys(opts).length ? opts : undefined)
}
