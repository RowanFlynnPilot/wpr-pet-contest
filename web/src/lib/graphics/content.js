// What each graphic says, decided without drawing anything. Copy rules:
//   * "vote packs", never "donation" (buyers receive something of value)
//   * vote counts are always this round's: totals reset every round
//   * the public sees the pet, never the owner: entries here carry only the
//     public columns (pet_name, town, photo_path, seed)
import { NEWSROOM } from '../../config.js'
import { TIME_ZONE, andList, apDate, apDateTime, plural } from '../format.js'
import { matchupStanding, votesToPass } from '../rank.js'
import { bracketSeedOrder, finalSeq, roundLabel, roundShortLabel } from '../rounds.js'
import { clubLabel } from '../milestones.js'

const done = (r) => r && (r.status === 'resolved' || r.status === 'closed')
const bySeq = (a, b) => a.seq - b.seq
const future = (v, now) => v && new Date(v).getTime() > now

// "Half of every vote pack goes to Moments Foster Care": the split, and the
// shelters by name once Setup has them.
export function shelterLine(pct, names = []) {
  const n = Number(pct)
  const who = andList(names.filter(Boolean)) || 'local animal shelters'
  return n === 50 ? `Half of every vote pack goes to ${who}` : n > 0 ? `${n}% of every vote pack goes to ${who}` : `Every vote pack helps ${who}`
}

// The badge on a vote count: "Open Round", "Sweet 16", "Elite 8".
export const votesBadge = (seq, bracketSize = 16) => (seq === 1 ? 'Open Round' : roundShortLabel(seq, bracketSize))

// No-break spaces inside "8 p.m." and "Oct. 17", so a wrap never strands
// "p.m." on a line of its own.
const MONTHS = /\b(Jan\.|Feb\.|March|April|May|June|July|Aug\.|Sept\.|Oct\.|Nov\.|Dec\.) (\d)/g
export const glue = (s) => (s == null ? s : String(s).replace(/ (a\.m\.|p\.m\.)/g, ' $1').replace(MONTHS, '$1 $2'))
const closes = (at) => glue(`Voting closes ${apDateTime(at)}`)

// ---------------------------------------------------------------- owners

// The owner's share image, by phase. `state` is the pet's entryStates() row
// once a bracket exists (status unseeded | alive | out | champion).
//   tone: vote | cheer (advanced) | thanks (out) | champion
//   urlLead: the words before the contest's address ("Vote at", or
//   "Follow along at" once this pet can no longer be voted for)
// lastChance: during Last Chance (lib/lastChance.js), { inPool, place } for
// this pet; the round then carries Last Chance's close.
export function ownerCopy({ name, phase, round, nextRound, state, seed, bracketSize = 16, year, contestName, opensAt, now = Date.now(), lastChance = null }) {
  const pet = String(name || 'this pet').trim()
  const label = round ? roundLabel(round.seq, bracketSize) : null
  const base = { kicker: contestName || `Cutest Pet in ${NEWSROOM.region}`, showVotes: false, votesLabel: null, closesAt: null, urlLead: 'Vote at' }
  const thanks = (urlLead = 'Follow along at') => {
    if (state?.status === 'out' && state.label) {
      return { ...base, urlLead, tone: 'thanks', headline: `What a run, ${pet}!`, detail: `Made it to the ${state.label}` }
    }
    return { ...base, urlLead, tone: 'thanks', headline: `Thanks for cheering on ${pet}!`, detail: null }
  }

  if (phase === 'complete') {
    if (state?.status === 'champion') {
      return { ...base, urlLead: 'Results at', tone: 'champion', headline: `${year ? `${year} ` : ''}Champion`, detail: 'Thank you to everyone who voted!' }
    }
    return thanks('Results at')
  }

  // Last Chance: racing for the last seed, already in, or finished.
  if (lastChance && round?.mainClosesAt && (phase === 'voting' || phase === 'counting')) {
    if (lastChance.inPool) {
      if (phase === 'counting') {
        return { ...base, urlLead: 'Results at', tone: 'vote', headline: `Thanks for voting for ${pet}!`, detail: 'Last Chance has closed. Results are being finalized.' }
      }
      return {
        ...base,
        kicker: 'Last Chance',
        tone: 'vote',
        headline: `Last Chance for ${pet}`,
        detail: closes(round.closes_at),
        closesAt: round.closes_at,
        showVotes: true,
        votesLabel: 'Open Round',
      }
    }
    if (lastChance.place != null && lastChance.place < bracketSize) {
      return { ...base, urlLead: 'Follow along at', tone: 'cheer', headline: `${pet} made the bracket!`, detail: `Finished No. ${lastChance.place} in the Open Round.` }
    }
    return thanks()
  }

  if (phase === 'voting' || phase === 'counting') {
    const inRound = round?.seq === 1 || (state?.status === 'alive' && state.seq === round?.seq)
    if (!inRound) return thanks()
    if (phase === 'counting') {
      return { ...base, urlLead: 'Results at', tone: 'vote', headline: `Thanks for voting for ${pet}!`, detail: 'Voting has closed. Results are being finalized.' }
    }
    return {
      ...base,
      tone: 'vote',
      headline: `Vote for ${pet} in the ${label}`,
      detail: closes(round.closes_at),
      closesAt: round.closes_at,
      showVotes: true,
      votesLabel: votesBadge(round.seq, bracketSize),
    }
  }

  if (phase === 'intermission' && round) {
    const next = nextRound ? roundLabel(nextRound.seq, bracketSize) : roundLabel(round.seq + 1, bracketSize)
    const opens = nextRound && future(nextRound.opens_at, now) ? glue(`opens ${apDate(nextRound.opens_at)}`) : 'opens soon'
    if (round.seq === 1) {
      if (seed == null) return thanks()
      return { ...base, tone: 'cheer', headline: `${pet} made the bracket!`, detail: `Seed ${seed}. The ${next} ${opens}.` }
    }
    if (state?.status === 'alive') {
      return { ...base, tone: 'cheer', headline: `${pet} made the ${next}!`, detail: `The ${next} ${opens}.` }
    }
    return thanks()
  }

  // Before voting: entries are open, or closed and waiting for round 1.
  return {
    ...base,
    tone: 'vote',
    headline: `Vote for ${pet}`,
    detail: future(opensAt, now) ? glue(`Voting opens ${apDate(opensAt)}`) : 'Voting opens soon',
  }
}

// ---------------------------------------------------------------- staff

// The open round's leaders. `ranked` is rankOpenRound() output.
export const leaderboardRows = (ranked, n = 10) => ranked.slice(0, n)

// The pets either side of the qualifying line (14 to 20 for a 16 bracket),
// each with the one fact worth posting: how far from the line it is.
export function bubbleRows(ranked, cut = 16, { above = 3, below = 4 } = {}) {
  if (ranked.length <= cut) return null
  const line = ranked[cut - 1]
  const chaser = ranked[cut]
  const rows = ranked.slice(Math.max(0, cut - above), Math.min(ranked.length, cut + below)).map((r) => {
    if (r.rank <= cut) {
      const ahead = r.votes - chaser.votes
      return { ...r, inside: true, note: ahead > 0 ? `${plural(ahead, 'vote')} above the cut` : `Tied with #${cut + 1}, in on the tiebreak` }
    }
    return { ...r, inside: false, note: `${plural(votesToPass(r, line), 'vote')} from the bracket` }
  })
  return { rows, cut }
}

// The bracket round worth posting about: the open one, else the next one
// once its matchups are built, else the last one decided.
export function currentBracketRound(rounds, matchups) {
  const bracket = rounds.filter((r) => r.kind === 'bracket').sort(bySeq)
  const built = new Set(matchups.map((m) => m.round_id))
  return (
    bracket.find((r) => r.status === 'open') ||
    bracket.find((r) => r.status === 'pending' && built.has(r.id)) ||
    [...bracket].reverse().find((r) => done(r) && built.has(r.id)) ||
    null
  )
}

export function matchupCards(matchups, round, totals, byId) {
  const list = matchups.filter((m) => m.round_id === round.id).sort((a, b) => a.slot - b.slot)
  return list.map((m, i) => ({ ...matchupStanding(m, totals, byId), matchup: m, index: i + 1, count: list.length }))
}

// One line under a matchup: who leads and by how much ("X votes behind" is
// the most shareable fact in the contest).
export function matchupLine(st, { status = 'open' } = {}) {
  // A side with an id but no public entry was disqualified or withdrawn (see MatchupCard).
  const name = (side) => side.entry?.pet_name || (side.id ? 'Removed' : 'TBD')
  const lead = st.leader === 'a' ? st.a : st.b
  const trail = st.leader === 'a' ? st.b : st.a
  if (!st.winner && st.a.id && st.b.id && Boolean(st.a.entry) !== Boolean(st.b.entry)) {
    return `${name(st.a.entry ? st.a : st.b)} advances: its opponent is out of the contest`
  }
  if (st.winner) {
    const w = st.winner === st.a.id ? st.a : st.b
    const l = w === st.a ? st.b : st.a
    return `${name(w)} wins, ${fmtPair(w.votes, l.votes)}`
  }
  if (status === 'pending') return 'Both pets start at zero when voting opens'
  if (st.tied) {
    if (!st.a.votes) return 'Tied at zero. The first vote takes the lead.'
    return `Tied at ${fmtN(st.a.votes)}. ${name(lead)} wins ties as the better seed.`
  }
  return `${name(lead)} leads ${name(trail)} by ${plural(lead.votes - trail.votes, 'vote')}`
}

const fmtN = (n) => new Intl.NumberFormat('en-US').format(n || 0)
const fmtPair = (a, b) => `${fmtN(a)}–${fmtN(b)}`

export const lastDecidedRound = (rounds) => [...rounds].filter(done).sort(bySeq).pop() || null

// The last decided round and who came out of it. Round 1's winners are the
// seeded field; a bracket round's are its matchup winners. `totals` is that
// round's Map<entry_id, { votes }>.
export function roundResults({ rounds, matchups, entries, totals, bracketSize = 16 }) {
  const round = lastDecidedRound(rounds)
  if (!round) return null
  const last = finalSeq(bracketSize)
  const label = roundLabel(round.seq, bracketSize)
  const nextLabel = round.seq < last ? roundLabel(round.seq + 1, bracketSize) : null
  const byId = new Map(entries.map((e) => [e.id, e]))
  let winners
  if (round.seq === 1) {
    winners = entries
      .filter((e) => e.seed != null)
      .sort((a, b) => a.seed - b.seed)
      .map((e) => ({ entry: e, seed: e.seed, votes: totals.get(e.id)?.votes || 0, opponent: null }))
  } else {
    winners = matchups
      .filter((m) => m.round_id === round.id && m.winner_entry_id)
      .sort((a, b) => a.slot - b.slot)
      .map((m) => {
        const st = matchupStanding(m, totals, byId)
        const w = st.winner === st.a.id ? st.a : st.b
        const l = w === st.a ? st.b : st.a
        return { entry: w.entry, seed: w.seed, votes: w.votes, opponent: l.entry, opponentSeed: l.seed, opponentVotes: l.votes }
      })
      .filter((w) => w.entry)
  }
  return { round, label, nextLabel, final: round.seq === last, winners }
}

// "advances to the Elite Eight", and the score that got it there.
export function winnerLines(w, { label, nextLabel }) {
  const headline = nextLabel ? `advances to the ${nextLabel}` : 'is the champion'
  const detail = w.opponent
    ? `Beat ${w.opponent.pet_name}${w.opponentSeed != null ? ` (seed ${w.opponentSeed})` : ''}, ${fmtPair(w.votes, w.opponentVotes)}`
    : `Seed ${w.seed} · ${plural(w.votes, 'vote')} in the ${label}`
  return { headline, detail }
}

// Rounds a total down to a milestone worth announcing: $4,250 -> $4,000.
// Null below the first step, where the exact figure is the only honest one.
export function milestoneCents(cents) {
  const dollars = Math.floor((Number(cents) || 0) / 100)
  const step = dollars < 1000 ? 100 : dollars < 10000 ? 500 : dollars < 100000 ? 1000 : 5000
  const m = Math.floor(dollars / step) * step
  return m > 0 ? m * 100 : null
}

// ---------------------------------------------------------------- preview

// Made-up numbers on the real field, so staff can check every layout before
// there are results to post. Every image drawn from this carries a SAMPLE
// band. Deterministic: the same field always gets the same numbers.
export function sampleScenario(entries, { bracketSize = 16, now = Date.now() } = {}) {
  if (entries.length < 2) return null
  let size = 2
  while (size * 2 <= Math.min(bracketSize, entries.length)) size *= 2
  let s = 0x9e3779b9 ^ entries.length
  const rand = () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 4294967296
  }
  const day = 86400000
  const r1 = { id: 'sample-r1', seq: 1, kind: 'open', status: 'open', opens_at: new Date(now - 4 * day).toISOString(), closes_at: new Date(now + 62 * 3600000).toISOString() }
  const totals1 = new Map(entries.map((e, i) => [e.id, { votes: Math.round(900 / (1 + i * 0.22) + rand() * 120) }]))
  const ranked = entries
    .map((entry) => ({ entry, votes: totals1.get(entry.id).votes }))
    .sort((a, b) => b.votes - a.votes || new Date(a.entry.created_at) - new Date(b.entry.created_at))
    .map((row, i) => ({ ...row, rank: i + 1 }))
  const seeded = ranked.slice(0, size).map((r, i) => ({ ...r.entry, seed: i + 1 }))
  const byId = new Map(seeded.map((e) => [e.id, e]))
  const r2 = { id: 'sample-r2', seq: 2, kind: 'bracket', status: 'open', opens_at: new Date(now - day).toISOString(), closes_at: new Date(now + 30 * 3600000).toISOString() }
  const order = bracketSeedOrder(size)
  const matchups = []
  for (let i = 0; i < order.length; i += 2) {
    matchups.push({ id: `sample-m${i / 2}`, round_id: r2.id, slot: i / 2, entry_a_id: seeded[order[i] - 1].id, entry_b_id: seeded[order[i + 1] - 1].id, winner_entry_id: null })
  }
  const totals2 = new Map(seeded.map((e) => [e.id, { votes: Math.round(80 + rand() * 260) }]))
  const decided = matchups.map((m) => {
    const st = matchupStanding(m, totals2, byId)
    return { ...m, winner_entry_id: st.leader === 'a' ? m.entry_a_id : m.entry_b_id }
  })
  const champ = seeded[0]
  const runnerUp = seeded[1] || seeded[0]
  return {
    bracketSize: size,
    openRound: r1,
    openTotals: totals1,
    ranked,
    seeded,
    byId,
    bracketRound: r2,
    matchups,
    bracketTotals: totals2,
    results: roundResults({ rounds: [{ ...r1, status: 'resolved' }, { ...r2, status: 'resolved' }], matchups: decided, entries: seeded, totals: totals2, bracketSize: size }),
    openResults: roundResults({ rounds: [{ ...r1, status: 'resolved' }], matchups: [], entries: seeded, totals: totals1, bracketSize: size }),
    champion: { entry: champ, seed: 1, votes: 1204, opponent: runnerUp, opponentSeed: runnerUp.seed, opponentVotes: 1150 },
    shelterCents: 425000,
  }
}

// ---------------------------------------------------------------- keepsake

// The keepsake certificate every entrant can make once their pet's run is
// over (or at the finish): what the pet did, its votes over the whole
// contest, its club, and, at the finish, what voters raised. Only true
// things, and never "donation".
//   state: entryStates() row (champion | out | unseeded), or null when the
//          pet ran only in the Open Round of a contest with no bracket yet
//   total: the pet's votes over every round (useContestTotals)
//   raised: dollars raised for the shelters, as text, only at the finish
export function keepsakeCopy({ name, year, contestName, state, total = 0, club = null, raised = null, shelters = [], entries = 0, endedAt = null }) {
  const pet = String(name || 'This pet').trim()
  const contest = contestName || `Cutest Pet in ${NEWSROOM.region}`
  let feat
  if (state?.status === 'champion') feat = `is the ${year ? `${year} ` : ''}champion of ${contest}`
  else if (state?.status === 'out' && state.label) feat = `made the ${state.label} of ${contest}${year ? ` ${year}` : ''}`
  else feat = `ran in ${contest}${year ? ` ${year}` : ''}${entries > 1 ? `, one of ${plural(entries, 'pet')}` : ''}`
  const bits = [feat]
  if (total > 0) bits.push(`with ${plural(total, 'vote')} in all`)
  // A no-break space keeps "500 Club" on one line.
  const clubPart = club ? ` A member of the ${clubLabel(club).replace(/ (Club)$/, '\u00a0$1')}.` : ''
  const achievement = `${bits.join(', ')}.${clubPart}`
  const names = shelters.filter(Boolean)
  const who = names.length === 1 ? names[0] : 'local animal shelters'
  const raisedLine = raised ? `Together, voters raised ${raised} for ${who}.` : 'Every vote pack helped local animal shelters.'
  return {
    kicker: glue(`${contest}${year ? ` · ${year}` : ''}`),
    title: state?.status === 'champion' ? 'Certificate of Champion Cuteness' : 'Certificate of Cuteness',
    lead: 'This certifies that',
    name: pet,
    achievement: glue(achievement),
    raised: glue(raisedLine),
    date: endedAt ? glue(apDate(endedAt, { weekday: false, year: true })) : null,
  }
}

// ---------------------------------------------------------------- the launch

// Which launch cards the Social desk offers (D-14 to the Open Round): 'soon'
// before entries open (a draft with its dates, or submissions staged),
// 'open' while they are, 'closed' after, until voting starts. null otherwise.
export function launchStage(contest, phase) {
  if (!contest) return null
  if (contest.status === 'draft' || phase === 'coming') return contest.submissions_open_at ? 'soon' : null
  if (phase === 'submissions') return 'open'
  if (phase === 'submissions_closed') return 'closed'
  return null
}

// Calendar days from `now` to `at` on the newsroom's clock: 0 is today, 1
// tomorrow, whatever the hour.
const dayKey = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t))
export function daysUntil(at, now = Date.now()) {
  return Math.round((Date.parse(dayKey(at)) - Date.parse(dayKey(now))) / 86400000)
}

// The countdown's words: "6 days" until entries open, then "tomorrow", "today".
export function countdownWords(at, now = Date.now()) {
  const d = daysUntil(at, now)
  if (d <= 0) return { big: 'Today', line: 'Entries open today', days: 0 }
  if (d === 1) return { big: 'Tomorrow', line: 'Entries open tomorrow', days: 1 }
  return { big: String(d), line: 'days until entries open', days: d }
}
