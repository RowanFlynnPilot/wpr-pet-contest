import { describe, expect, it } from 'vitest'
import { bracketRows, champion, openRoundRows, summary } from '../src/lib/archive.js'

const contest = {
  id: 'c', year: 2026, name: 'Cutest Pet', status: 'complete', beneficiary_split_pct: 30, bracket_size: 2,
  submissions_open_at: '2026-10-01T00:00:00Z', submissions_close_at: '2026-10-08T00:00:00Z',
}
const entries = [
  { id: 'a', pet_name: 'Ace', species: 'dog', town: 'Wausau', seed: 1, status: 'approved', created_at: '2026-10-02T00:00:00Z', owner_email: 'secret@example.com', owner_name: 'Secret' },
  { id: 'b', pet_name: 'Bea', species: 'cat', town: 'Weston', seed: 2, status: 'approved', created_at: '2026-10-01T00:00:00Z' },
  { id: 'c', pet_name: 'Cy', species: 'dog', town: 'Mosinee', seed: null, status: 'disqualified', created_at: '2026-10-03T00:00:00Z' },
]
const rounds = [
  { id: 'r1', seq: 1, opens_at: '2026-10-08T00:00:00Z', closes_at: '2026-10-15T00:00:00Z', resolved_at: '2026-10-15T00:10:00Z' },
  { id: 'r2', seq: 2, opens_at: '2026-10-15T01:00:00Z', closes_at: '2026-10-17T00:00:00Z', resolved_at: '2026-10-17T00:10:00Z' },
]
const matchups = [{ id: 'm', round_id: 'r2', slot: 0, entry_a_id: 'a', entry_b_id: 'b', winner_entry_id: 'b' }]
const results = [
  { round_id: 'r1', entry_id: 'a', votes: 50 },
  { round_id: 'r1', entry_id: 'b', votes: 50 },
  { round_id: 'r1', entry_id: 'c', votes: 10 },
  { round_id: 'r2', entry_id: 'a', votes: 20 },
  { round_id: 'r2', entry_id: 'b', votes: 30 },
]

describe('openRoundRows', () => {
  it('ranks by votes, ties to the earlier entry, and marks disqualified pets', () => {
    const rows = openRoundRows(entries, results.filter((r) => r.round_id === 'r1'))
    expect(rows.map((r) => [r.rank, r.pet, r.votes, r.seed, r.status])).toEqual([
      [1, 'Bea', 50, 2, ''],
      [2, 'Ace', 50, 1, ''],
      [3, 'Cy', 10, '', 'disqualified'],
    ])
  })
})

describe('bracketRows', () => {
  it('lists each matchup with both sides and the winner', () => {
    expect(bracketRows(contest, [rounds[1]], matchups, results, entries)).toEqual([
      { round: 'Championship', matchup: 1, pet_a: 'Ace', seed_a: 1, votes_a: 20, pet_b: 'Bea', seed_b: 2, votes_b: 30, winner: 'Bea' },
    ])
  })
})

describe('summary', () => {
  it('names the champion from the last round', () => {
    expect(champion(rounds, matchups, entries)).toBe('Bea')
  })

  it('never carries an owner or buyer detail', () => {
    const s = summary({
      contest, rounds, matchups, entries,
      sideAwards: [{ species: 'dog', pet_name: 'Ace', votes: 50 }],
      payout: { sales_cents: 5000, refunded_cents: 500, disputed_cents: 0, net_cents: 4500, shelter_pool_cents: 1350, purchases: 7 },
      shelterPayouts: [{ name: 'North', payout_weight: 1, amount_cents: 1350 }],
      packs: [{ label: 'Fan', votes: 25, cents: 2000 }],
    })
    const text = JSON.stringify(s)
    expect(text).not.toMatch(/secret|owner|email/i)
    expect(s.side_awards).toEqual([{ award: 'Best Dog', pet: 'Ace', votes: 50 }])
    expect(s.entries).toEqual({ approved: 2, disqualified: 1 })
    expect(s.money.shelter_pool_cents).toBe(1350)
  })
})
