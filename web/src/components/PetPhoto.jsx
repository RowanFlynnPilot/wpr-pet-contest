import { useEffect, useRef, useState } from 'react'
import { entryPhotoUrl } from '../lib/photos.js'
import { Paw } from './Icons.jsx'

// Fixed aspect-ratio box, so nothing shifts as photos arrive. `contain` shows
// the whole photo over a blurred copy of itself instead of cropping ears off.
//
// While a lazy photo loads, a tiny copy of it sits blurred underneath and
// the photo fades in over it. Only where the host can serve a copy smaller
// than the photo (pre-rendered widths, or the render endpoint); otherwise the
// cream ground holds the box as before. Never for an eager photo: that one is
// usually the page's largest paint, and a fade would only delay it.
export default function PetPhoto({
  entry,
  width = 600,
  square = false,
  contain = false,
  eager = false,
  alt,
  className = '',
}) {
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const img = useRef(null)
  const src = entryPhotoUrl(entry, { width })
  const tiny = !eager && !contain ? entryPhotoUrl(entry, { width: 40 }) : null
  const blur = tiny && tiny !== src ? tiny : null
  const label = alt ?? (entry ? `${entry.pet_name}${entry.town ? `, from ${entry.town}` : ''}` : '')
  const show = src && !failed

  // A cached photo can finish before React attaches onLoad.
  useEffect(() => {
    if (img.current?.complete && img.current.naturalWidth) setLoaded(true)
  }, [src])

  const classes = ['photo', square && 'square', contain && 'contain', blur && show && 'has-ph', loaded && 'loaded', className].filter(Boolean).join(' ')
  return (
    <div className={classes}>
      {show && contain && <img className="backdrop" src={src} alt="" aria-hidden="true" loading={eager ? 'eager' : 'lazy'} decoding="async" />}
      {show && blur && <img className="ph" src={blur} alt="" aria-hidden="true" loading="lazy" decoding="async" />}
      {show ? (
        <img
          ref={img}
          className="main"
          src={src}
          alt={label}
          loading={eager ? 'eager' : 'lazy'}
          fetchPriority={eager ? 'high' : undefined}
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="photo-fallback" role={label ? 'img' : undefined} aria-label={label ? `${label} (photo unavailable)` : undefined}>
          <Paw />
        </div>
      )}
    </div>
  )
}
