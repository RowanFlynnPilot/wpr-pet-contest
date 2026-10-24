import { useEffect, useState } from 'react'

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

export function useRoute() {
  const [route, setRoute] = useState(() => parseHash(window.location.hash))
  useEffect(() => {
    const on = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}
