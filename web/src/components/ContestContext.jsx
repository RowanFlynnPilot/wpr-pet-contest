import { createContext, useContext, useEffect, useMemo, useRef } from 'react'
import { refreshLive, useLive } from '../lib/live.js'
import { useClock } from '../lib/hooks.js'
import { fetchAllBonusWindows, fetchAllSponsorMatches, fetchContests, fetchLastChance, fetchPacks, fetchRounds, fetchShelters, fetchSprints, fetchStats } from '../lib/api.js'
import { contestPhase, pickActiveContest } from '../lib/phase.js'
import { activeWindow, upcomingWindow } from '../lib/bonus.js'
import { pickSprint } from '../lib/sprints.js'
import { lastChanceState } from '../lib/lastChance.js'

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
  const matchesRes = useLive('matches', fetchAllSponsorMatches, 120000)
  const statsRes = useLive(id ? `stats:${id}` : null, () => fetchStats(id), 30000)
  // Sprints change rarely (a day's notice), but a settled winner should show
  // within a minute or two.
  const sprintsRes = useLive(id ? `sprints:${id}` : null, () => fetchSprints(id), 90000)
  // Last Chance's snapshot, once the Open Round has one (0032).
  const round1 = (roundsRes.data || []).find((r) => r.seq === 1)
  const lcId = round1?.overtime_closes_at ? round1.id : null
  const lcRes = useLive(lcId ? `lastchance:${lcId}` : null, () => fetchLastChance(lcId), 0)

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
    ...(matchesRes.data || []).filter((m) => m.contest_id === id).flatMap((m) => [ms(m.starts_at), ms(m.ends_at)]),
    ...(sprintsRes.data || []).flatMap((s) => [ms(s.starts_at), ms(s.ends_at), ms(s.ends_at) + 12 * 3600e3, ms(s.starts_at) - 48 * 3600e3]),
    // The finale's countdown, "live now" and replay link (lib/finale.js).
    ms(contest?.finale_at),
    ms(round1?.overtime_closes_at),
    ms(contest?.finale_at) + 2 * 3600e3,
  ]
  const now = useClock(boundaries)

  const value = useMemo(() => {
    const rounds = roundsRes.data || EMPTY
    const windows = id ? (windowsRes.data || EMPTY).filter((w) => w.contest_id === id) : EMPTY
    const matches = id ? (matchesRes.data || EMPTY).filter((m) => m.contest_id === id) : EMPTY
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
      matches,
      match: activeWindow(matches, now),
      upcomingMatch: upcomingWindow(matches, now),
      stats: statsRes.data || null,
      sprints: sprintsRes.data || EMPTY,
      lastChance: lastChanceState(rounds.find((r) => r.seq === 1), lcRes.data || EMPTY, now),
      sprint: pickSprint(sprintsRes.data || EMPTY, now),
      ...phaseInfo,
      phaseInfo,
      now,
    }
  }, [contest, id, contestsRes.data, contestsRes.error, roundsRes.data, roundsRes.error, sheltersRes.data, packsRes.data, windowsRes.data, windowsRes.error, matchesRes.data, statsRes.data, sprintsRes.data, lcRes.data, now])

  return <ContestContext.Provider value={value}>{children}</ContestContext.Provider>
}

export function useContest() {
  return useContext(ContestContext)
}
