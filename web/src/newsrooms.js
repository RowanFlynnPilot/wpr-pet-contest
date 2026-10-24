// The newsrooms this contest can be. Everything a reader could tell apart
// from another town's edition lives here: the name, the region, the lockup,
// the towns, the clock, the colors and faces. Pure data, no DOM, so the demo
// shim and the Node scripts can read it too. config.js picks one.
//
// A new newsroom is a new entry here, a theme block in styles/tokens.css
// (role tokens: brand, accent, danger, cream) and its own badge and wordmark
// in public/. Contest data (name, dates, split, packs) comes from the database.

const BASE = import.meta.env?.BASE_URL ?? '/'

export const NEWSROOMS = {
  wpr: {
    key: 'wpr',
    name: 'Wausau Pilot & Review',
    shortName: 'WPR',
    url: 'https://wausaupilotandreview.com/',
    tagline: 'Where Locals Look First For News',
    phone: '715-301-5539',
    city: 'Wausau',
    state: 'Wisconsin',
    // The place the contest covers: "Cutest Pet in Marathon County".
    region: 'Marathon County',
    timeZone: 'America/Chicago',
    legalEntity: 'Wausau Pilot & Review',
    nonprofit: true,
    badge: `${BASE}wpr-typewriter-badge.png`,
    wordmark: `${BASE}wpr-wordmark.png`,
    supportUrl: 'https://wausaupilotandreview.com/support-our-publication/?utm_source=pet-contest&utm_medium=widget&utm_campaign=post-purchase',
    newsletterUrl: 'https://wausaupilotandreview.com/sign-up/?utm_source=pet-contest',
    contact: 'pets@wausaupilotandreview.com',
    sponsorInquiry: 'weber.chris@wausaupilotandreview.com',
    utmSource: 'wausaupilotandreview',
    // Marathon County and the towns that border it closely enough to read WPR.
    towns: ['Wausau', 'Weston', 'Schofield', 'Rothschild', 'Kronenwetter', 'Rib Mountain', 'Mosinee', 'Marathon City', 'Edgar', 'Stratford', 'Athens', 'Spencer', 'Colby', 'Abbotsford', 'Merrill', 'Hatley', 'Maine', 'Brokaw', 'Birnamwood', 'Elderon', 'Fenwood', 'Unity', 'Hamburg', 'Ringle', 'Stettin', 'Texas'],
    // Instagram's local tags; derived from the places when absent.
    hashtags: ['Wausau', 'MarathonCounty', 'CentralWisconsin'],
    // null: the default theme and faces in tokens.css and index.html.
    theme: null,
    fonts: null,
  },
  // A fictional newsroom for the sales demo: the same engine in another
  // town's colors, faces and names. Nothing here is a real business.
  gazette: {
    key: 'gazette',
    name: 'The Example Gazette',
    shortName: 'The Gazette',
    url: 'https://example.org/',
    tagline: 'Your valley, every morning',
    phone: '555-010-0100',
    city: 'Exampleville',
    state: 'Colorado',
    region: 'the Example Valley',
    timeZone: 'America/Denver',
    legalEntity: 'Example Gazette LLC',
    nonprofit: false,
    badge: null,
    wordmark: null,
    supportUrl: 'https://example.org/subscribe/',
    newsletterUrl: 'https://example.org/newsletter/',
    contact: 'pets@example.org',
    sponsorInquiry: 'ads@example.org',
    utmSource: 'examplegazette',
    towns: ['Exampleville', 'North Fork', 'Riverbend', 'Cedar Mesa', 'Silver Creek', 'Hollowtown', 'Pine Bluff', 'Juniper Springs'],
    hashtags: null,
    theme: 'gazette',
    fonts: 'https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400..700;1,6..72,400..600&family=Source+Sans+3:ital,wght@0,400..800;1,400&display=swap',
  },
}

export const DEFAULT_NEWSROOM = 'wpr'
