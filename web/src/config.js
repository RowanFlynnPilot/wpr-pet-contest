// The editorial and sales knobs. Everything that changes per year or per deal
// lives here, not in components. Contest data (dates, split, packs, rounds)
// comes from the database instead.
//
// The newsroom is a setting (src/newsrooms.js): a build picks one with
// VITE_NEWSROOM (default wpr); the demo switches at runtime by setting
// data-newsroom on <html> before the app loads (src/demo/shim.js).
import { DEFAULT_NEWSROOM, NEWSROOMS } from './newsrooms.js'

// Not lib/env.js: the Node scripts (share pages, the deck) import this file
// through lib/format.js, and env.js reads Vite's import.meta.env.
const EMBEDDED = typeof window !== 'undefined' && window.parent !== window && !window.WPR_DEMO

const picked =
  (typeof document !== 'undefined' && document.documentElement.dataset.newsroom) || import.meta.env?.VITE_NEWSROOM || DEFAULT_NEWSROOM
export const NEWSROOM = NEWSROOMS[picked] || NEWSROOMS[DEFAULT_NEWSROOM]

// Inside another page (the WordPress embed) the look is that page's: light.
// Standalone, the OS decides (styles/tokens.css), unless <html data-mode>
// was set before the app loaded, by the demo's bar or by a host page.
if (typeof document !== 'undefined' && EMBEDDED && !document.documentElement.dataset.mode) document.documentElement.dataset.mode = 'light'

// Its theme (styles/tokens.css) and faces, before the first paint.
if (typeof document !== 'undefined') {
  if (NEWSROOM.theme) document.documentElement.dataset.theme = NEWSROOM.theme
  if (NEWSROOM.fonts && !document.querySelector(`link[href="${NEWSROOM.fonts}"]`)) {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = NEWSROOM.fonts
    document.head.appendChild(link)
  }
}

// The names the components grew up with.
export const WPR_URL = NEWSROOM.url
export const WPR_TAGLINE = NEWSROOM.tagline
export const WPR_PHONE = NEWSROOM.phone
// Self-hosted copies. WordPress upload URLs broke in the Sept. 2026 CDN move.
export const WPR_BADGE = NEWSROOM.badge
export const WPR_LOGO = NEWSROOM.wordmark

// Tax-deductible giving to the newsroom, kept visibly separate from vote packs.
export const SUPPORT_URL = NEWSROOM.supportUrl
export const NEWSLETTER_URL = NEWSROOM.newsletterUrl

// PLACEHOLDERS until WPR and counsel sign off. The rules page wears a DRAFT
// ribbon while rulesApproved is false.
export const RULES = {
  rulesApproved: false,
  contact: NEWSROOM.contact,
  eligibility: `Entrants must be 18 or older and live in ${NEWSROOM.state}. One entry per pet. Employees of ${NEWSROOM.name} and members of their households may not enter. Employees of partner shelters may enter their own pets but are not eligible for side awards.`,
}

// Sponsor slots. A slot is a sponsor object or null (null renders an upsell).
// Shape: { name, logo?, url?, tagline? }. Logos go in public/, never hot-linked.
//   presenting: the title credit on the contest bar and home page
//   gallery:    the pet grid, after its first row of photos
//   bracket:    the bracket page, every head-to-head round
// The buyer's thank-you screen is never sold: no sponsor, no upsell.
export const SPONSORS = {
  presenting: null,
  gallery: null,
  bracket: null,
}

export const SPONSOR_SLOTS = {
  presenting: {
    name: 'Presenting sponsor',
    pitch: 'Your name on the whole contest: the contest bar on every page, and the home page.',
    demo: '#/',
  },
  gallery: {
    name: 'Gallery sponsor',
    pitch: 'In the gallery of every pet in the field, right after the first row of photos.',
    demo: '#/gallery',
  },
  bracket: {
    name: 'Bracket sponsor',
    pitch: 'Across the head-to-head bracket for the final week and a half.',
    demo: '#/bracket',
  },
}

export const SPONSOR_INQUIRY = NEWSROOM.sponsorInquiry
export const SPONSOR_UTM = `utm_source=${NEWSROOM.utmSource}&utm_medium=widget&utm_campaign=pet-contest`

// Cookieless analytics (Plausible). Empty domain = every track() is a no-op
// and no script loads.
export const ANALYTICS = {
  domain: '',
  src: 'https://plausible.io/js/script.js',
}

// Staff shortcut from the admin desk.
export const STRIPE_DASHBOARD = 'https://dashboard.stripe.com/'

// ---------------------------------------------------------------------------
// SALES DEMO MODE. Append ?demo to the app URL and every OPEN slot shows a
// "Your Brand Here" placeholder, so sales can show a prospect their name on the
// live contest. Sold slots are never overridden; readers never see this.
export const DEMO =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('demo')

if (DEMO) {
  for (const key of Object.keys(SPONSORS)) {
    SPONSORS[key] = SPONSORS[key] || {
      name: 'Your Brand Here',
      logo: null,
      url: null,
      tagline: `This placement is open — ${SPONSOR_INQUIRY}`,
      demo: true,
    }
  }
}
