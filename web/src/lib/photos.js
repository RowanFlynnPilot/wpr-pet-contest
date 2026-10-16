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

// The 800px copy made at upload is plenty for a card or a thumbnail; anything
// asked for wider gets the original.
export const THUMB_MAX_WIDTH = 800

// For an entry: resized on the fly when the plan supports it, otherwise the
// stored thumbnail when it is big enough, otherwise the original.
export function pickEntryPhoto(entry, { width, transforms }) {
  if (!entry?.photo_path) return { path: null, resize: false }
  if (transforms) return { path: entry.photo_path, resize: true }
  if (entry.thumb_path && width && width <= THUMB_MAX_WIDTH) return { path: entry.thumb_path, resize: false }
  return { path: entry.photo_path, resize: false }
}

export function entryPhotoUrl(entry, opts = {}) {
  const pick = pickEntryPhoto(entry, { width: opts.width, transforms: IMAGE_TRANSFORMS })
  return buildPhotoUrl(SUPABASE_URL, pick.path, { ...opts, transforms: pick.resize })
}
