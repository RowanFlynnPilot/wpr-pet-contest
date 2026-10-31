import { describe, expect, it } from 'vitest'
import { roadStops } from '../src/lib/road.js'
import { isUpset, matchupStanding } from '../src/lib/rank.js'

const states = (road) => [...road.stops.map((s) => `${s.label}:${s.state}`), `crown:${road.crown}`]
const rounds = [
  { seq: 1, status: 'resolved' },
  { seq: 2, status: 'resolved' },
  { seq: 3, status: 'open' },
  { seq: 4, status: 'pending' },
]

describe('the road to the crown', () => {
  it('before the bracket: the open round is next, then live', () => {
    expect(states(roadStops({ phase: 'submissions' }))).toEqual([
      'Open:next',
      'Sweet 16:ahead',
      'Elite 8:ahead',
      'Final 4:ahead',
      'Final:ahead',
      'crown:ahead',
    ])
    expect(roadStops({ phase: 'voting' }).stops[0].state).toBe('live')
  })

  it('a pet playing in the Elite Eight has won its way there', () => {
    const road = roadStops({ rounds, phase: 'voting', state: { status: 'alive', seq: 3, matchup: { winner_entry_id: null } } })
    expect(states(road)).toEqual(['Open:done', 'Sweet 16:done', 'Elite 8:live', 'Final 4:ahead', 'Final:ahead', 'crown:ahead'])
    expect(road.stops[2].name).toBe('Elite Eight')
  })

  it('a set matchup that has not opened is next', () => {
    const road = roadStops({ rounds, phase: 'intermission', state: { status: 'alive', seq: 4, matchup: { winner_entry_id: null } } })
    expect(road.stops[3].state).toBe('next')
  })

  it('a pet knocked out stops there, and the rest of the road is gone', () => {
    const road = roadStops({ rounds, phase: 'voting', state: { status: 'out', seq: 3 } })
    expect(states(road)).toEqual(['Open:done', 'Sweet 16:done', 'Elite 8:out', 'Final 4:gone', 'Final:gone', 'crown:gone'])
  })

  it('a pet that missed the cut is out in the open round', () => {
    expect(states(roadStops({ phase: 'complete', state: { status: 'unseeded' } }))[0]).toBe('Open:out')
  })

  it('the champion has the whole road and the crown', () => {
    const road = roadStops({ rounds, phase: 'complete', state: { status: 'champion', seq: 5 } })
    expect(road.stops.every((s) => s.state === 'done')).toBe(true)
    expect(road.crown).toBe('won')
  })

  it('seeded before its first matchup loads, it is in the bracket', () => {
    const road = roadStops({
      rounds: [
        { seq: 1, status: 'resolved' },
        { seq: 2, status: 'open' },
      ],
      phase: 'voting',
      state: { status: 'alive', seq: null },
    })
    expect(road.stops[1].state).toBe('live')
  })

  it('follows a smaller bracket', () => {
    expect(roadStops({ bracketSize: 8, phase: 'voting' }).stops.map((s) => s.label)).toEqual(['Open', 'Elite 8', 'Final 4', 'Final'])
  })
})

describe('upsets', () => {
  const byId = new Map([
    ['top', { id: 'top', seed: 1 }],
    ['dog', { id: 'dog', seed: 16 }],
  ])
  const st = (a, b) =>
    matchupStanding(
      { entry_a_id: 'top', entry_b_id: 'dog' },
      new Map([
        ['top', { votes: a }],
        ['dog', { votes: b }],
      ]),
      byId,
    )

  it('is the worse seed ahead on votes', () => {
    expect(isUpset(st(88, 149))).toBe(true)
    expect(isUpset(st(149, 88))).toBe(false)
  })

  it('never a tie: the better seed holds it', () => {
    expect(isUpset(st(40, 40))).toBe(false)
  })

  it('needs both seeds', () => {
    const noSeeds = matchupStanding({ entry_a_id: 'x', entry_b_id: 'y' }, new Map([['y', { votes: 9 }]]), new Map())
    expect(isUpset(noSeeds)).toBe(false)
  })
})

describe('what each stop carries', () => {
  it('a score, a seed or a date beside the round', () => {
    const road = roadStops({ phase: 'voting', state: { status: 'alive', seq: 3, matchup: { winner_entry_id: null } }, details: { 1: '#16', 2: '149–88' } })
    expect(road.stops.map((s) => s.detail)).toEqual(['#16', '149–88', null, null, null])
  })
})
