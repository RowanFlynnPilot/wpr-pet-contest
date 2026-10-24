import { describe, expect, it } from 'vitest'
import { matchupSharePageUrl, petPublicUrl, petSharePageUrl, shareLinks, shareText } from '../src/lib/share.js'
import { buildPhotoUrl } from '../src/lib/photos.js'

const ID = '45d86334-7320-4238-bfd0-9bae59f0e115'

describe('share URLs', () => {
  it('points readers at the WordPress page with a hash route', () => {
    expect(petPublicUrl('https://wausaupilotandreview.com/pet-contest/', ID)).toBe(`https://wausaupilotandreview.com/pet-contest/#/pet/${ID}`)
  })
  it('drops any existing hash from the base', () => {
    expect(petPublicUrl('https://example.com/page#/gallery', ID)).toBe(`https://example.com/page#/pet/${ID}`)
  })
  it('builds the per-pet share page under the app base', () => {
    expect(petSharePageUrl('https://rowanflynnpilot.github.io/wpr-pet-contest/', ID)).toBe(`https://rowanflynnpilot.github.io/wpr-pet-contest/p/${ID}/`)
    expect(petSharePageUrl('https://rowanflynnpilot.github.io/wpr-pet-contest', ID)).toBe(`https://rowanflynnpilot.github.io/wpr-pet-contest/p/${ID}/`)
    expect(matchupSharePageUrl('https://rowanflynnpilot.github.io/wpr-pet-contest/#/x', ID)).toBe(`https://rowanflynnpilot.github.io/wpr-pet-contest/m/${ID}/`)
  })
  it('gives crawlers the share page and people the public link', () => {
    const url = petPublicUrl('https://w.com/pets/', ID)
    const crawlerUrl = petSharePageUrl('https://gh.io/app/', ID)
    const text = shareText('Biscuit')
    const links = shareLinks({ url, crawlerUrl, text, subject: 'Vote for Biscuit!' })
    expect(links.facebook).toBe(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(crawlerUrl)}`)
    expect(links.x).toContain(`url=${encodeURIComponent(crawlerUrl)}`)
    expect(links.x).toContain(`text=${encodeURIComponent(text)}`)
    expect(links.sms.startsWith('sms:?&body=')).toBe(true)
    expect(decodeURIComponent(links.sms)).toContain(url)
    expect(decodeURIComponent(links.email)).toContain('subject=Vote for Biscuit!')
    expect(decodeURIComponent(links.email)).toContain(url)
  })
  it('falls back to the public link when there is no share page', () => {
    const links = shareLinks({ url: 'https://w.com/#/pet/1', text: 'hi' })
    expect(links.facebook).toContain(encodeURIComponent('https://w.com/#/pet/1'))
  })
  it('never calls it a donation', () => {
    expect(shareText('Biscuit').toLowerCase()).not.toContain('donat')
  })
})

describe('photo URLs', () => {
  const base = 'https://x.supabase.co'
  it('serves raw objects without transforms', () => {
    expect(buildPhotoUrl(base, 'c1/abc.jpg', { width: 600 })).toBe('https://x.supabase.co/storage/v1/object/public/pets/c1/abc.jpg')
  })
  it('uses the render endpoint with transforms on', () => {
    expect(buildPhotoUrl(base, 'c1/abc.jpg', { width: 600, transforms: true })).toBe(
      'https://x.supabase.co/storage/v1/render/image/public/pets/c1/abc.jpg?width=600&resize=cover&quality=75',
    )
    expect(buildPhotoUrl(base, 'c1/abc.jpg', { width: 1200, height: 630, transforms: true })).toContain('width=1200&height=630')
  })
  it('handles empty and absolute paths', () => {
    expect(buildPhotoUrl(base, null)).toBeNull()
    expect(buildPhotoUrl(base, 'https://cdn.example/x.png', { transforms: true, width: 5 })).toBe('https://cdn.example/x.png')
  })
})
