// Vote pack arithmetic. Display only: create-checkout reads the price from
// the database, never from the browser.

export function perVoteCents(pack) {
  return pack.cents / pack.votes
}

// "$1.00 a vote", "42¢ a vote".
export function formatPerVote(pack) {
  const c = perVoteCents(pack)
  if (c >= 99.5) return `$${(c / 100).toFixed(2)} a vote`
  return `${Math.round(c)}¢ a vote`
}

// Savings against the most expensive per-vote rate on offer, rounded down so
// the page never overstates a discount.
export function savingsPct(pack, packs) {
  const base = Math.max(...packs.map(perVoteCents))
  if (!Number.isFinite(base) || base <= 0) return 0
  // The epsilon keeps 0.2 from flooring to 19 through float error.
  return Math.max(0, Math.floor(((base - perVoteCents(pack)) / base) * 100 + 1e-9))
}

export function bestValue(packs) {
  if (!packs.length) return null
  return packs.reduce((best, p) => (perVoteCents(p) < perVoteCents(best) ? p : best))
}

// Smallest first, like the rules page's price list: the sheet opens on a few
// votes at a time, not on the biggest pack (WPR's call, Oct. 25, 2026).
export function orderPacksForDisplay(packs) {
  return [...packs].sort((a, b) => a.cents - b.cents || (a.sort ?? 0) - (b.sort ?? 0))
}

export function defaultPack(packs) {
  if (!packs.length) return null
  const featured = packs.find((p) => p.featured)
  if (featured) return featured
  const byPrice = [...packs].sort((a, b) => a.cents - b.cents)
  return byPrice[Math.floor((byPrice.length - 1) / 2)]
}

export function votesWithBonus(pack, multiplier = 1) {
  return pack.votes * Math.max(1, multiplier || 1)
}

export function cheapestPerVote(packs) {
  const best = bestValue(packs)
  return best ? formatPerVote(best).replace(' a vote', '') : null
}
