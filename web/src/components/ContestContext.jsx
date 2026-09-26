import { createContext, useContext, useMemo } from 'react'
import { useLive } from '../lib/live.js'
import { useClock } from '../lib/hooks.js'
import { fetchBonusWindows, fetchContests, fetchPacks, fetchRounds, fetchShelters, fetchStats } from '../lib/api.js'
import { contestPhase, pickActiveContest } from '../lib/phase.js'
import { activeWindow, upcomingWindow } from '../lib/bonus.js'

const ContestContext = createContext(null)
const EMPTY = []

export function ContestProvider({ children }) {
  const contestsRes = useLive('contests', fetchContests, 60000)
  const contest = useMemo(() => pickActiveContest(contestsRes.data || EMPTY), [contestsRes.data])
  const id = contest?.id

  // Rounds poll every 30s: the moment staff open or close a round, every
  // reader's page changes phase without a reload.
  const roundsRes = useLive(id ? `rounds:${id}` : null, () => fetchRounds(id), 30000)
  const sheltersRes = useLive(id ? `shelters:${id}` : null, () => fetchShelters(id), 0)
  const packsRes = useLive(id ? `packs:${id}` : null, () => fetchPacks(id), 300000)
  const windowsRes = useLive(id ? `windows:${id}` : null, () => fetchBonusWindows(id), 120000)
  const statsRes = useLive(id ? `stats:${id}` : null, () => fetchStats(id), 30000)

  // Phase and bonus windows turn over on the clock, not only on new data.
  const ms = (v) => (v ? new Date(v).getTime() : NaN)
  const boundaries = [
    ms(contest?.submissions_open_at),
    ms(contest?.submissions_close_at),
    ...(roundsRes.data || []).map((r) => ms(r.closes_at)),
    ...(windowsRes.data || []).flatMap((w) => [ms(w.starts_at), ms(w.ends_at)]),
  ]
  const now = useClock(boundaries)

  const value = useMemo(() => {
    const rounds = roundsRes.data || EMPTY
    const windows = windowsRes.data || EMPTY
    const phaseInfo = contestPhase(contest, rounds, now)
    return {
      loading: contestsRes.data === undefined && !contestsRes.error,
      error: contestsRes.error,
      contest,
      bracketSize: contest?.bracket_size || 16,
      rounds,
      roundsLoaded: !id || roundsRes.data !== undefined,
      shelters: sheltersRes.data || EMPTY,
      packs: packsRes.data || EMPTY,
      windows,
      bonus: activeWindow(windows, now),
      upcomingBonus: upcomingWindow(windows, now),
      stats: statsRes.data || null,
      ...phaseInfo,
      phaseInfo,
      now,
    }
  }, [contest, id, contestsRes.data, contestsRes.error, roundsRes.data, sheltersRes.data, packsRes.data, windowsRes.data, statsRes.data, now])

  return <ContestContext.Provider value={value}>{children}</ContestContext.Provider>
}

export function useContest() {
  return useContext(ContestContext)
}
