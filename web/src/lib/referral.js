// "Your link brought N packs": a reader who arrives on a pet's page through
// one of its owner's links (?via=o, see ownerLink in share.js) is remembered
// in this browser for a week, and a pack they buy for that pet in that time
// is tagged `ref = 'owner'` (0029). Attribution only, never a vote: the tag
// changes nothing about the pack, its votes or its price.
const KEY = 'wpr-via'
const WINDOW = 7 * 24 * 3600e3

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') || {}
  } catch {
    return {}
  }
}

export function rememberVia(entryId, now = Date.now()) {
  try {
    const all = read()
    all[entryId] = now
    // Old visits fall away so the record stays small.
    for (const [id, at] of Object.entries(all)) if (now - at > WINDOW) delete all[id]
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    // Private mode: no attribution, nothing else changes.
  }
}

export function viaFor(entryId, now = Date.now()) {
  const at = read()[entryId]
  return at && now - at < WINDOW ? 'owner' : null
}
