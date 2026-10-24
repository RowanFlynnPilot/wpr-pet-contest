// The editorial and sales knobs. Everything that changes per year or per deal
// lives here, not in components. Contest data (dates, split, packs, rounds)
// comes from the database instead.

export const WPR_URL = 'https://wausaupilotandreview.com/'
export const WPR_TAGLINE = 'Where Locals Look First For News'
export const WPR_PHONE = '715-301-5539'
// Self-hosted copies. WordPress upload URLs broke in the Sept. 2026 CDN move.
export const WPR_BADGE = `${import.meta.env.BASE_URL}wpr-typewriter-badge.png`
export const WPR_LOGO = `${import.meta.env.BASE_URL}wpr-wordmark.png`

// Tax-deductible giving to the newsroom, kept visibly separate from vote packs.
export const SUPPORT_URL =
  'https://wausaupilotandreview.com/support-our-publication/?utm_source=pet-contest&utm_medium=widget&utm_campaign=post-purchase'
export const NEWSLETTER_URL = 'https://wausaupilotandreview.com/sign-up/?utm_source=pet-contest'

// PLACEHOLDERS until WPR and counsel sign off. The rules page wears a DRAFT
// ribbon while rulesApproved is false.
export const RULES = {
  rulesApproved: false,
  contact: 'pets@wausaupilotandreview.com',
  eligibility:
    'Entrants must be 18 or older and live in Wisconsin. One entry per pet. Employees of Wausau Pilot & Review and partner shelters may enter their pets but are not eligible for side awards.',
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

export const SPONSOR_INQUIRY = 'weber.chris@wausaupilotandreview.com'
export const SPONSOR_UTM = 'utm_source=wausaupilotandreview&utm_medium=widget&utm_campaign=pet-contest'

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
