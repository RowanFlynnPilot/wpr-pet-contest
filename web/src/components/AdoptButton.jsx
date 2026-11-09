import { useEffect, useRef, useState } from 'react'
import { NEWSROOM } from '../config.js'
import { fetchFeaturedAdoptable } from '../lib/api.js'
import { track } from '../lib/analytics.js'
import { APP_BASE } from '../lib/env.js'
import { fmtInt } from '../lib/format.js'
import { Arrow } from './Icons.jsx'

// One of the newsroom's adoptable pets, picked at random: its name and photo
// open that pet, and a line under it opens the whole adoption page. The pets
// come from adoptables.json, built at deploy
// (scripts/adoptables.mjs); without it, the newsroom's featured pet; without
// that, a plain invitation. Loaded only when the button nears the screen.
const clean = (name) =>
  String(name || '')
    .replace(/\*[^*]*\*/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()

async function pickPet() {
  try {
    const res = await fetch(`${APP_BASE}adoptables.json`, { cache: 'no-cache' })
    if (res.ok) {
      const data = await res.json()
      if (data?.pets?.length) return { ...data.pets[Math.floor(Math.random() * data.pets.length)], total: data.total || data.pets.length }
    }
  } catch {
    // Not built here (dev, or the feed was down at deploy): fall through.
  }
  const featured = await fetchFeaturedAdoptable()
  return featured ? { name: clean(featured.name), species: featured.species, breed: featured.breed, age: featured.age, photo: null } : null
}

// Where the pet's name and photo go: the pet itself, in the newsroom's adopt
// widget when it has one, else on its own Adopt-a-Pet page. Null when the
// listing is unknown (the featured-pet fallback), so the card has one link.
export function petHref(pet, page = NEWSROOM.adoptPetPage) {
  if (!pet) return null
  if (page && /^aap-\d+$/.test(pet.id || '')) return `${page}#pet/${pet.id}`
  return /^https:\/\/www\.adoptapet\.com\/pet\//.test(pet.url || '') ? pet.url : null
}

export default function AdoptButton({ className = '' }) {
  const url = NEWSROOM.adoptUrl
  const ref = useRef(null)
  const [pet, setPet] = useState(null)
  const [photoFailed, setPhotoFailed] = useState(false)

  useEffect(() => {
    if (!url || !ref.current) return
    let alive = true
    const load = () => pickPet().then((p) => alive && p && setPet(p))
    if (typeof IntersectionObserver === 'undefined') {
      load()
      return () => {
        alive = false
      }
    }
    const io = new IntersectionObserver(
      (seen) => {
        if (seen.some((e) => e.isIntersecting)) {
          io.disconnect()
          load()
        }
      },
      { rootMargin: '400px 0px' },
    )
    io.observe(ref.current)
    return () => {
      alive = false
      io.disconnect()
    }
  }, [url])

  if (!url) return null
  const facts = pet ? [pet.breed, pet.age].filter(Boolean).join(' · ') : ''
  const others = pet?.total > 1 ? pet.total - 1 : 0
  const region = NEWSROOM.adoptRegion || NEWSROOM.region
  const profile = petHref(pet)
  // With a pet's listing the card has two ways in: the pet, and every pet.
  // Without one, the whole card opens the adoption page, as before.
  return (
    <div ref={ref} className={`adopt-card${pet ? ' has-pet' : ''}${profile ? ' has-profile' : ''} ${className}`}>
      <a
        className="adopt-button"
        href={profile || url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => track('Adopt Button', { pet: pet?.name || 'none', to: profile ? 'pet' : 'all' })}
      >
        <span className="adopt-button-photo">
          {pet?.photo && !photoFailed ? (
            <img src={pet.photo} alt="" width="64" height="64" decoding="async" onError={() => setPhotoFailed(true)} />
          ) : (
            <span className="adopt-button-paw" aria-hidden="true">
              🐾
            </span>
          )}
          <span className="adopt-button-heart" aria-hidden="true">
            ❤️
          </span>
        </span>
        <span className="adopt-button-text">
          <span className="adopt-button-kicker">Adopt a pet</span>
          <span className="adopt-button-title">{pet ? `Meet ${pet.name}` : 'Meet a pet who needs a home'}</span>
          <span className="adopt-button-sub">
            {!pet
              ? `Adoptable pets from shelters across ${region}`
              : profile
                ? facts || 'Waiting for a home'
                : [facts, others ? `one of ${fmtInt(pet.total)} pets waiting` : 'waiting for a home'].filter(Boolean).join(' · ')}
          </span>
        </span>
        <span className="adopt-button-go" aria-hidden="true">
          <Arrow size={18} />
        </span>
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
      {profile && (
        <a
          className="adopt-all"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => track('Adopt Button', { pet: pet.name, to: 'all' })}
        >
          <span>
            {others ? `Browse all ${fmtInt(pet.total)} adoptable pets` : `Browse adoptable pets in ${region}`}
          </span>
          <Arrow size={15} />
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      )}
    </div>
  )
}
