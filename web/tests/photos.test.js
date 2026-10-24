import { describe, expect, it } from 'vitest'
import { fitWithin, THUMB_EDGE } from '../src/lib/image.js'
import { buildPhotoUrl, pickEntryPhoto, renditionPath, THUMB_MAX_WIDTH } from '../src/lib/photos.js'

const entry = { photo_path: 'c/abc.jpg', thumb_path: 'c/abc.thumb.jpg' }

describe('pickEntryPhoto', () => {
  it('uses the stored thumbnail for cards when the plan cannot resize', () => {
    expect(pickEntryPhoto(entry, { width: 600, transforms: false })).toEqual({ path: 'c/abc.thumb.jpg', resize: false })
  })

  it('uses the original when asked for more than the thumbnail holds', () => {
    expect(pickEntryPhoto(entry, { width: 1200, transforms: false })).toEqual({ path: 'c/abc.jpg', resize: false })
  })

  it('prefers on-the-fly resizing of the original when the plan supports it', () => {
    expect(pickEntryPhoto(entry, { width: 600, transforms: true })).toEqual({ path: 'c/abc.jpg', resize: true })
  })

  it('falls back to the original for entries uploaded without a thumbnail', () => {
    expect(pickEntryPhoto({ photo_path: 'c/old.jpg' }, { width: 300, transforms: false }).path).toBe('c/old.jpg')
  })

  it('handles a missing entry', () => {
    expect(pickEntryPhoto(null, { width: 300 }).path).toBeNull()
  })

  it('the thumbnail is made at least as wide as the widest card that uses it', () => {
    expect(THUMB_EDGE).toBeGreaterThanOrEqual(THUMB_MAX_WIDTH)
    expect(fitWithin(4032, 3024, THUMB_EDGE)).toEqual({ width: 800, height: 600 })
  })
})

// A static host with pre-rendered widths beside each photo (the demo build).
describe('renditions', () => {
  const widths = [320, 160]

  it('takes the smallest rendition that is wide enough', () => {
    expect(renditionPath('mock/7.jpg', 96, widths)).toBe('mock/7.w160.jpg')
    expect(renditionPath('mock/7.jpg', 160, widths)).toBe('mock/7.w160.jpg')
    expect(renditionPath('mock/7.jpg', 200, widths)).toBe('mock/7.w320.jpg')
  })

  it('serves the object itself when nothing is wide enough, or no width was asked', () => {
    expect(renditionPath('mock/7.jpg', 600, widths)).toBe('mock/7.jpg')
    expect(renditionPath('mock/7.jpg', undefined, widths)).toBe('mock/7.jpg')
  })

  it('leaves vector and unknown files alone', () => {
    expect(renditionPath('mock/7.svg', 96, widths)).toBe('mock/7.svg')
  })

  it('is not used when the host resizes on the fly', () => {
    expect(buildPhotoUrl('https://h', 'mock/7.jpg', { width: 96, transforms: true, renditions: widths })).toContain('/render/image/public/pets/mock/7.jpg?width=96')
    expect(buildPhotoUrl('https://h', 'mock/7.jpg', { width: 96, renditions: widths })).toBe('https://h/storage/v1/object/public/pets/mock/7.w160.jpg')
    expect(buildPhotoUrl('https://h', 'mock/7.jpg', { width: 96 })).toBe('https://h/storage/v1/object/public/pets/mock/7.jpg')
  })
})
