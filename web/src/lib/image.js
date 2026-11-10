// Re-encode a photo before upload. Reasons, all about the entrant:
//   * Phone photos carry EXIF GPS: the pet's home address, published.
//     Drawing to a canvas and exporting drops every metadata block.
//   * A 12 MB original fails on a rural LTE connection. A 2048px JPEG is
//     ~600 KB and still prints.
//   * The gallery shows hundreds of these to phones. An 800px copy (~100 KB)
//     goes up alongside, so the gallery is fast without paid image resizing.
// If any step fails the original goes up untouched and without a thumbnail;
// the server still checks type and size.

export const MAX_EDGE = 2048
export const THUMB_EDGE = 800
export const JPEG_QUALITY = 0.88
export const THUMB_QUALITY = 0.8
export const MAX_BYTES = 10 * 1024 * 1024
export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
// A phone that has not decoded the photo in this long is not going to; the
// original goes up instead (the server strips its metadata either way).
export const PREPARE_TIMEOUT_MS = 15000

// The type from the first bytes, the way submit-entry reads it. Some phones
// and file pickers hand over a photo with an empty type, or "image/jpg", so
// the label is a hint, not the answer. HEIC is not on the list (CLAUDE.md).
export function sniffBytes(b) {
  if (!b || b.length < 12) return null
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png'
  const ascii = (from, to) => String.fromCharCode(...b.slice(from, to))
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp'
  return null
}

// The photo's real type, or null when it is not one the web can show.
export async function photoType(file) {
  if (!file) return null
  try {
    return sniffBytes(new Uint8Array(await file.slice(0, 12).arrayBuffer()))
  } catch {
    // Unreadable here; trust a label we know, and let the server decide.
    const label = file.type === 'image/jpg' ? 'image/jpeg' : file.type
    return ACCEPTED_TYPES.includes(label) ? label : null
  }
}

export function fitWithin(width, height, max = MAX_EDGE) {
  const long = Math.max(width, height)
  if (long <= max) return { width, height }
  const scale = max / long
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

async function toJpeg(bitmap, max, quality) {
  const { width, height } = fitWithin(bitmap.width, bitmap.height, max)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  // JPEG has no alpha; a transparent PNG would otherwise come out black.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(bitmap, 0, 0, width, height)
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
  return blob && blob.size > 0 ? blob : null
}

// { photo: File, thumb: File | null }. Never hangs: past PREPARE_TIMEOUT_MS
// the original goes up as it is.
export function prepareUpload(file, timeoutMs = PREPARE_TIMEOUT_MS) {
  let timer
  const fallback = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ photo: file, thumb: null }), timeoutMs)
  })
  return Promise.race([reencode(file), fallback]).finally(() => clearTimeout(timer))
}

async function reencode(file) {
  try {
    if (typeof createImageBitmap !== 'function') return { photo: file, thumb: null }
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const [full, small] = [await toJpeg(bitmap, MAX_EDGE, JPEG_QUALITY), await toJpeg(bitmap, THUMB_EDGE, THUMB_QUALITY)]
    bitmap.close?.()
    if (!full) return { photo: file, thumb: null }
    const base = file.name.replace(/\.[^.]+$/, '')
    const stamp = Date.now()
    return {
      photo: new File([full], `${base}.jpg`, { type: 'image/jpeg', lastModified: stamp }),
      thumb: small ? new File([small], `${base}.thumb.jpg`, { type: 'image/jpeg', lastModified: stamp }) : null,
    }
  } catch {
    return { photo: file, thumb: null }
  }
}

export async function reencodeImage(file) {
  return (await prepareUpload(file)).photo
}
