import { describe, expect, it } from 'vitest'
import { sharePage } from '../scripts/build-share-pages.mjs'

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
