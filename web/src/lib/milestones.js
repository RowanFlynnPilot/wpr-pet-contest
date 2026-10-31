// Milestone clubs: a badge for every pet that passes a vote total over the
// whole contest, whatever its rank, so an owner whose pet will not make the
// bracket still has something to reach for. Every round counts toward them
// (totals reset for the race, not for the clubs). Digital badges only: no
// prize rides on them.
export const CLUB_TIERS = [50, 100, 250, 500, 1000, 2500, 5000, 10000]

// { earned, next, toNext, progress, all } for a pet's contest total.
//   earned:   the highest tier reached, or null
//   next:     the next tier, or null past the last
//   toNext:   votes still needed for `next`
//   progress: 0..1 of the way from `earned` (or 0) to `next`
//   all:      every tier reached, lowest first
export function milestone(total) {
  const n = Math.max(0, Math.floor(Number(total) || 0))
  const all = CLUB_TIERS.filter((t) => n >= t)
  const earned = all.length ? all[all.length - 1] : null
  const next = CLUB_TIERS.find((t) => n < t) ?? null
  const from = earned ?? 0
  return {
    earned,
    next,
    toNext: next == null ? 0 : next - n,
    progress: next == null ? 1 : (n - from) / (next - from),
    all,
  }
}

// "1,000 Club"
export const clubLabel = (tier) => `${tier.toLocaleString('en-US')} Club`
