import { useState } from 'react'
import { photoUrl } from '../lib/photos.js'
import { Paw } from './Icons.jsx'

// Fixed aspect-ratio box, so nothing shifts as photos arrive. `contain` shows
// the whole photo over a blurred copy of itself instead of cropping ears off.
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
  const src = entry?.photo_path ? photoUrl(entry.photo_path, { width }) : null
  const label = alt ?? (entry ? `${entry.pet_name}${entry.town ? `, from ${entry.town}` : ''}` : '')
  const show = src && !failed
  return (
    <div className={`photo${square ? ' square' : ''}${contain ? ' contain' : ''} ${className}`}>
      {show && contain && <img className="backdrop" src={src} alt="" aria-hidden="true" loading={eager ? 'eager' : 'lazy'} decoding="async" />}
      {show ? (
        <img
          className="main"
          src={src}
          alt={label}
          loading={eager ? 'eager' : 'lazy'}
          fetchPriority={eager ? 'high' : undefined}
          decoding="async"
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
