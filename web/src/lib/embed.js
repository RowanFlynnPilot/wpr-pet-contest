// Standard WPR iframe protocol (see EMBED.md): post the document height so the
// WordPress page can size the iframe, and announce navigation so the parent can
// scroll the app's top back into view.
import { EMBEDDED } from './env.js'

let last = 0
let queued = false

// body, not documentElement: the root's scrollHeight never drops below the
// iframe's current height, so the frame could grow but never shrink back.
function measure() {
  return Math.ceil(document.body?.scrollHeight || 0)
}

export function postHeight() {
  if (!EMBEDDED || queued) return
  queued = true
  requestAnimationFrame(() => {
    queued = false
    const height = measure()
    if (height !== last) {
      last = height
      window.parent.postMessage({ type: 'wpr-pets-height', height }, '*')
    }
  })
}

export function postNav() {
  if (!EMBEDDED) return
  window.parent.postMessage({ type: 'wpr-pets-nav' }, '*')
}

export function startEmbedReporting() {
  if (!EMBEDDED) return
  document.documentElement.classList.add('is-embedded')
  const ro = new ResizeObserver(postHeight)
  ro.observe(document.documentElement)
  if (document.body) ro.observe(document.body)
  // Absolutely positioned content (open menus, the checkout panel) changes
  // scrollHeight without resizing <body>.
  new MutationObserver(postHeight).observe(document.body, { childList: true, subtree: true, attributes: true })
  window.addEventListener('hashchange', () => {
    postNav()
    setTimeout(postHeight, 50)
  })
  window.addEventListener('load', postHeight)
  postHeight()
}
