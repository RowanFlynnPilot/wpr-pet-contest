import { describe, expect, it } from 'vitest'
import { matchupPage, sharePage } from '../scripts/build-share-pages.mjs'

const entry = { id: '45d86334-7320-4238-bfd0-9bae59f0e115', pet_name: 'Biscuit "B" <Boy>', species: 'dog', town: 'Weston', photo_path: 'c/x.jpg' }
const html = sharePage({
  entry,
  contestName: 'Cutest Pet in Marathon County',
  target: `https://wausaupilotandreview.com/pets/#/pet/${entry.id}`,
  selfUrl: `https://gh.io/app/p/${entry.id}/`,
  image: 'https://x.supabase.co/storage/v1/object/public/pets/c/x.jpg',
  transforms: false,
})

describe('per-pet share page', () => {
  it('carries the pet in its Open Graph tags', () => {
    expect(html).toContain('<meta property="og:title" content="Vote for Biscuit &quot;B&quot; &lt;Boy&gt; in the Cutest Pet in Marathon County contest">')
    expect(html).toContain(`<meta property="og:url" content="https://gh.io/app/p/${entry.id}/">`)
    expect(html).toContain('<meta property="og:image" content="https://x.supabase.co/storage/v1/object/public/pets/c/x.jpg">')
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">')
  })
  it('redirects with location.replace, not meta refresh, and keeps a fallback link', () => {
    expect(html).toContain(`location.replace("https://wausaupilotandreview.com/pets/#/pet/${entry.id}")`)
    expect(html).not.toMatch(/http-equiv=["']?refresh/i)
    expect(html).toContain(`href="https://wausaupilotandreview.com/pets/#/pet/${entry.id}"`)
  })
  it('never lets a pet name break out of the markup', () => {
    expect(html).not.toContain('<Boy>')
    expect(html).not.toContain('</script><')
  })
  it('only claims 1200x630 when the image is transformed', () => {
    expect(html).not.toContain('og:image:width')
  })
})

const card = {
  id: 'f3a0d1a2-5a8b-4d2c-9d6e-0b7c1f2e3a44',
  round: 'Sweet 16',
  closes: 'Tuesday, Nov. 18 at 7 p.m.',
  contest: 'Cutest Pet in Marathon County',
  a: { id: entry.id, pet_name: 'Biscuit', seed: 1, town: 'Weston', species: 'dog', photo: 'https://x.supabase.co/a.jpg', photo_path: 'c/a.jpg' },
  b: { id: '7c1e2d3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f', pet_name: 'Mochi <3', seed: 16, town: 'Wausau', species: 'cat', photo: 'https://x.supabase.co/b.jpg', photo_path: 'c/b.jpg' },
}

describe('per-matchup share page', () => {
  const withCard = matchupPage({ card, selfUrl: `https://gh.io/app/m/${card.id}/`, image: `https://gh.io/app/m/${card.id}/card.png`, cardImage: true })
  const without = matchupPage({ card, selfUrl: `https://gh.io/app/m/${card.id}/`, image: 'https://x.supabase.co/a.jpg', cardImage: false })

  it('names both pets, the round and the deadline for the crawlers', () => {
    expect(withCard).toContain('<meta property="og:title" content="Biscuit vs. Mochi &lt;3: Sweet 16">')
    expect(withCard).toContain('No. 1 Biscuit meets No. 16 Mochi &lt;3 in the Sweet 16 of the Cutest Pet in Marathon County contest. Voting closes Tuesday, Nov. 18 at 7 p.m. Every vote pack')
    expect(withCard).not.toContain('p.m..')
    expect(withCard).toContain(`<meta property="og:url" content="https://gh.io/app/m/${card.id}/">`)
  })
  it('claims the card size only when the card was drawn', () => {
    expect(withCard).toContain('og:image:width')
    expect(withCard).toContain(`m/${card.id}/card.png`)
    expect(without).not.toContain('og:image:width')
    expect(without).toContain('<meta property="og:image" content="https://x.supabase.co/a.jpg">')
  })
  it('sends a tap on to the named pet, or the bracket', () => {
    expect(withCard).toContain(`var ids = [${JSON.stringify(card.a.id)}, ${JSON.stringify(card.b.id)}];`)
    expect(withCard).toContain("ids.indexOf(p) >= 0 ? '#/pet/' + p : '#/bracket'")
    expect(withCard).not.toMatch(/http-equiv=["']?refresh/i)
  })
})
