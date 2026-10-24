// The free daily vote, from the browser's side. The rules live in the database
// (0019) and the free-vote edge function; this only remembers the browser and
// carries requests.
import { callFunction } from './api.js'

// A browser that proved its address once votes in two taps on later days. The
// token is per contest: last year's voter is not this year's.
const key = (contestId) => `wpr-free-vote-device:${contestId}`
const memory = new Map()

export function getDevice(contestId) {
  if (!contestId) return null
  try {
    return localStorage.getItem(key(contestId)) || memory.get(contestId) || null
  } catch {
    // Storage blocked or partitioned in the WordPress iframe: this visit only.
    return memory.get(contestId) || null
  }
}

export function setDevice(contestId, token) {
  if (!contestId) return
  if (token) memory.set(contestId, token)
  else memory.delete(contestId)
  try {
    if (token) localStorage.setItem(key(contestId), token)
    else localStorage.removeItem(key(contestId))
  } catch {
    // As above: the in-memory copy carries this visit.
  }
}

export const freeVote = (action, payload = {}) => callFunction('free-vote', { json: { action, ...payload } })

// Emailed links carry a single-use token in the hash: fv=l.<token> confirms a
// code's vote, r.<token> is a morning reminder, u.<token> unsubscribes.
const KINDS = { l: 'link', r: 'reminder', u: 'unsubscribe' }
export function readLinkToken(params) {
  const m = /^([lru])\.([A-Za-z0-9_-]{40,64})$/.exec(params?.fv || '')
  return m ? { kind: KINDS[m[1]], token: m[2] } : null
}

// Once read, the token comes out of the address bar so it is not left in
// history or copied into a share. (The WordPress page clears its own copy;
// see EMBED.md.)
export function dropLinkToken() {
  const hash = window.location.hash
  const next = hash.replace(/([?&])fv=[^&]*(&|$)/, (_, lead, tail) => (tail ? lead : '')).replace(/\?$/, '')
  if (next !== hash) {
    try {
      window.history.replaceState(window.history.state, '', next || '#/')
    } catch {
      // Sandboxed frames may refuse; the token is single-use regardless.
    }
  }
}

// Free voting is on for the contest, not paused, and the round is taking votes.
export function freeVoteOpen(contest, round, now = Date.now()) {
  return Boolean(
    contest?.free_vote_enabled &&
      !contest.free_vote_paused_at &&
      round?.status === 'open' &&
      now >= new Date(round.opens_at).getTime() &&
      now <= new Date(round.closes_at).getTime(),
  )
}
