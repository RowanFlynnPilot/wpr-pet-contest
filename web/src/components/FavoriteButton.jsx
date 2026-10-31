import { useState } from 'react'
import { track } from '../lib/analytics.js'
import { favorites, useIsFavorite } from '../lib/favorites.js'
import { Heart } from './Icons.jsx'

// The heart: keeps a pet on this device, privately (lib/favorites.js). The
// name stays the same either way; aria-pressed carries on and off.
export default function FavoriteButton({ entry, size = 20, className = '' }) {
  const on = useIsFavorite(entry.contest_id, entry.id)
  const [pop, setPop] = useState(false)

  function toggle() {
    const added = favorites.toggle(entry.contest_id, entry.id)
    setPop(added)
    track('Favorite', { action: added ? 'add' : 'remove', pet: entry.pet_name })
  }

  return (
    <button
      type="button"
      className={`fav-btn${pop ? ' pop' : ''}${className ? ` ${className}` : ''}`}
      aria-pressed={on}
      aria-label={`Save ${entry.pet_name} to favorites`}
      onClick={toggle}
      onAnimationEnd={() => setPop(false)}
    >
      <Heart size={size} filled={on} />
    </button>
  )
}
