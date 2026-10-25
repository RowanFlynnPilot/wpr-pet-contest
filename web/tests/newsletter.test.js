import { describe, expect, it } from 'vitest'
import { NOPTIN_LIMIT, bonusLine, buildNewsletterBlock, contestLink, esc, finaleLine, photoBox, sprintLine } from '../src/lib/newsletter.js'

const BASE = 'https://wausaupilotandreview.com/cutest-pet/'
const NOW = Date.parse('2026-10-27T11:05:00Z') // 6:05 a.m. Tuesday in Wausau
const contest = {
  id: 'c1',
  name: 'Cutest Pet in Marathon County',
  year: 2026,
  bracket_size: 16,
  submissions_open_at: '2026-10-01T05:00:00Z',
  submissions_close_at: '2026-10-09T04:59:00Z',
}
const pet = (i, extra = {}) => ({
  id: `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
  pet_name: `Pet ${i}`,
  town: 'Wausau',
  ...extra,
})
const build = (model, opts = {}) =>
  buildNewsletterBlock({ contest, now: NOW, stats: null, windows: [], ...model }, { base: BASE, campaign: 'morning-2026-10-27', ...opts })

describe('the newsletter block', () => {
  it('escapes everything a reader typed', () => {
    const evil = pet(1, { pet_name: '<img src=x onerror=alert(1)>"Rex"', town: 'Wausau & <b>Co</b>' })
    const html = build({
      phase: 'voting',
      round: { id: 'r1', seq: 1, closes_at: '2026-10-30T01:00:00Z' },
      leaders: [{ rank: 1, entry: evil, votes: 9 }],
    })
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('<b>Co</b>')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;&quot;Rex&quot; leads the Open Round')
    expect(html).toContain('Wausau &amp; &lt;b&gt;Co&lt;/b&gt;')
    expect(esc(`a'b`)).toBe('a&#39;b')
  })

  it('tags links the way the newsletter tags its own', () => {
    expect(contestLink(BASE, 'pet/abc', 'morning-2026-10-27')).toBe(
      `${BASE}?utm_source=newsletter&utm_medium=email&utm_campaign=morning-2026-10-27#/pet/abc`,
    )
    expect(contestLink(`${BASE}?p=1#/old`, 'gallery', '')).toBe(
      `${BASE}?p=1&utm_source=newsletter&utm_medium=email#/gallery`,
    )
  })

  it('invites entries with the closing time, not a countdown', () => {
    const html = build({
      phase: 'submissions',
      stats: { entries: 41 },
      recent: [pet(1), pet(2), pet(3)],
      now: Date.parse('2026-10-05T12:00:00Z'),
    })
    expect(html).toContain('41 pets are in so far.')
    expect(html).toContain('Entries close Thursday, Oct. 8 at 11:59 p.m.')
    expect(html).toContain('Enter your pet')
    expect(html).toContain('#/enter')
    expect(html).not.toMatch(/\bleft\b/)
  })

  it('shows the Open Round leaders, stamped, with the reset rule', () => {
    const html = build({
      phase: 'voting',
      round: { id: 'r1', seq: 1, closes_at: '2026-10-30T01:00:00Z' },
      stats: { shelter_cents: 123456 },
      leaders: [1, 2, 3, 4, 5].map((i) => ({ rank: i, entry: pet(i), votes: 600 - i * 100 })),
    })
    expect(html).toContain('Pet 1 leads the Open Round')
    expect(html).toContain('Voting closes Thursday, Oct. 29 at 8 p.m. The top 16 make the Sweet 16, where every total starts over at zero.')
    expect(html).toContain('Standings as of 6:05 a.m. Tuesday, Oct. 27')
    expect(html).toContain('$1,235 raised for local animal shelters so far')
    expect(html).toContain(`#/pet/${pet(3).id}`)
    expect(html).not.toMatch(/donat/i)
  })

  it('leads the bracket with the closest race and lists the rest', () => {
    const matchups = Array.from({ length: 8 }, (_, i) => ({ a: pet(i * 2), b: pet(i * 2 + 1), va: 100 + i, vb: 90 }))
    const html = build({ phase: 'voting', round: { id: 'r2', seq: 2, closes_at: '2026-10-30T01:00:00Z' }, matchups, hero: 0 })
    expect(html).toContain('Pet 0 and Pet 1 are 10 votes apart')
    expect(html).toContain('Totals reset every round')
    expect(html).toContain('Vote in the Sweet 16')
    expect(html).toContain('107</b>&nbsp;&ndash;&nbsp;')
    expect(html.match(/vs\./g)).toHaveLength(1) // the hero's divider only
  })

  it('names the next round between rounds, without counts', () => {
    const html = build({
      phase: 'intermission',
      nextRound: { id: 'r3', seq: 3, opens_at: '2026-10-28T13:00:00Z' },
      matchups: [{ a: pet(1, { seed: 1 }), b: pet(8, { seed: 8 }), va: null, vb: null }],
    })
    expect(html).toContain('The Elite Eight is set')
    expect(html).toContain('Voting opens Wednesday, Oct. 28 at 8 a.m. Every total starts over at zero.')
    expect(html).toContain('(1)')
    expect(html).not.toContain('Standings as of')
  })

  it('crowns the champion and thanks readers for the money', () => {
    const html = build({
      phase: 'complete',
      stats: { shelter_cents: 500000 },
      champion: { winner: pet(1, { pet_name: 'Gus', town: 'Weston' }), runnerUp: pet(2, { pet_name: 'Mabel' }), vw: 1204, vr: 998 },
    })
    expect(html).toContain('Meet the 2026 champion: Gus')
    expect(html).toContain('Gus of Weston won the Championship, 1,204-998 over Mabel. Readers raised $5,000 for local animal shelters.')
    expect(html).not.toContain('raised for local animal shelters so far')
  })

  it('has nothing to say before the contest is public', () => {
    expect(build({ phase: 'none' })).toBeNull()
  })

  it('credits the presenting sponsor as a paid link', () => {
    const html = build({ phase: 'submissions', recent: [] }, { sponsor: { name: 'Acme & Sons', url: 'https://acme.example/' } })
    expect(html).toContain(
      'Presented by <a href="https://acme.example/?utm_source=wausaupilotandreview&amp;utm_medium=email&amp;utm_campaign=pet-contest" rel="sponsored"',
    )
    expect(html).toContain('Acme &amp; Sons')
  })

  // The worst case: every name 33 characters, a Double Votes window on and a
  // sponsor credit, in every phase that lists pets.
  it('fits in one Noptin block in every phase, with long names', () => {
    const long = (i) => pet(i, { pet_name: `Sir Reginald Fluffington the ${i}th`, town: 'Kronenwetter', seed: i })
    const photos = new Map(
      Array.from({ length: 32 }, (_, i) => [
        long(i).id,
        { src: `https://abcdefghijklmnop.supabase.co/storage/v1/object/public/pets/2026/${long(i).id}.thumb.jpg`, w: 800, h: 600 },
      ]),
    )
    const pairs = (n, va = 1234, vb = 1200) => Array.from({ length: n }, (_, i) => ({ a: long(i * 2), b: long(i * 2 + 1), va, vb }))
    const extras = {
      photos,
      stats: { entries: 400, shelter_cents: 9e6 },
      windows: [
        { starts_at: '2026-10-27T23:00:00Z', ends_at: '2026-10-28T01:00:00Z', multiplier: 2, sponsor_name: 'Wausau Area Credit Union' },
      ],
    }
    const closes = '2026-10-30T01:00:00Z'
    const models = [
      {
        phase: 'voting',
        round: { seq: 1, closes_at: closes },
        leaders: [0, 1, 2, 3, 4].map((i) => ({ rank: i + 1, entry: long(i), votes: 9999 })),
      },
      ...[16, 8, 4, 2, 1].map((n) => ({ phase: 'voting', round: { seq: 2, closes_at: closes }, matchups: pairs(n), hero: 0 })),
      ...[16, 8, 4].map((n) => ({ phase: 'intermission', nextRound: { seq: 2, opens_at: closes }, matchups: pairs(n, null, null) })),
      { phase: 'submissions', recent: [long(1), long(2), long(3)], now: Date.parse('2026-10-05T12:00:00Z') },
    ]
    for (const model of models) {
      const html = build({ ...extras, ...model }, { sponsor: { name: 'Wausau Area Credit Union', url: 'https://example.com/' } })
      expect(html.length, `${model.phase} ${model.matchups?.length ?? ''}`).toBeLessThan(NOPTIN_LIMIT)
    }
  })

  it('points to the bracket page when a big field has more matchups than fit', () => {
    const matchups = Array.from({ length: 16 }, (_, i) => ({ a: pet(i * 2), b: pet(i * 2 + 1), va: 5, vb: 4 }))
    const html = build({
      phase: 'voting',
      round: { seq: 2, closes_at: '2026-10-30T01:00:00Z' },
      matchups,
      hero: 0,
      contest: { ...contest, bracket_size: 32 },
    })
    expect(html).toContain('And 9 more on the bracket page')
    expect(html).toContain('Round of 32')
  })
})

describe('Double Votes in the newsletter', () => {
  const w = (start, end, extra = {}) => ({ starts_at: start, ends_at: end, multiplier: 2, label: null, sponsor_name: null, ...extra })

  it('gives the window in clock times', () => {
    expect(bonusLine([w('2026-10-27T23:00:00Z', '2026-10-28T01:00:00Z', { sponsor_name: 'Acme' })], NOW)).toEqual({
      title: 'Double Votes',
      span: 'Tuesday, Oct. 27, 6 p.m. to 8 p.m.',
      counts: 'double',
      sponsor: 'Acme',
    })
    expect(bonusLine([w('2026-10-27T10:00:00Z', '2026-10-27T13:00:00Z')], NOW).span).toBe('until 8 a.m. Tuesday, Oct. 27')
  })

  it('skips windows that are over or too far off', () => {
    expect(
      bonusLine([w('2026-10-26T10:00:00Z', '2026-10-26T12:00:00Z'), w('2026-11-02T10:00:00Z', '2026-11-02T12:00:00Z')], NOW),
    ).toBeNull()
  })

  it('appears only while voting is open', () => {
    const windows = [w('2026-10-27T23:00:00Z', '2026-10-28T01:00:00Z')]
    const round = { id: 'r1', seq: 1, closes_at: '2026-10-30T01:00:00Z' }
    expect(build({ phase: 'voting', round, leaders: [], windows })).toContain('every vote pack bought then counts double')
    expect(build({ phase: 'counting', round, leaders: [], windows })).not.toContain('counts double')
  })
})

describe('square photos without object-fit', () => {
  it('covers the box from the real proportions', () => {
    expect(photoBox({ src: 'a.jpg', w: 800, h: 600 }, 120)).toContain('width="160" height="120"')
    expect(photoBox({ src: 'a.jpg', w: 800, h: 600 }, 120)).toContain('margin-left:-20px')
    expect(photoBox({ src: 'a.jpg', w: 600, h: 800 }, 120)).toContain('width="120" height="160"')
    expect(photoBox({ src: 'a.jpg', w: 600, h: 800 }, 120)).toContain('margin-top:-13px')
  })

  it('never distorts a photo it could not measure', () => {
    const html = photoBox({ src: 'a.jpg' }, 44)
    expect(html).toContain('width="44"')
    expect(html).not.toContain('height="')
    expect(html).toContain('height:auto')
    expect(photoBox(null, 44)).not.toContain('<img')
  })
})

describe('the newsletter block, new moments', () => {
  const round = { id: 'r1', seq: 1, closes_at: '2026-10-28T01:00:00Z', overtime_closes_at: '2026-10-29T01:00:00Z' }
  it('becomes Last Chance during the overtime, with the pool and the words spelled out', () => {
    const rows = [1, 2, 3, 4, 5].map((i) => ({ rank: i, entry: pet(i), votes: 200 - i * 10 }))
    const html = build({ phase: 'voting', round: { ...round, closes_at: round.overtime_closes_at, mainClosesAt: round.closes_at }, leaders: [], lastChance: { rows } })
    expect(html).toContain('Pet 1 leads Last Chance')
    expect(html).toContain('five pets just below the line')
    expect(html).toContain('Vote in Last Chance')
    expect(html).toContain('seed 16')
  })
  it('carries a sprint on its way and the finale', () => {
    const sprints = [{ id: 's', label: 'Tuesday night sprint', prize: 'a $50 gift card', sponsor_name: 'Example Pet Supply', starts_at: '2026-10-27T23:00:00Z', ends_at: '2026-10-28T02:00:00Z', cancelled_at: null }]
    expect(sprintLine(sprints, NOW).span).toBe('6 to 9 p.m. Tuesday, Oct. 27')
    expect(sprintLine(sprints, Date.parse('2026-10-28T00:00:00Z')).span).toBe('on now until 9 p.m.')
    expect(sprintLine([{ ...sprints[0], cancelled_at: '2026-10-26T00:00:00Z' }], NOW)).toBe(null)
    const finaleContest = { ...contest, finale_at: '2026-10-30T00:00:00Z' }
    expect(finaleLine(finaleContest, NOW).when).toBe('Thursday, Oct. 29 at 7 p.m.')
    expect(finaleLine({ ...contest, finale_at: '2026-11-20T00:00:00Z' }, NOW)).toBe(null)
    const html = buildNewsletterBlock(
      { contest: finaleContest, now: NOW, stats: null, windows: [], sprints, phase: 'voting', round: { id: 'r1', seq: 1, closes_at: '2026-10-30T01:00:00Z' }, leaders: [] },
      { base: BASE },
    )
    expect(html).toContain('Tuesday night sprint')
    expect(html).toContain('the most votes wins a $50 gift card, from Example Pet Supply')
    expect(html).toContain('The finale:')
  })
})
