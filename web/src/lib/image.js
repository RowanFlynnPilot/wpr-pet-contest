// Re-encode a photo before upload. Two reasons, both about the entrant:
//   * Phone photos carry EXIF GPS: the pet's home address, published.
//     Drawing to a canvas and exporting drops every metadata block.
//   * A 12 MB original fails on a rural LTE connection. A 2048px JPEG is
//     ~600 KB and still prints.
// If any step fails the original goes up untouched; the server still checks
// type and size.

export const MAX_EDGE = 2048
export const JPEG_QUALITY = 0.88
export const MAX_BYTES = 10 * 1024 * 1024
export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export function fitWithin(width, height, max = MAX_EDGE) {
  const long = Math.max(width, height)
  if (long <= max) return { width, height }
  const scale = max / long
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

export async function reencodeImage(file) {
  try {
    if (typeof createImageBitmap !== 'function') return file
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const { width, height } = fitWithin(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    // JPEG has no alpha; a transparent PNG would otherwise come out black.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close?.()
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
    if (!blob || blob.size === 0) return file
    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg'
    return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() })
  } catch {
    return file
  }
}
