import { describe, expect, it } from 'vitest'
import { canMakeVideo, pickEncoderConfig, progress, TIMES, VIDEO } from '../src/lib/graphics/video.js'

describe('owner Story video', () => {
  it('is a 7-second vertical Story', () => {
    expect([VIDEO.width, VIDEO.height, VIDEO.fps, VIDEO.seconds]).toEqual([1080, 1920, 30, 7])
  })

  it('times every move inside the clip, the card last', () => {
    expect(progress(0, TIMES.nameIn)).toBe(0)
    expect(progress(TIMES.nameIn[1], TIMES.nameIn)).toBe(1)
    expect(progress(1.8, TIMES.cardIn)).toBe(0)
    expect(progress(TIMES.cardIn[1] + 1, TIMES.cardIn)).toBe(1)
    expect(TIMES.cardIn[0]).toBeGreaterThan(TIMES.nameIn[1] + 0.8) // the name is read first
    expect(TIMES.wordsOut[1]).toBeLessThanOrEqual(TIMES.cardIn[0]) // and gone before the card
    expect(VIDEO.seconds - TIMES.cardIn[1]).toBeGreaterThanOrEqual(3.5) // and the card held
  })

  it('takes the best H.264 profile the browser offers, then a smaller size', async () => {
    const offer = (ok) => ({ isConfigSupported: async (c) => ({ supported: ok(c) }) })
    expect((await pickEncoderConfig(offer(() => true))).codec).toBe('avc1.640028')
    const baselineOnly = await pickEncoderConfig(offer((c) => c.codec === 'avc1.42002a'))
    expect([baselineOnly.codec, baselineOnly.width]).toEqual(['avc1.42002a', 1080])
    const smallOnly = await pickEncoderConfig(offer((c) => c.width === 720))
    expect([smallOnly.width, smallOnly.height]).toEqual([720, 1280])
    expect(await pickEncoderConfig(offer(() => false))).toBe(null)
    expect(await pickEncoderConfig(undefined)).toBe(null)
  })

  it('hides itself where the browser cannot encode', () => {
    expect(canMakeVideo()).toBe(false) // no WebCodecs in the test runner
  })
})
