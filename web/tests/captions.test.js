import { describe, expect, it } from 'vitest'
import { captionsFor, FOLD, joinNames } from '../src/lib/graphics/captions.js'

const URL_ = 'https://wausaupilotandreview.com/pets/'
const o = { bracketSize: 16, splitPct: 30, year: 2026, contestName: 'Cutest Pet in Marathon County', shelterCents: 176100, voting: true }
const round = { id: 'r2', status: 'open', opens_at: '2026-10-28T12:00:00Z', closes_at: '2026-10-30T23:15:00Z' }
const pet = (name, seed, extra = {}) => ({ entry: { id: name.toLowerCase(), pet_name: name, town: 'Mosinee', seed }, seed, ...extra })
const side = (name, seed, votes) => ({ id: name.toLowerCase(), entry: { id: name.toLowerCase(), pet_name: name, seed }, seed, votes })

const cards = {
  leaderboard: { meta: { kind: 'leaderboard', ranked: [{ ...pet('Ziggy', null), votes: 395, rank: 1 }], round: { ...round, id: 'r1' }, final: false, o } },
  bubble: {
    meta: {
      kind: 'bubble',
      cut: 16,
      round: { ...round, id: 'r1' },
      rows: [{ ...pet('Maple', null), rank: 16, inside: true, note: '3 votes above the cut' }, { ...pet('Pickles', null), rank: 17, inside: false, note: '4 votes from the bracket' }],
      o,
    },
  },
  upset: { meta: { kind: 'matchup', round, label: 'Sweet 16', o, st: { a: side('Luna', 2, 90), b: side('Biscuit', 15, 111), leader: 'b', tied: false, winner: null } } },
  close: { meta: { kind: 'matchup', round, label: 'Sweet 16', o, st: { a: side('Luna', 2, 118), b: side('Biscuit', 15, 111), leader: 'a', tied: false, winner: null } } },
  walkover: { meta: { kind: 'matchup', round, label: 'Sweet 16', o, st: { a: side('Luna', 2, 0), b: { id: 'x', entry: null, seed: null, votes: 0 }, leader: 'a', tied: false, winner: null } } },
  winner: {
    meta: {
      kind: 'winner',
      o,
      results: { label: 'Sweet 16', nextLabel: 'Elite Eight', winners: [] },
      w: { ...pet('Gus', 16), votes: 149, opponent: { pet_name: 'Ziggy' }, opponentSeed: 1, opponentVotes: 88 },
    },
  },
  field: { meta: { kind: 'field', o, results: { nextLabel: 'Final Four', winners: [pet('Gus', 16), pet('Juniper', 12), pet('Luna', 2), pet('Maple', 6)] } } },
  champion: { meta: { kind: 'champion', o, c: { ...pet('Gus', 16), votes: 153, opponent: { pet_name: 'Luna' }, opponentVotes: 24 } } },
  milestone: { meta: { kind: 'milestone', cents: 150000, exact: 176100, shelters: [{ name: 'Moments Foster Care' }], o } },
}

describe('captionsFor', () => {
  for (const [name, card] of Object.entries(cards)) {
    it(`${name}: a hook inside every fold, one link, no donation talk`, () => {
      const c = captionsFor(card, { publicUrl: URL_ })
      expect(c).not.toBeNull()
      const fbFirst = c.facebook.split('\n')[0]
      expect(fbFirst.length).toBeLessThanOrEqual(FOLD.instagram)
      expect(c.instagram.split('\n')[0].length).toBeLessThanOrEqual(FOLD.instagram)
      expect(c.facebook.match(/https?:\/\//g)).toHaveLength(1)
      expect(c.instagram).not.toMatch(/https?:\/\//)
      expect(c.instagram).toMatch(/link in bio/)
      expect(c.short.length).toBeLessThanOrEqual(280 + 40)
      for (const text of [c.facebook, c.instagram, c.short]) {
        expect(text).not.toMatch(/donat|tax[- ]deductible|hurry|last chance|only \d+ left/i)
      }
    })
  }

  it('calls an upset an upset, with seeds', () => {
    expect(captionsFor(cards.upset, { publicUrl: URL_ }).hook).toBe('Upset alert: No. 15 Biscuit leads No. 2 Luna.')
    expect(captionsFor(cards.winner, { publicUrl: URL_ }).hook).toBe('No. 16 Gus knocked out No. 1 Ziggy.')
  })

  it('says how close a close race is', () => {
    expect(captionsFor(cards.close, { publicUrl: URL_ }).hook).toBe('Luna and Biscuit are 7 votes apart.')
  })

  it('says totals reset wherever counts carry over', () => {
    expect(captionsFor(cards.leaderboard, { publicUrl: URL_ }).facebook).toMatch(/Totals reset every round/)
    expect(captionsFor(cards.winner, { publicUrl: URL_ }).facebook).toMatch(/Totals reset/)
  })

  it('names the pet and its town, never a person', () => {
    const c = captionsFor(cards.champion, { publicUrl: URL_ })
    expect(c.hook).toBe('Gus of Mosinee is the 2026 Cutest Pet in Marathon County.')
    expect(c.facebook).toMatch(/\$1,761 for local animal shelters/)
  })

  it('names the shelter and the share, and rounds honestly', () => {
    const c = captionsFor(cards.milestone, { publicUrl: URL_ })
    expect(c.hook).toBe('More than $1,500 raised for local animal shelters.')
    expect(c.facebook).toMatch(/30% of every vote pack goes to Moments Foster Care/)
  })

  it('handles a walkover and cards without captions', () => {
    expect(captionsFor(cards.walkover, { publicUrl: URL_ }).hook).toMatch(/Luna advances.*opponent is out of the contest/)
    expect(captionsFor({ label: 'x' }, { publicUrl: URL_ })).toBeNull()
  })

  it('links to the WordPress page, not a stray hash', () => {
    expect(captionsFor(cards.close, { publicUrl: `${URL_}#/old` }).facebook).toMatch(/pets\/#\/bracket$/)
  })
})

describe('joinNames', () => {
  it('reads like a sentence', () => {
    expect(joinNames(['A'])).toBe('A')
    expect(joinNames(['A', 'B'])).toBe('A and B')
    expect(joinNames(['A', 'B', 'C'])).toBe('A, B and C')
    expect(joinNames([])).toBe('')
  })
})
