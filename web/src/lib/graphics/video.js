// The owner's Story as a 7-second video: the pet's photo, full frame, with
// "Vote for [name]", then the Story share card (owner.js) settles in and
// holds. Encoded in the browser with WebCodecs into an MP4, which Instagram
// and Facebook Stories take. No server, no upload: the file is made on the
// owner's phone.
//
// Every frame is drawn from its time alone (drawVideoFrame), so the video is
// the same however fast the phone is. Where WebCodecs or H.264 encoding is
// missing, canMakeVideo() is false and the button never shows.
import { C, F, drawBlock, fillRect, fitBlock, loadPhoto, makeCanvas } from './draw.js'
import { coverRect } from './layout.js'
import { OWNER_FORMATS, renderOwner } from './owner.js'

export const VIDEO = { width: 1080, height: 1920, fps: 30, seconds: 7 }

// When things happen, in seconds. The card arrives after the name has been
// read and holds long enough for a Story viewer to read it.
// The words leave before the card arrives, so the two never overlap.
export const TIMES = { kickerIn: [0.3, 0.75], nameIn: [0.45, 1.05], wordsOut: [1.95, 2.3], cardIn: [2.3, 3.0] }

const clamp01 = (v) => Math.max(0, Math.min(1, v))
const easeOut = (k) => 1 - Math.pow(1 - k, 3)
export const progress = (t, [a, b]) => easeOut(clamp01((t - a) / (b - a)))

export function canMakeVideo() {
  return typeof window !== 'undefined' && typeof window.VideoEncoder === 'function' && typeof window.VideoFrame === 'function'
}

// H.264 profiles from most to least capable, and a smaller size for phones
// that cannot encode a full 1080x1920 frame.
const CODECS = ['avc1.640028', 'avc1.4d0028', 'avc1.42002a']
const SIZES = [
  [1080, 1920],
  [720, 1280],
]
export async function pickEncoderConfig(Encoder = globalThis.VideoEncoder) {
  if (!Encoder?.isConfigSupported) return null
  for (const [width, height] of SIZES) {
    for (const codec of CODECS) {
      const config = { codec, width, height, bitrate: width >= 1080 ? 5_000_000 : 3_000_000, framerate: VIDEO.fps, avc: { format: 'avc' } }
      try {
        if ((await Encoder.isConfigSupported(config)).supported) return config
      } catch {
        // Try the next one.
      }
    }
  }
  return null
}

// One frame at time t, drawn in 1080x1920 coordinates (makeCanvas scales).
export function drawVideoFrame(ctx, t, { photo, card, name }) {
  const { width: W, height: H } = VIDEO
  fillRect(ctx, 0, 0, W, H, C.tealDeep)

  // The photo, full frame, pushing in slowly the whole time it shows.
  const cardK = progress(t, TIMES.cardIn)
  if (photo && cardK < 1) {
    const zoom = 1 + 0.08 * clamp01(t / (TIMES.cardIn[1] + 0.2))
    const r = coverRect(photo.naturalWidth, photo.naturalHeight, W, H, { focusY: 0.4 })
    const cw = r.sw / zoom
    const ch = r.sh / zoom
    ctx.drawImage(photo, r.sx + (r.sw - cw) / 2, r.sy + (r.sh - ch) * 0.4, cw, ch, 0, 0, W, H)
    // A shade under the words, so they read on any photo.
    const g = ctx.createLinearGradient(0, H * 0.45, 0, H)
    g.addColorStop(0, 'rgba(0,0,0,0)')
    g.addColorStop(1, 'rgba(0,0,0,0.72)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)

    // "VOTE FOR" and the name, ending above the Story reply bar (~220px).
    const M = 80
    const nameBlock = fitBlock(ctx, name, { maxWidth: W - M * 2, font: F.display(600), maxSize: 170, floor: 110, wrapSize: 128, minSize: 70, maxLines: 2, leading: 1.0 })
    const kicker = fitBlock(ctx, 'Vote for', { maxWidth: W - M * 2, font: F.sans(800), upper: true, track: 0.18, maxSize: 46, maxLines: 1 })
    const bottom = H - 300
    const nameTop = bottom - nameBlock.height
    const kickerTop = nameTop - 24 - kicker.height
    const out = 1 - progress(t, TIMES.wordsOut)
    const kk = progress(t, TIMES.kickerIn) * out
    const nk = progress(t, TIMES.nameIn) * out
    ctx.save()
    ctx.globalAlpha = kk
    drawBlock(ctx, kicker, { x: M, y: kickerTop + (1 - kk) * 30, color: C.sun })
    ctx.globalAlpha = nk
    drawBlock(ctx, nameBlock, { x: M, y: nameTop + (1 - nk) * 60, color: '#ffffff' })
    ctx.restore()
  }

  // The share card: zooms down into place over the photo, then holds,
  // drifting a touch closer so the frame never sits dead still.
  if (card && (cardK > 0 || !photo)) {
    const k = photo ? cardK : 1
    const settle = 1 + 0.12 * (1 - k) + 0.02 * clamp01((t - TIMES.cardIn[1]) / (VIDEO.seconds - TIMES.cardIn[1]))
    const w = W * settle
    const h = H * settle
    ctx.save()
    ctx.globalAlpha = k
    ctx.drawImage(card, (W - w) / 2, (H - h) / 2, w, h)
    ctx.restore()
  }
}

// Resolves to an MP4 Blob. onProgress(0..1) as frames are encoded.
export async function makeOwnerVideo(data, { onProgress = () => {} } = {}) {
  const config = await pickEncoderConfig()
  if (!config) throw new Error('This browser can’t make videos. Try the share image instead.')
  const [{ Muxer, ArrayBufferTarget }, card, photo] = await Promise.all([
    import('mp4-muxer'),
    renderOwner(
      OWNER_FORMATS.find((f) => f.id === 'story'),
      data,
      { scale: 1 },
    ),
    loadPhoto(data.entry, 1600),
  ])
  const { canvas, ctx } = makeCanvas(VIDEO.width, VIDEO.height, config.width / VIDEO.width)
  const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: 'avc', width: config.width, height: config.height }, fastStart: 'in-memory' })
  let failure = null
  const encoder = new window.VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      failure = e
    },
  })
  encoder.configure(config)

  const total = VIDEO.fps * VIDEO.seconds
  const step = 1_000_000 / VIDEO.fps
  for (let i = 0; i < total; i++) {
    if (failure) break
    drawVideoFrame(ctx, i / VIDEO.fps, { photo, card, name: data.entry.pet_name })
    const frame = new window.VideoFrame(canvas, { timestamp: Math.round(i * step), duration: Math.round(step) })
    encoder.encode(frame, { keyFrame: i % (VIDEO.fps * 2) === 0 })
    frame.close()
    // Don't run ahead of the encoder: a phone holds only so many frames.
    while (encoder.encodeQueueSize > 4 && !failure) await new Promise((r) => setTimeout(r, 5))
    if (i % 10 === 0) onProgress(i / total)
  }
  if (!failure) await encoder.flush()
  encoder.close()
  if (failure) throw failure
  muxer.finalize()
  onProgress(1)
  return new Blob([muxer.target.buffer], { type: 'video/mp4' })
}
