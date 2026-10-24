import { describe, expect, it } from 'vitest'
import { coverRect, displayUrl, ellipsize, fileName, fitText, timeLeft, wrapBalanced, wrapGreedy } from '../src/lib/graphics/layout.js'
import {
  bubbleRows,
  currentBracketRound,
  glue,
  lastDecidedRound,
  leaderboardRows,
  matchupCards,
  matchupLine,
  milestoneCents,
  ownerCopy,
  roundResults,
  sampleScenario,
  shelterLine,
  winnerLines,
} from '../src/lib/graphics/content.js'
import { rankOpenRound } from '../src/lib/rank.js'

// Every glyph half an em wide: predictable enough to reason about.
const measure = (text, size) => Array.from(text).length * size * 0.5
const widthAt = (size) => (t) => measure(t, size)

const H = 3600e3
const NOW = Date.parse('2026-10-20T15:00:00Z')

describe('fitText', () => {
  it('keeps a short name on one line at full size', () => {
    const f = fitText('Biscuit', measure, { maxWidth: 900, maxSize: 150 })
    expect(f).toMatchObject({ size: 150, lines: ['Biscuit'], truncated: false })
  })

  it('shrinks on one line before it wraps', () => {
    // 21 chars is 1050 wide at 100; one line fits at 85, above the floor of 80.
    const f = fitText('Clementine Butterbean', measure, { maxWidth: 900, maxSize: 100, floor: 80 })
    expect(f.lines).toEqual(['Clementine Butterbean'])
    expect(f.size).toBe(85)
  })

  it('wraps to two balanced lines once shrinking would go below the floor', () => {
    const f = fitText('Sir Reginald Fluffington III of Kronenwet', measure, { maxWidth: 900, maxSize: 150, floor: 104, wrapSize: 118, minSize: 64 })
    expect(f.lines).toHaveLength(2)
    expect(f.truncated).toBe(false)
    const w = widthAt(f.size)
    for (const l of f.lines) expect(w(l)).toBeLessThanOrEqual(900)
    // Balanced: neither line is a one-word widow.
    expect(Math.abs(f.lines[0].length - f.lines[1].length)).toBeLessThan(10)
    expect(f.lines.join(' ')).toBe('Sir Reginald Fluffington III of Kronenwet')
  })

  it('fits every 40-character name in a narrow column without cutting it', () => {
    const names = ['Princess Buttercup Marshmallow Fluffernut', 'Mr. Wiggles von Snugglepaws the Second', 'A B C D E F G H I J K L M N O P Q R S T']
    for (const name of names) {
      const f = fitText(name.slice(0, 40), measure, { maxWidth: 420, maxSize: 104, floor: 76, wrapSize: 84, minSize: 32, maxLines: 2 })
      expect(f.truncated).toBe(false)
      expect(f.lines.join(' ')).toBe(name.slice(0, 40).replace(/\s+/g, ' ').trim())
      for (const l of f.lines) expect(measure(l, f.size)).toBeLessThanOrEqual(420)
    }
  })

  it('never cuts a word to reach a bigger size', () => {
    // "Pending" alone is too wide at large sizes; breaking it would fit "Pendin / g 1".
    const f = fitText('Pending 1', measure, { maxWidth: 120, maxSize: 38, floor: 27, minSize: 18, maxLines: 2 })
    expect(f.lines.every((l) => l === 'Pending' || l === '1' || l === 'Pending 1')).toBe(true)
  })

  it('shrinks one long word on one line rather than breaking it', () => {
    const f = fitText('Supercalifragilistic', measure, { maxWidth: 400, maxSize: 100, minSize: 30 })
    expect(f.lines).toEqual(['Supercalifragilistic'])
    expect(f.size).toBe(40)
  })

  it('ellipsizes only when nothing else fits, and stays in the box', () => {
    const f = fitText('word '.repeat(60), measure, { maxWidth: 200, maxSize: 40, minSize: 20, maxLines: 2 })
    expect(f.truncated).toBe(true)
    expect(f.lines).toHaveLength(2)
    expect(f.lines[1].endsWith('…')).toBe(true)
    for (const l of f.lines) expect(measure(l, f.size)).toBeLessThanOrEqual(200)
  })

  it('reports the block height from its leading', () => {
    const f = fitText('Biscuit', measure, { maxWidth: 900, maxSize: 100, leading: 1.2 })
    expect(f.lineHeight).toBe(120)
    expect(f.height).toBe(120)
  })

  it('keeps no-break spaces together across a wrap', () => {
    const text = glue('Voting closes Saturday, Oct. 17 at 1:11 p.m.')
    const f = fitText(text, measure, { maxWidth: 300, maxSize: 28, floor: 26, minSize: 20, maxLines: 3 })
    expect(f.lines.some((l) => l === 'p.m.')).toBe(false)
    expect(f.lines.join(' ')).toContain('1:11 p.m.')
  })
})

describe('wrapping helpers', () => {
  it('balances two lines', () => {
    expect(wrapBalanced('Sir Reginald Fluffington III', widthAt(10))).toEqual(['Sir Reginald', 'Fluffington III'])
  })
  it('greedy wrap breaks an oversized word only when allowed', () => {
    expect(wrapGreedy('Supercalifragilistic', widthAt(10), 50)).toEqual(['Supercalif', 'ragilistic'])
    expect(wrapGreedy('Supercalifragilistic', widthAt(10), 50, { breakWords: false })).toEqual(['Supercalifragilistic'])
    for (const l of wrapGreedy('Supercalifragilistic', widthAt(10), 50)) expect(measure(l, 10)).toBeLessThanOrEqual(50)
  })
  it('ellipsizes to the width', () => {
    const s = ellipsize('Clementine Butterbean', widthAt(10), 60)
    expect(s.endsWith('…')).toBe(true)
    expect(measure(s, 10)).toBeLessThanOrEqual(60)
  })
})

describe('coverRect', () => {
  it('crops the sides of a landscape photo for a square', () => {
    const r = coverRect(1200, 900, 500, 500)
    expect(r.sx).toBeCloseTo(150)
    expect(r.sy).toBeCloseTo(0)
    expect(r.sw).toBeCloseTo(900)
    expect(r.sh).toBeCloseTo(900)
  })
  it('biases a portrait crop toward the top with focusY', () => {
    const r = coverRect(900, 1200, 900, 600, { focusY: 0.4 })
    expect(r.sw).toBe(900)
    expect(r.sh).toBe(600)
    expect(r.sy).toBe(240)
  })
  it('survives a zero-size image', () => {
    expect(coverRect(0, 0, 100, 100)).toEqual({ sx: 0, sy: 0, sw: 0, sh: 0 })
  })
})

describe('formatting', () => {
  it('shows where to vote as host and path', () => {
    expect(displayUrl('https://www.wausaupilotandreview.com/pet-contest/')).toBe('wausaupilotandreview.com/pet-contest')
    expect(displayUrl('https://rowanflynnpilot.github.io/wpr-pet-contest/#/pet/1?x=1')).toBe('rowanflynnpilot.github.io/wpr-pet-contest')
    expect(displayUrl('http://localhost:5173/')).toBe('localhost:5173')
  })
  it('counts down in days, then hours, then minutes, rounding down', () => {
    expect(timeLeft(NOW + 5.9 * 24 * H, NOW)).toBe('5 days left')
    expect(timeLeft(NOW + 62.7 * H, NOW)).toBe('62 hours left')
    expect(timeLeft(NOW + 1.5 * H, NOW)).toBe('1 hour left')
    expect(timeLeft(NOW + 45 * 60e3, NOW)).toBe('45 minutes left')
    expect(timeLeft(NOW - 1, NOW)).toBe('Voting has closed')
  })
  it('names files safely', () => {
    expect(fileName('Zoë & Max!', 'story', '1080x1920')).toBe('zoe-max-story-1080x1920.png')
    expect(fileName('', null)).toBe('pet-contest.png')
  })
})

const contestName = 'Cutest Pet in Marathon County'
const round = (seq, status, extra = {}) => ({ id: `r${seq}`, seq, kind: seq === 1 ? 'open' : 'bracket', status, opens_at: null, closes_at: new Date(NOW + 40 * H).toISOString(), ...extra })

describe('ownerCopy by phase', () => {
  const base = { name: 'Biscuit', bracketSize: 16, year: 2026, contestName, now: NOW }

  it('before voting: vote for the pet, with the opening date', () => {
    const c = ownerCopy({ ...base, phase: 'submissions', opensAt: new Date(NOW + 3 * 24 * H).toISOString() })
    expect(c.headline).toBe('Vote for Biscuit')
    expect(c.detail).toMatch(/^Voting opens /)
    expect(c.showVotes).toBe(false)
    expect(c.urlLead).toBe('Vote at')
  })

  it('open round: vote, show votes, and say when it closes', () => {
    const c = ownerCopy({ ...base, phase: 'voting', round: round(1, 'open') })
    expect(c.headline).toBe('Vote for Biscuit in the Open Round')
    expect(c.showVotes).toBe(true)
    expect(c.votesLabel).toBe('Open Round')
    expect(c.detail).toMatch(/^Voting closes .*(a|p)\.m\.$/)
  })

  it('bracket round: names the round when the pet is still in it', () => {
    const c = ownerCopy({ ...base, phase: 'voting', round: round(2, 'open'), state: { status: 'alive', seq: 2 }, seed: 4 })
    expect(c.headline).toBe('Vote for Biscuit in the Sweet 16')
    expect(c.votesLabel).toBe('Sweet 16')
  })

  it('bracket round: a pet already out gets thanks, not a vote button', () => {
    const c = ownerCopy({ ...base, phase: 'voting', round: round(3, 'open'), state: { status: 'out', seq: 2, label: 'Sweet 16' } })
    expect(c).toMatchObject({ tone: 'thanks', headline: 'What a run, Biscuit!', detail: 'Made it to the Sweet 16', showVotes: false, urlLead: 'Follow along at' })
  })

  it('after the deadline, before close_round: no live count', () => {
    const c = ownerCopy({ ...base, phase: 'counting', round: round(1, 'open') })
    expect(c.showVotes).toBe(false)
    expect(c.headline).toBe('Thanks for voting for Biscuit!')
  })

  it('after the open round: made the bracket, or thanks', () => {
    const r = round(1, 'resolved')
    expect(ownerCopy({ ...base, phase: 'intermission', round: r, nextRound: round(2, 'pending'), seed: 4 }).headline).toBe('Biscuit made the bracket!')
    expect(ownerCopy({ ...base, phase: 'intermission', round: r, nextRound: round(2, 'pending'), seed: null }).tone).toBe('thanks')
  })

  it('between bracket rounds: made the next round', () => {
    const c = ownerCopy({ ...base, phase: 'intermission', round: round(2, 'resolved'), nextRound: round(3, 'pending'), state: { status: 'alive', seq: 3 }, seed: 4 })
    expect(c.headline).toBe('Biscuit made the Elite Eight!')
    expect(c.detail).toBe('The Elite Eight opens soon.')
  })

  it('complete: the champion, and everyone else', () => {
    const champ = ownerCopy({ ...base, phase: 'complete', round: round(5, 'resolved'), state: { status: 'champion', seq: 5 } })
    expect(champ).toMatchObject({ tone: 'champion', headline: '2026 Champion', urlLead: 'Results at' })
    expect(ownerCopy({ ...base, phase: 'complete', round: round(5, 'resolved'), state: { status: 'out', seq: 4, label: 'Final Four' } }).headline).toBe('What a run, Biscuit!')
  })

  it('never says donation', () => {
    const phases = ['submissions', 'voting', 'counting', 'intermission', 'complete']
    for (const phase of phases) {
      const c = ownerCopy({ ...base, phase, round: round(1, phase === 'voting' ? 'open' : 'resolved'), seed: 1 })
      expect(JSON.stringify(c).toLowerCase()).not.toContain('donat')
    }
    expect(shelterLine(30).toLowerCase()).not.toContain('donat')
  })
})

describe('shelterLine', () => {
  it('states the split', () => {
    expect(shelterLine(30)).toBe('30% of every vote pack helps local animal shelters')
    expect(shelterLine(null)).toBe('Every vote pack helps local animal shelters')
  })
})

// 25 pets, created a second apart, votes falling with entry order.
const entries = Array.from({ length: 25 }, (_, i) => ({
  id: `e${i + 1}`,
  pet_name: `Pet ${i + 1}`,
  town: 'Wausau',
  created_at: new Date(NOW - (25 - i) * 1000).toISOString(),
  seed: i < 16 ? i + 1 : null,
}))
const totals = new Map(entries.map((e, i) => [e.id, { votes: 500 - i * 10 }]))
const ranked = rankOpenRound(entries, totals)

describe('leaderboard and bubble', () => {
  it('takes the top ten', () => {
    const rows = leaderboardRows(ranked)
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('shows 14 to 20 around a 16 cut, with each pet’s distance from the line', () => {
    const b = bubbleRows(ranked, 16)
    expect(b.rows.map((r) => r.rank)).toEqual([14, 15, 16, 17, 18, 19, 20])
    expect(b.rows.find((r) => r.rank === 16)).toMatchObject({ inside: true, note: '10 votes above the cut' })
    // #17 has 340 to #16's 350 and entered later: 11 to pass.
    expect(b.rows.find((r) => r.rank === 17)).toMatchObject({ inside: false, note: '11 votes from the bracket' })
  })

  it('explains a tie on the line', () => {
    const tied = new Map(totals)
    tied.set('e17', { votes: 350 })
    const b = bubbleRows(rankOpenRound(entries, tied), 16)
    expect(b.rows.find((r) => r.rank === 16).note).toBe('Tied with #17, in on the tiebreak')
    expect(b.rows.find((r) => r.rank === 17).note).toBe('1 vote from the bracket')
  })

  it('has no bubble when everyone qualifies', () => {
    expect(bubbleRows(ranked.slice(0, 16), 16)).toBeNull()
  })
})

const byId = new Map(entries.map((e) => [e.id, e]))
const m = (id, roundId, slot, a, b, winner = null) => ({ id, round_id: roundId, slot, entry_a_id: a, entry_b_id: b, winner_entry_id: winner })

describe('matchups', () => {
  const r2 = round(2, 'open')
  const matchups = [m('m1', 'r2', 1, 'e8', 'e9'), m('m0', 'r2', 0, 'e1', 'e16')]
  const t = new Map([
    ['e1', { votes: 40 }],
    ['e16', { votes: 52 }],
    ['e8', { votes: 30 }],
    ['e9', { votes: 30 }],
  ])

  it('lists the round’s matchups in bracket order', () => {
    const cards = matchupCards(matchups, r2, t, byId)
    expect(cards.map((c) => [c.matchup.id, c.index, c.count])).toEqual([
      ['m0', 1, 2],
      ['m1', 2, 2],
    ])
  })

  it('says who leads and by how much', () => {
    const [first, second] = matchupCards(matchups, r2, t, byId)
    expect(matchupLine(first)).toBe('Pet 16 leads Pet 1 by 12 votes')
    expect(matchupLine(second)).toBe('Tied at 30. Pet 8 wins ties as the better seed.')
    expect(matchupLine(first, { status: 'pending' })).toBe('Both pets start at zero when voting opens')
  })

  it('names a walkover instead of selling it as a race', () => {
    const [card] = matchupCards([m('m0', 'r2', 0, 'e1', 'gone')], r2, t, byId)
    expect(matchupLine(card)).toBe('Pet 1 advances: its opponent was disqualified')
  })

  it('reports a decided matchup as a final score', () => {
    const [card] = matchupCards([m('m0', 'r2', 0, 'e1', 'e16', 'e16')], r2, t, byId)
    expect(matchupLine(card)).toBe('Pet 16 wins, 52–40')
  })

  it('picks the open bracket round, else the next built one, else the last decided', () => {
    const rounds = [round(1, 'resolved'), round(2, 'resolved'), round(3, 'pending')]
    const built = [m('a', 'r2', 0, 'e1', 'e2', 'e1'), m('b', 'r3', 0, 'e1', 'e3')]
    expect(currentBracketRound(rounds, built).id).toBe('r3')
    expect(currentBracketRound(rounds, built.slice(0, 1)).id).toBe('r2')
    expect(currentBracketRound([round(1, 'resolved'), round(2, 'open')], []).id).toBe('r2')
    expect(currentBracketRound([round(1, 'open')], [])).toBeNull()
  })
})

describe('round results', () => {
  it('after the open round: the seeded field, in seed order, into the Sweet 16', () => {
    const res = roundResults({ rounds: [round(1, 'resolved'), round(2, 'pending')], matchups: [], entries: [...entries].reverse(), totals, bracketSize: 16 })
    expect(res).toMatchObject({ label: 'Open Round', nextLabel: 'Sweet 16', final: false })
    expect(res.winners.map((w) => w.seed)).toEqual(Array.from({ length: 16 }, (_, i) => i + 1))
    expect(winnerLines(res.winners[0], res)).toEqual({ headline: 'advances to the Sweet 16', detail: 'Seed 1 · 500 votes in the Open Round' })
  })

  it('after a bracket round: each winner and who they beat', () => {
    const rounds = [round(1, 'resolved'), round(2, 'resolved'), round(3, 'pending')]
    const t = new Map([
      ['e1', { votes: 40 }],
      ['e16', { votes: 52 }],
    ])
    const res = roundResults({ rounds, matchups: [m('m0', 'r2', 0, 'e1', 'e16', 'e16')], entries, totals: t, bracketSize: 16 })
    expect(res).toMatchObject({ label: 'Sweet 16', nextLabel: 'Elite Eight' })
    expect(res.winners).toHaveLength(1)
    expect(winnerLines(res.winners[0], res)).toEqual({ headline: 'advances to the Elite Eight', detail: 'Beat Pet 1 (seed 1), 52–40' })
  })

  it('after the final: the champion', () => {
    const rounds = [1, 2, 3, 4, 5].map((s) => round(s, 'resolved'))
    const res = roundResults({ rounds, matchups: [m('f', 'r5', 0, 'e1', 'e2', 'e2')], entries, totals: new Map(), bracketSize: 16 })
    expect(res).toMatchObject({ final: true, nextLabel: null, label: 'Championship' })
    expect(winnerLines(res.winners[0], res).headline).toBe('is the champion')
    expect(lastDecidedRound(rounds).seq).toBe(5)
  })

  it('nothing decided yet', () => {
    expect(roundResults({ rounds: [round(1, 'open')], matchups: [], entries, totals })).toBeNull()
  })
})

describe('milestones', () => {
  it('rounds the shelter total down to a step worth announcing', () => {
    expect(milestoneCents(425000)).toBe(400000)
    expect(milestoneCents(98765)).toBe(90000)
    expect(milestoneCents(1234500)).toBe(1200000)
    expect(milestoneCents(5000)).toBeNull()
  })
})

describe('sampleScenario', () => {
  it('builds a deterministic bracket on the real field', () => {
    const a = sampleScenario(entries, { bracketSize: 16, now: NOW })
    const b = sampleScenario(entries, { bracketSize: 16, now: NOW })
    expect(a.ranked.map((r) => r.votes)).toEqual(b.ranked.map((r) => r.votes))
    expect(a.bracketSize).toBe(16)
    expect(a.matchups).toHaveLength(8)
    expect(a.results.winners).toHaveLength(8)
    expect(a.openResults.winners).toHaveLength(16)
  })
  it('shrinks the bracket to the field', () => {
    expect(sampleScenario(entries.slice(0, 6), { bracketSize: 16, now: NOW }).bracketSize).toBe(4)
    expect(sampleScenario(entries.slice(0, 1))).toBeNull()
  })
})
