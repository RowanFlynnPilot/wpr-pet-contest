import { describe, expect, it } from 'vitest'
import { fitWithin, THUMB_EDGE } from '../src/lib/image.js'
import { pickEntryPhoto, THUMB_MAX_WIDTH } from '../src/lib/photos.js'

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
