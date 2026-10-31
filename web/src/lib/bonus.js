// Bonus windows: "Double Vote Hour, presented by X". The multiplier applies to
// packs whose checkout BEGINS inside the window; the server locks it in.

const HOUR = 3600 * 1000
const ms = (v) => new Date(v).getTime()

export function activeWindow(windows = [], now = Date.now()) {
  return windows.find((w) => ms(w.starts_at) <= now && now < ms(w.ends_at)) || null
}

// The next window starting within `horizon`, for an "upcoming" teaser.
export function upcomingWindow(windows = [], now = Date.now(), horizon = 24 * HOUR) {
  return (
    windows
      .filter((w) => ms(w.starts_at) > now && ms(w.starts_at) - now <= horizon)
      .sort((a, b) => ms(a.starts_at) - ms(b.starts_at))[0] || null
  )
}

const WORDS = { 2: 'Double', 3: 'Triple', 4: 'Quadruple', 5: 'Quintuple' }

export function multiplierWord(m) {
  return WORDS[m] || `${m}×`
}

export function windowTitle(w) {
  return w.label || `${multiplierWord(w.multiplier)} Votes`
}
