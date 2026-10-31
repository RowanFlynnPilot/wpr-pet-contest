import { useMemo } from 'react'
import { useLive } from './live.js'
import {
  fetchActivity,
  fetchEntries,
  fetchMatchups,
  fetchMomentum,
  fetchSideAwards,
  fetchTotals,
  fetchTotalsByRound,
} from './api.js'

const EMPTY_MAP = new Map()
const EMPTY = []

// The whole approved field. 300-800 rows; refreshed every few minutes so new
// approvals appear without a reload.
export function useEntries(contestId) {
  const live = useLive(contestId ? `entries:${contestId}` : null, () => fetchEntries(contestId), 5 * 60 * 1000)
  const entries = live.data || EMPTY
  const byId = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries])
  return { entries, byId, loading: live.loading || live.data === undefined, error: live.error }
}

export const totalsKey = (roundId) => `totals:${roundId}`

export function useRoundTotals(roundId, { live = true } = {}) {
  const res = useLive(roundId ? totalsKey(roundId) : null, () => fetchTotals(roundId), live ? 20000 : 0)
  // `known` is false until one load has succeeded: a failed first load is
  // not zero votes, and nothing should rank a pet on it.
  return {
    totals: res.data || EMPTY_MAP,
    known: res.data !== undefined,
    loading: res.data === undefined && !res.error,
    error: res.error,
    updatedAt: res.updatedAt,
  }
}

// All bracket matchups for a contest, plus totals for the rounds they are in.
export function useBracket(rounds, { openRoundId } = {}) {
  const bracketRounds = useMemo(() => (rounds || []).filter((r) => r.kind === 'bracket'), [rounds])
  const ids = bracketRounds.map((r) => r.id)
  const key = ids.length ? `matchups:${ids.join(',')}` : null
  const matchupsRes = useLive(key, () => fetchMatchups(ids), 60000)
  // Resolved rounds never change, so load their totals once; the open round's
  // totals poll with everything else.
  const settledIds = bracketRounds.filter((r) => r.id !== openRoundId).map((r) => r.id)
  const settledKey = settledIds.length ? `settled:${settledIds.join(',')}` : null
  const settledRes = useLive(settledKey, () => fetchTotalsByRound(settledIds), 120000)
  const open = useRoundTotals(openRoundId && bracketRounds.some((r) => r.id === openRoundId) ? openRoundId : null)

  const totalsByRound = useMemo(() => {
    const map = new Map(settledRes.data || [])
    if (openRoundId) map.set(openRoundId, open.totals)
    return map
  }, [settledRes.data, open.totals, openRoundId])

  return {
    bracketRounds,
    matchups: matchupsRes.data || EMPTY,
    totalsByRound,
    loading: Boolean(key) && matchupsRes.data === undefined && !matchupsRes.error,
  }
}

export function useActivity(roundId) {
  const res = useLive(roundId ? `activity:${roundId}` : null, () => fetchActivity(roundId), 20000)
  return res.data || EMPTY
}

// Each pet's votes over the whole contest, every round that has opened
// summed, for the milestone clubs. Map<entry_id, total>.
export function useContestTotals(rounds) {
  const ids = (rounds || []).filter((r) => r.status !== 'pending').map((r) => r.id)
  const key = ids.length ? `contest-totals:${ids.join(',')}` : null
  const res = useLive(key, () => fetchTotalsByRound(ids), 60000)
  return useMemo(() => {
    const out = new Map()
    for (const byEntry of res.data?.values() || []) for (const [id, t] of byEntry) out.set(id, (out.get(id) || 0) + (t.votes || 0))
    return out
  }, [res.data])
}

// The last 24 hours of votes in an open Open Round, for the climbing marks.
// Nothing until the round has run a day: before that, "since yesterday" is
// only the order the pets were entered in. `now` is the contest clock (useContest).
export function useMomentum(round, now) {
  const ready = round?.kind === 'open' && round.status === 'open' && round.opens_at && now - new Date(round.opens_at).getTime() >= 24 * 3600e3
  const res = useLive(ready ? `momentum:${round.id}` : null, () => fetchMomentum(round.id), 300000)
  return res.data || EMPTY_MAP
}

export function useSideAwards(contestId, enabled) {
  const res = useLive(enabled && contestId ? `awards:${contestId}` : null, () => fetchSideAwards(contestId), 0)
  return res.data || EMPTY
}
