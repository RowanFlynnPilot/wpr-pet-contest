// Every public read and write. Rules that are easy to break by accident:
//   * entries: explicit columns only (anon has column-level grants, so '*'
//     fails), and always .eq('status', 'approved') even though RLS filters too.
//   * entry_round_totals: always filtered by round. Totals reset every round.
//   * PostgREST caps a response at 1000 rows; page anything that can grow.
import { supabase } from './supabase.js'
import { SUPABASE_URL } from './env.js'

const CONTEST_COLS =
  'id, year, name, status, beneficiary_split_pct, submissions_open_at, submissions_close_at, bracket_size, bracket_round_hours'
const CONTEST_FREE_COLS = `${CONTEST_COLS}, free_vote_enabled, free_vote_paused_at`
const CONTEST_BASE_COLS = 'id, year, name, status, beneficiary_split_pct, submissions_open_at, submissions_close_at'
const ENTRY_COLS = 'id, contest_id, pet_name, species, town, caption, photo_path, thumb_path, shelter_id, seed, created_at'
const ENTRY_BASE_COLS = 'id, contest_id, pet_name, species, town, photo_path, shelter_id, seed, created_at'
const ROUND_COLS = 'id, contest_id, seq, kind, status, opens_at, closes_at, resolved_at'
const MATCHUP_COLS = 'id, round_id, slot, entry_a_id, entry_b_id, winner_entry_id'

const PAGE = 1000

// A view or column the backend has not shipped yet. The page shows an empty
// state rather than an error for these.
export function isUnavailable(error) {
  if (!error) return false
  return (
    ['PGRST205', 'PGRST204', '42P01', '42703', '42501'].includes(error.code) ||
    /does not exist|schema cache|permission denied/i.test(error.message || '')
  )
}

function need() {
  if (!supabase) throw new Error('The contest is not connected to its database yet.')
  return supabase
}

async function rows(query) {
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

async function optional(query, empty) {
  const { data, error } = await query
  if (error) {
    if (isUnavailable(error)) return empty
    throw error
  }
  return data ?? empty
}

async function fetchAll(build) {
  const out = []
  for (let from = 0; ; from += PAGE) {
    const data = await rows(build().range(from, from + PAGE - 1))
    out.push(...data)
    if (data.length < PAGE) return out
  }
}

async function withFallback(run, cols, baseCols) {
  try {
    return await run(cols)
  } catch (e) {
    if (isUnavailable(e)) return run(baseCols)
    throw e
  }
}

export function fetchContests() {
  const db = need()
  const run = (cols) => rows(db.from('contests').select(cols).order('year', { ascending: false }))
  // Newest columns first; a backend a migration behind still loads.
  return withFallback(run, CONTEST_FREE_COLS, CONTEST_COLS).catch((e) => {
    if (isUnavailable(e)) return run(CONTEST_BASE_COLS)
    throw e
  })
}

export function fetchRounds(contestId) {
  return rows(need().from('rounds').select(ROUND_COLS).eq('contest_id', contestId).order('seq'))
}

export function fetchShelters(contestId) {
  return optional(need().from('shelters').select('id, name, url, logo_path').eq('contest_id', contestId).order('name'), [])
}

export function fetchPacks(contestId) {
  return optional(
    need()
      .from('vote_packs')
      .select('id, slug, label, votes, cents, sort, featured')
      .eq('contest_id', contestId)
      .eq('active', true)
      .order('sort'),
    [],
  )
}

export function fetchBonusWindows(contestId) {
  return optional(
    need()
      .from('bonus_windows')
      .select('id, starts_at, ends_at, multiplier, label, sponsor_name, sponsor_url')
      .eq('contest_id', contestId)
      .order('starts_at'),
    [],
  )
}

// Every contest's windows (a handful a year), so the page can ask for them
// alongside the contest list instead of after it: a Double Votes bar that
// lands after the page has painted shoves everything below it down.
export function fetchAllBonusWindows() {
  return optional(
    need()
      .from('bonus_windows')
      .select('id, contest_id, starts_at, ends_at, multiplier, label, sponsor_name, sponsor_url')
      .order('starts_at')
      .limit(500),
    [],
  )
}

export async function fetchStats(contestId) {
  const data = await optional(
    need()
      .from('contest_stats')
      .select('contest_id, entries, votes, gross_cents, shelter_cents, beneficiary_split_pct')
      .eq('contest_id', contestId)
      .limit(1),
    [],
  )
  return data[0] || null
}

export function fetchEntries(contestId) {
  const db = need()
  const run = (cols) =>
    fetchAll(() =>
      db
        .from('entries')
        .select(cols)
        .eq('contest_id', contestId)
        .eq('status', 'approved')
        .order('created_at')
        .order('id'),
    )
  return withFallback(run, ENTRY_COLS, ENTRY_BASE_COLS)
}

export async function fetchEntry(id) {
  const db = need()
  const run = async (cols) => {
    const data = await rows(db.from('entries').select(cols).eq('id', id).eq('status', 'approved').limit(1))
    return data[0] || null
  }
  return withFallback(run, ENTRY_COLS, ENTRY_BASE_COLS)
}

// A few entries by id, for views that show a handful (the article widget)
// without loading the whole field.
export function fetchEntriesByIds(ids) {
  if (!ids.length) return Promise.resolve([])
  const db = need()
  const run = (cols) => rows(db.from('entries').select(cols).in('id', ids).eq('status', 'approved'))
  return withFallback(run, ENTRY_COLS, ENTRY_BASE_COLS)
}

// The earliest (or newest) `limit` approved entries.
export function fetchEntriesByAge(contestId, limit, { newest = false } = {}) {
  const db = need()
  const run = (cols) =>
    rows(
      db
        .from('entries')
        .select(cols)
        .eq('contest_id', contestId)
        .eq('status', 'approved')
        .order('created_at', { ascending: !newest })
        .order('id')
        .limit(limit),
    )
  return withFallback(run, ENTRY_COLS, ENTRY_BASE_COLS)
}

// Map<entry_id, { votes, free }> for one round. votes is paid plus free;
// free is the free share, shown under the count.
export async function fetchTotals(roundId) {
  const run = (cols) => fetchAll(() => need().from('entry_round_totals').select(cols).eq('round_id', roundId).order('entry_id'))
  const data = await withFallback(run, 'entry_id, votes, free_votes', 'entry_id, votes')
  return new Map(data.map((r) => [r.entry_id, { votes: r.votes, free: r.free_votes || 0 }]))
}

// Map<round_id, Map<entry_id, { votes }>> for several (small) bracket rounds.
export async function fetchTotalsByRound(roundIds) {
  const out = new Map(roundIds.map((id) => [id, new Map()]))
  if (!roundIds.length) return out
  const data = await fetchAll(() =>
    need().from('entry_round_totals').select('round_id, entry_id, votes').in('round_id', roundIds).order('entry_id'),
  )
  for (const r of data) out.get(r.round_id)?.set(r.entry_id, { votes: r.votes })
  return out
}

export function fetchMatchups(roundIds) {
  if (!roundIds.length) return Promise.resolve([])
  return rows(need().from('matchups').select(MATCHUP_COLS).in('round_id', roundIds).order('slot'))
}

export function fetchActivity(roundId) {
  return optional(
    need()
      .from('recent_activity')
      .select('round_id, entry_id, votes, bonus_multiplier, confirmed_at')
      .eq('round_id', roundId)
      .order('confirmed_at', { ascending: false })
      .limit(10),
    [],
  )
}

export function fetchSideAwards(contestId) {
  return optional(
    need().from('side_awards').select('contest_id, species, entry_id, pet_name, votes').eq('contest_id', contestId),
    [],
  )
}

// Edge functions answer errors as { error: "message for the reader" }.
export async function callFunction(name, { json, form, token } = {}) {
  if (!SUPABASE_URL) throw new Error('The contest is not connected yet. Please try again later.')
  const headers = {}
  let body = form
  if (json) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(json)
  }
  if (token) headers.Authorization = `Bearer ${token}`
  let res
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, { method: 'POST', headers, body })
  } catch {
    throw new Error("We couldn't reach the contest server. Check your connection and try again.")
  }
  let payload = null
  try {
    payload = await res.json()
  } catch {
    payload = null
  }
  if (!res.ok) {
    const message =
      payload?.error || payload?.message || `Something went wrong on our end (error ${res.status}). Please try again.`
    const err = new Error(message)
    err.status = res.status
    throw err
  }
  return payload
}

export const submitEntry = (form) => callFunction('submit-entry', { form })
export const createCheckout = (json) => callFunction('create-checkout', { json })

const ADOPTABLE_URL = 'https://rowanflynnpilot.github.io/wpr-adopt-widget/snapshots/featured-pet.json'

// WPR's adopt widget snapshot. Cross-promotion only; any failure hides it.
export async function fetchFeaturedAdoptable() {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 6000)
    const res = await fetch(ADOPTABLE_URL, { signal: ctrl.signal })
    clearTimeout(timer)
    if (!res.ok) return null
    const pet = await res.json()
    return pet?.name && pet?.petUrl ? pet : null
  } catch {
    return null
  }
}
