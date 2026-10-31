import { useEffect, useRef, useState } from 'react'
import { NEWSROOM } from '../config.js'
import { fetchFeaturedAdoptable } from '../lib/api.js'
import { track } from '../lib/analytics.js'
import { APP_BASE } from '../lib/env.js'
import { fmtInt } from '../lib/format.js'
import { Arrow } from './Icons.jsx'

// One of the newsroom's adoptable pets, picked at random, as the way into its
// adoption page. The pets come from adoptables.json, built at deploy
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
  return (
    <a
      ref={ref}
      className={`adopt-button${pet ? ' has-pet' : ''} ${className}`}
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => track('Adopt Button', { pet: pet?.name || 'none' })}
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
          {pet
            ? [facts, others ? `one of ${fmtInt(pet.total)} pets waiting` : 'waiting for a home'].filter(Boolean).join(' · ')
            : `Adoptable pets from shelters across ${region}`}
        </span>
      </span>
      <span className="adopt-button-go" aria-hidden="true">
        <Arrow size={18} />
      </span>
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  )
}
