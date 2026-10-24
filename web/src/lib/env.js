// Every build-time setting in one place. Missing values degrade to a friendly
// "not configured" state instead of a blank page: `npm run build` has to work
// with no env at all (CI lint jobs, forks).
const env = import.meta.env

export const SUPABASE_URL = (env.VITE_SUPABASE_URL || '').replace(/\/+$/, '')
export const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY || ''
// Where the photo bucket is served from: Supabase itself unless a build says
// otherwise (the demo build serves the placeholders as files beside the page).
export const STORAGE_URL = (env.VITE_STORAGE_URL || SUPABASE_URL).replace(/\/+$/, '')
export const STRIPE_PUBLISHABLE_KEY = env.VITE_STRIPE_PUBLISHABLE_KEY || ''
export const IMAGE_TRANSFORMS = env.VITE_IMAGE_TRANSFORMS === 'true'
// The mock API's toy checkout (no Stripe, no charge), for demos and the
// screenshot deck. Never set on a real build; the real API never says "mock".
export const MOCK_CHECKOUT = env.VITE_MOCK_CHECKOUT === 'true'
// Cloudflare Turnstile, the bot check on free-vote code requests. Public by design.
export const TURNSTILE_SITE_KEY = env.VITE_TURNSTILE_SITE_KEY || ''

export const BACKEND_CONFIGURED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

// Where the app itself is served (GitHub Pages, or localhost in dev). Share
// pages live under it at p/<id>/.
export const APP_BASE =
  typeof window === 'undefined'
    ? ''
    : `${window.location.origin}${window.location.pathname.replace(/[^/]*$/, '')}`

// The WordPress page that embeds the app. Share links land readers there, not
// on the bare GitHub Pages URL.
export const PUBLIC_URL = (env.VITE_PUBLIC_URL || APP_BASE).replace(/#.*$/, '')

// Inside the WordPress iframe. The demo build (src/demo/shim.js) is framed by
// its host too, but shows the whole site.
export const EMBEDDED = typeof window !== 'undefined' && window.parent !== window && !window.WPR_DEMO
