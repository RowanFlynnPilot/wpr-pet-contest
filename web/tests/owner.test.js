import { afterEach, describe, expect, it, vi } from 'vitest'
import { ownerPosts } from '../src/lib/ownerPosts.js'
import { rememberVia, viaFor } from '../src/lib/referral.js'
import { ownerLink } from '../src/lib/share.js'

const ID = '45d86334-7320-4238-bfd0-9bae59f0e115'
const BASE = {
  name: 'Biscuit',
  contest: 'Cutest Pet in Marathon County',
  url: `https://example.com/pets/#/pet/${ID}?via=o`,
  split: 50,
  bracketSize: 16,
  closes: 'Friday, Nov. 27 at 8 p.m.',
  opens: 'Saturday, Nov. 21 at 8 a.m.',
}

describe('ownerLink', () => {
  it('tags a hash route', () => {
    expect(ownerLink(`https://example.com/pets/#/pet/${ID}`)).toBe(`https://example.com/pets/#/pet/${ID}?via=o`)
  })
  it('tags a share page, with or without a query', () => {
    expect(ownerLink(`https://example.com/p/${ID}/`)).toBe(`https://example.com/p/${ID}/?via=o`)
    expect(ownerLink(`https://example.com/m/abc/?p=${ID}`)).toBe(`https://example.com/m/abc/?p=${ID}&via=o`)
  })
  it('extends a hash route that already has a query', () => {
    expect(ownerLink(`https://example.com/#/pet/${ID}?owner=x`)).toBe(`https://example.com/#/pet/${ID}?owner=x&via=o`)
  })
  it('leaves nothing alone', () => {
    expect(ownerLink(null)).toBe(null)
  })
})

describe('ownerPosts', () => {
  const stages = ['before', 'open', 'lastchance', 'qualified', 'matchup', 'unseeded', 'out', 'champion']
  const all = stages.map((stage) => [stage, ownerPosts({ ...BASE, stage, round: 'Elite Eight', opponent: 'Luna', club: 500, raised: '$1,240' })])

  it('writes all three posts for every stage', () => {
    for (const [, p] of all) for (const k of ['facebook', 'instagram', 'text']) expect(p[k].length).toBeGreaterThan(20)
  })
  it('never calls a vote pack a donation, and never promises a deduction', () => {
    for (const [, p] of all) for (const t of Object.values(p)) expect(t).not.toMatch(/donat|tax/i)
  })
  it('puts the link where it is clickable and "link in bio" where it is not', () => {
    const p = ownerPosts({ ...BASE, stage: 'open' })
    expect(p.facebook).toContain(BASE.url)
    expect(p.text).toContain(BASE.url)
    expect(p.instagram).not.toContain('http')
    expect(p.instagram).toContain('Link in bio')
    expect(p.instagram).toMatch(/#\w+/)
  })
  it('says half for a 50/50 split, and the figure otherwise', () => {
    expect(ownerPosts({ ...BASE, stage: 'open' }).facebook).toContain('Half of every vote pack')
    expect(ownerPosts({ ...BASE, stage: 'open', split: 30 }).facebook).toContain('30% of every vote pack')
  })
  it('names the opponent and the reset in a matchup', () => {
    const p = ownerPosts({ ...BASE, stage: 'matchup', round: 'Elite Eight', opponent: 'Luna' })
    expect(p.facebook).toContain('Luna')
    expect(p.facebook).toContain('starts at zero')
    expect(p.text).toContain(BASE.closes)
  })
  it('thanks voters once the run is over, with the club and the total when there is one', () => {
    const p = ownerPosts({ ...BASE, stage: 'out', round: 'Elite Eight', club: 500, raised: '$1,240' })
    expect(p.facebook).toMatch(/^Thank you/)
    expect(p.facebook).toContain('500')
    expect(p.facebook).toContain('$1,240')
    expect(ownerPosts({ ...BASE, stage: 'out', round: 'Elite Eight' }).facebook).not.toMatch(/\s{2}|undefined|null/)
  })
  it('never doubles the period after a.m. or p.m.', () => {
    for (const [, p] of all) for (const t of Object.values(p)) expect(t).not.toMatch(/\.\./)
  })
  it('opens with when voting starts before it does', () => {
    expect(ownerPosts({ ...BASE, stage: 'before' }).facebook).toContain(`Voting opens ${BASE.opens}`)
  })
})

describe('referral memory', () => {
  afterEach(() => vi.unstubAllGlobals())
  const store = () => {
    const m = new Map()
    vi.stubGlobal('localStorage', { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) })
    return m
  }

  it('remembers an owner-link visit for a week, per pet', () => {
    store()
    const t = Date.UTC(2026, 10, 20)
    rememberVia(ID, t)
    expect(viaFor(ID, t + 6 * 86400e3)).toBe('owner')
    expect(viaFor(ID, t + 8 * 86400e3)).toBe(null)
    expect(viaFor('another', t)).toBe(null)
  })
  it('lets old visits fall away', () => {
    const m = store()
    const t = Date.UTC(2026, 10, 20)
    rememberVia('old', t)
    rememberVia(ID, t + 9 * 86400e3)
    expect(Object.keys(JSON.parse(m.get('wpr-via')))).toEqual([ID])
  })
  it('does nothing where storage is blocked', () => {
    const boom = () => {
      throw new Error('blocked')
    }
    vi.stubGlobal('localStorage', { getItem: boom, setItem: boom, removeItem: boom })
    expect(() => rememberVia(ID)).not.toThrow()
    expect(viaFor(ID)).toBe(null)
  })
})
