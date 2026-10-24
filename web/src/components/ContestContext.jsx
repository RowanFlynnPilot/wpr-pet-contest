import { createContext, useContext, useEffect, useMemo, useRef } from 'react'
import { refreshLive, useLive } from '../lib/live.js'
import { useClock } from '../lib/hooks.js'
import { fetchAllBonusWindows, fetchContests, fetchPacks, fetchRounds, fetchShelters, fetchStats } from '../lib/api.js'
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
  const windowsRes = useLive('windows', fetchAllBonusWindows, 120000)
  const statsRes = useLive(id ? `stats:${id}` : null, () => fetchStats(id), 30000)

  // close_round seeds the field and decides matchups in one transaction.
  // When any round changes status, refetch what it wrote at once, or an open
  // page can tell a qualified pet it missed the bracket for minutes.
  const roundStamp = (roundsRes.data || []).map((r) => `${r.id}:${r.status}`).join(',')
  const lastStamp = useRef(null)
  useEffect(() => {
    if (lastStamp.current !== null && lastStamp.current !== roundStamp) {
      refreshLive(`entries:${id}`)
      refreshLive('matchups:')
      refreshLive('settled:')
    }
    lastStamp.current = roundStamp
  }, [roundStamp, id])

  // Phase and bonus windows turn over on the clock, not only on new data.
  const ms = (v) => (v ? new Date(v).getTime() : NaN)
  const boundaries = [
    ms(contest?.submissions_open_at),
    ms(contest?.submissions_close_at),
    ...(roundsRes.data || []).map((r) => ms(r.closes_at)),
    ...(windowsRes.data || []).filter((w) => w.contest_id === id).flatMap((w) => [ms(w.starts_at), ms(w.ends_at)]),
  ]
  const now = useClock(boundaries)

  const value = useMemo(() => {
    const rounds = roundsRes.data || EMPTY
    const windows = id ? (windowsRes.data || EMPTY).filter((w) => w.contest_id === id) : EMPTY
    const phaseInfo = contestPhase(contest, rounds, now)
    return {
      loading: contestsRes.data === undefined && !contestsRes.error,
      error: contestsRes.error,
      contest,
      bracketSize: contest?.bracket_size || 16,
      rounds,
      roundsLoaded: !id || roundsRes.data !== undefined,
      roundsError: roundsRes.data === undefined ? roundsRes.error : null,
      // Requested alongside the contest list; the shell waits for both.
      windowsLoaded: windowsRes.data !== undefined || Boolean(windowsRes.error),
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
  }, [contest, id, contestsRes.data, contestsRes.error, roundsRes.data, roundsRes.error, sheltersRes.data, packsRes.data, windowsRes.data, windowsRes.error, statsRes.data, now])

  return <ContestContext.Provider value={value}>{children}</ContestContext.Provider>
}

export function useContest() {
  return useContext(ContestContext)
}
