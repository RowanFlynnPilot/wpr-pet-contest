import { IMAGE_TRANSFORMS, SUPABASE_URL } from './env.js'

// Photo URLs for the public `pets` bucket. The render endpoint needs a paid
// Supabase plan; without it, raw objects (re-encoded to <=2048px at upload).
export function buildPhotoUrl(base, path, { width, height, quality = 75, resize = 'cover', transforms = false } = {}) {
  if (!path) return null
  if (/^https?:\/\//.test(path)) return path
  const clean = path.split('/').map(encodeURIComponent).join('/')
  if (!transforms || !width) return `${base}/storage/v1/object/public/pets/${clean}`
  const q = new URLSearchParams({ width: String(width) })
  if (height) q.set('height', String(height))
  q.set('resize', resize)
  q.set('quality', String(quality))
  return `${base}/storage/v1/render/image/public/pets/${clean}?${q}`
}

export function photoUrl(path, opts = {}) {
  return buildPhotoUrl(SUPABASE_URL, path, { ...opts, transforms: IMAGE_TRANSFORMS })
}
