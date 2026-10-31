import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'

// Hash routing: GitHub Pages serves static files, and the WordPress embed can
// forward its own hash straight into the iframe's src.
const PAGES = ['enter', 'gallery', 'pet', 'bracket', 'rules', 'shelters', 'results', 'sponsors', 'unsubscribe', 'admin']

export function parseHash(hash = '') {
  const raw = hash.replace(/^#\/?/, '')
  const [path, query = ''] = raw.split('?')
  const parts = path.split('/').filter(Boolean)
  const name = parts[0] || 'home'
  const params = Object.fromEntries(new URLSearchParams(query))
  if (name === 'home') return { name, params }
  if (!PAGES.includes(name)) return { name: 'notfound', params }
  if (name === 'pet') {
    const id = parts[1] || ''
    return /^[0-9a-f-]{36}$/i.test(id) ? { name, id, params } : { name: 'notfound', params }
  }
  return { name, params, sub: parts[1] }
}

// A change of page goes through a view transition where the browser has
// them (all four engines since Firefox 144): the page crossfades, and a pet
// card's photo grows into the pet page's hero (lib/morph.js). The new page
// is rendered and scrolled to the top inside the transition, so the browser
// captures where the hero really lands. Same page, new query (?vote=): no
// transition, no scroll. Readers who ask for less motion get none.
export function useRoute() {
  const [route, setRoute] = useState(() => parseHash(window.location.hash))
  const current = useRef(route)
  useEffect(() => {
    const on = () => {
      const next = parseHash(window.location.hash)
      const prev = current.current
      current.current = next
      const moved = next.name !== prev.name || next.id !== prev.id
      const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      if (!moved || still || typeof document.startViewTransition !== 'function') {
        setRoute(next)
        return
      }
      let updated = false
      const t = document.startViewTransition(() => {
        updated = true
        flushSync(() => setRoute(next))
        window.scrollTo(0, 0)
      })
      // A transition waits for a frame to capture the old page. Where none
      // comes (a page the browser is not drawing), skip it: the page still
      // changes at once, just without the animation. Never a frozen page.
      setTimeout(() => {
        if (!updated) t.skipTransition()
      }, 300)
      // A card that stays on screen gives the name back; the hero keeps it.
      t.finished.finally(() => document.querySelectorAll('.pet-card .vt-photo').forEach((el) => el.classList.remove('vt-photo')))
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}
