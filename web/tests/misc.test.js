import { describe, expect, it } from 'vitest'
import { attemptKey, nextRequestId, uuid } from '../src/lib/requestId.js'
import { fitWithin } from '../src/lib/image.js'
import { EMPTY_ENTRY, validateEntry } from '../src/lib/entryForm.js'
import { parseHash } from '../src/lib/router.js'
import { toCsv } from '../src/lib/csv.js'
import { fromLocalInput, toLocalInput } from '../src/lib/datetime.js'

describe('checkout request ids', () => {
  const body = { pack_slug: 'fan', round_id: 'r', entry_id: 'e', buyer_email: 'A@x.com', newsletter_opt_in: false }
  it('reuses the id for a retry of the identical request', () => {
    let n = 0
    const make = () => `id-${++n}`
    const first = nextRequestId(null, attemptKey(body), make)
    const again = nextRequestId(first, attemptKey({ ...body, buyer_email: ' a@x.com ' }), make)
    expect(again.id).toBe(first.id)
  })
  it('mints a new id when pack, pet or email changes', () => {
    let n = 0
    const make = () => `id-${++n}`
    const first = nextRequestId(null, attemptKey(body), make)
    expect(nextRequestId(first, attemptKey({ ...body, pack_slug: 'legend' }), make).id).not.toBe(first.id)
    expect(nextRequestId(first, attemptKey({ ...body, entry_id: 'other' }), make).id).not.toBe(first.id)
    expect(nextRequestId(first, attemptKey({ ...body, buyer_email: 'b@x.com' }), make).id).not.toBe(first.id)
  })
  it('generates RFC 4122 v4 ids', () => {
    expect(uuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})

describe('fitWithin', () => {
  it('leaves small photos alone', () => {
    expect(fitWithin(1200, 900)).toEqual({ width: 1200, height: 900 })
  })
  it('caps the long edge at 2048', () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 2048, height: 1536 })
    expect(fitWithin(3024, 4032)).toEqual({ width: 1536, height: 2048 })
  })
})

describe('validateEntry', () => {
  const photo = { size: 1000 }
  const good = { ...EMPTY_ENTRY, pet_name: 'Biscuit', species: 'dog', town: 'Wausau', owner_name: 'Pat', owner_email: 'pat@example.com', rights: true }
  it('accepts a complete entry', () => {
    expect(validateEntry(good, photo)).toEqual({})
  })
  it('requires the photo, the release and a real email', () => {
    const errors = validateEntry({ ...good, rights: false, owner_email: 'nope' }, null)
    expect(Object.keys(errors).sort()).toEqual(['owner_email', 'photo', 'rights'])
  })
  it('enforces the server limits', () => {
    expect(validateEntry({ ...good, pet_name: 'x'.repeat(41) }, photo).pet_name).toBeTruthy()
    expect(validateEntry({ ...good, caption: 'x'.repeat(281) }, photo).caption).toBeTruthy()
    expect(validateEntry({ ...good, caption: 'x'.repeat(280) }, photo).caption).toBeUndefined()
  })
  it('uses the free-text town for Other', () => {
    expect(validateEntry({ ...good, town: 'Other', town_other: '' }, photo).town).toBeTruthy()
    expect(validateEntry({ ...good, town: 'Other', town_other: 'Wittenberg' }, photo).town).toBeUndefined()
  })
})

describe('parseHash', () => {
  const id = '45d86334-7320-4238-bfd0-9bae59f0e115'
  it('routes pages', () => {
    expect(parseHash('').name).toBe('home')
    expect(parseHash('#/').name).toBe('home')
    expect(parseHash('#/gallery').name).toBe('gallery')
    expect(parseHash('#/admin/rounds')).toMatchObject({ name: 'admin', sub: 'rounds' })
    expect(parseHash('#/nope').name).toBe('notfound')
  })
  it('validates pet ids', () => {
    expect(parseHash(`#/pet/${id}`)).toMatchObject({ name: 'pet', id })
    expect(parseHash('#/pet/<script>').name).toBe('notfound')
  })
  it('reads query params', () => {
    expect(parseHash('#/gallery?species=dog').params).toEqual({ species: 'dog' })
  })
})

describe('toCsv', () => {
  it('quotes everything and defuses formulas', () => {
    const csv = toCsv([{ email: '=HYPERLINK("x")', sources: 'entry, vote pack' }])
    expect(csv).toBe('"email","sources"\r\n"\'=HYPERLINK(""x"")","entry, vote pack"')
  })
})

describe('datetime-local round trip', () => {
  it('survives input -> ISO -> input', () => {
    const iso = fromLocalInput('2026-10-10T19:30')
    expect(toLocalInput(iso)).toBe('2026-10-10T19:30')
    expect(fromLocalInput('')).toBeNull()
    expect(toLocalInput(null)).toBe('')
  })
})

import { cleanName, slim, thumb } from '../scripts/adoptables.mjs'

describe('adoptables', () => {
  it('drops the shelter notes from a name', () => {
    expect(cleanName('Argus *Barn Cat*')).toBe('Argus')
    expect(cleanName('Rowdy (fka Buddy)')).toBe('Rowdy')
    expect(cleanName('Jingle Belle *Bonded Pair*')).toBe('Jingle Belle')
  })
  it('asks the CDN for a small square', () => {
    expect(thumb('https://media.adoptapet.com/image/upload/c_auto,g_auto,w_400,ar_4:3,dpr_2/f_auto,q_auto/1314729895')).toBe(
      'https://media.adoptapet.com/image/upload/c_auto,g_auto,w_120,ar_1:1,dpr_2/f_auto,q_auto/1314729895',
    )
  })
  it('keeps pets with real photos, counts every pet', () => {
    const out = slim({
      lastUpdated: '2026-10-24T16:25:21Z',
      shelters: {
        marathon: [
          { name: 'Argus *Barn Cat*', species: 'Cat', breed: 'Domestic Shorthair', age: 'Adult', photo: 'https://media.adoptapet.com/image/upload/a/f/1' },
          { name: 'Breckie', species: 'Dog', photo: 'https://www.wausaubusinessdirectory.com/images/x' },
        ],
        lincoln: { 0: { name: 'Browse Adoptable Dogs', placeholder: true } },
      },
    })
    expect(out.total).toBe(2)
    expect(out.pets).toEqual([{ name: 'Argus', species: 'Cat', breed: 'Domestic Shorthair', age: 'Adult', photo: 'https://media.adoptapet.com/image/upload/c_auto,g_auto,w_120,ar_1:1,dpr_2/f/1' }])
  })
})
