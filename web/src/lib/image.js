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

// { photo: File, thumb: File | null }
export async function prepareUpload(file) {
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
