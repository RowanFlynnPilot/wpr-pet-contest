import { useEffect, useRef } from 'react'
import { TURNSTILE_SITE_KEY } from '../lib/env.js'

// Cloudflare's bot check for free-vote code requests. Usually invisible: it
// only asks the reader to do anything when it is unsure. The script loads
// with the free-vote sheet, never with the page.
const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
let loading = null

function loadScript() {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = SRC
      s.async = true
      s.onload = () => resolve(window.turnstile)
      s.onerror = () => {
        loading = null
        reject(new Error('Turnstile did not load'))
      }
      document.head.appendChild(s)
    })
  }
  return loading
}

export const turnstileConfigured = Boolean(TURNSTILE_SITE_KEY)

// onToken(token | null). A token is single-use and expires after a few
// minutes; the widget refreshes itself and reports the new one.
export default function Turnstile({ onToken, onError }) {
  const box = useRef(null)
  const handlers = useRef({ onToken, onError })
  useEffect(() => {
    handlers.current = { onToken, onError }
  })

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return
    let id = null
    let alive = true
    loadScript()
      .then((ts) => {
        if (!alive || !box.current) return
        id = ts.render(box.current, {
          sitekey: TURNSTILE_SITE_KEY,
          appearance: 'interaction-only',
          action: 'free-vote',
          callback: (t) => handlers.current.onToken(t),
          'expired-callback': () => handlers.current.onToken(null),
          'error-callback': () => {
            handlers.current.onToken(null)
            handlers.current.onError?.()
          },
        })
      })
      .catch(() => handlers.current.onError?.())
    return () => {
      alive = false
      if (id !== null) window.turnstile?.remove(id)
    }
  }, [])

  return TURNSTILE_SITE_KEY ? <div ref={box} className="fv-turnstile" /> : null
}
