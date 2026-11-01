// Standard WPR iframe protocol (see EMBED.md): post the document height so the
// WordPress page can size the iframe, and announce navigation so the parent can
// scroll the app's top back into view.
import { EMBEDDED } from './env.js'

let last = 0
let queued = false
// The article widget posts its own type, so a page carrying both the contest
// and a widget never resizes one frame to the other's height.
let heightType = 'wpr-pets-height'

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
      window.parent.postMessage({ type: heightType, height }, '*')
    }
  })
}

export function postNav() {
  if (!EMBEDDED) return
  window.parent.postMessage({ type: 'wpr-pets-nav' }, '*')
}

// Whether the frame is as tall as the app. Only the site-wide host script
// (public/embed.js) grows it, and it answers each height with wpr-pets-host;
// until then the frame is the fixed, screen-tall window pasted into the page
// (WPR's firewall refuses a page with a script in it), where the ordinary
// fixed overlays, toasts and sticky Vote bar are right. html.is-embedded
// carries the styles for a page-tall frame.
export function hostSized() {
  return document.documentElement.classList.contains('is-embedded')
}

export function startEmbedReporting({ type } = {}) {
  if (!EMBEDDED) return
  if (type) heightType = type
  window.addEventListener('message', (e) => {
    if (e.source === window.parent && e.data?.type === 'wpr-pets-host') document.documentElement.classList.add('is-embedded')
  })
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
