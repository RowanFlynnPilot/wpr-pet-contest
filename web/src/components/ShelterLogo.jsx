import { useState } from 'react'
import { photoUrl } from '../lib/photos.js'
import { Paw } from './Icons.jsx'

// logo_path is either a full URL (a logo the shelter already hosts) or a path
// in the pets bucket. Staff cannot upload to the bucket, so a URL is the usual
// case.
export function shelterLogoUrl(logoPath) {
  if (!logoPath) return null
  return /^https?:\/\//i.test(logoPath) ? logoPath : photoUrl(logoPath)
}

// The shelter's logo in its box on the Shelters page and the Home card; a paw
// until one is set, or if it fails to load.
export default function ShelterLogo({ shelter }) {
  const [failed, setFailed] = useState(false)
  const src = shelterLogoUrl(shelter.logo_path)
  return (
    <span className="shelter-logo" aria-hidden="true">
      {src && !failed ? <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} /> : <Paw size={30} style={{ color: 'var(--teal)' }} />}
    </span>
  )
}

// A small mark beside the shelter's name inside a sentence (the thank-you
// screen, the footer). Nothing at all without a logo: the name carries it.
export function ShelterMark({ shelter, size = 20 }) {
  const [failed, setFailed] = useState(false)
  const src = shelterLogoUrl(shelter?.logo_path)
  if (!src || failed) return null
  // Sized inline: the footer sizes its badge with a bare `img` rule.
  return <img className="shelter-mark" src={src} alt="" width={size} height={size} style={{ width: size, height: size }} loading="lazy" onError={() => setFailed(true)} />
}
