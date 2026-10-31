import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ShelterMark, shelterLogoUrl } from '../src/components/ShelterLogo.jsx'

const partner = { name: 'Moments Foster Care', url: 'https://www.facebook.com/p/x/', logo_path: 'https://example.org/moments-foster-care.png' }

describe('the partner logo mark', () => {
  it('renders the logo at the asked size, decorative, beside the name', () => {
    const html = renderToStaticMarkup(h(ShelterMark, { shelter: partner, size: 40 }))
    expect(html).toContain('class="shelter-mark"')
    expect(html).toContain('src="https://example.org/moments-foster-care.png"')
    expect(html).toContain('alt=""')
    expect(html).toContain('width="40"')
    expect(html).toContain('width:40px')
  })
  it('renders nothing without a logo, so the name carries it', () => {
    expect(renderToStaticMarkup(h(ShelterMark, { shelter: { ...partner, logo_path: null } }))).toBe('')
    expect(renderToStaticMarkup(h(ShelterMark, { shelter: null }))).toBe('')
  })
  it('takes a full URL as is and a bucket path through the photo URL', () => {
    expect(shelterLogoUrl('https://example.org/a.png')).toBe('https://example.org/a.png')
    expect(shelterLogoUrl('shelters/moments.png')).toMatch(/\/storage\/v1\/.*shelters\/moments\.png/)
    expect(shelterLogoUrl(null)).toBeNull()
  })
})
