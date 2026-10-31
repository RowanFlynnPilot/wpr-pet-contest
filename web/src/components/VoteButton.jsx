import { preloadCheckout, useCheckout } from './Checkout.jsx'

// The bare "Vote" button names its pet for screen readers. A button whose
// text already names the pet keeps that text as its name: voice control users
// say what they see, so a label must not differ from it.
export default function VoteButton({ entry, round, className = 'btn btn-primary btn-sm', children, label }) {
  const open = useCheckout()
  return (
    <button
      type="button"
      className={className}
      onPointerEnter={preloadCheckout}
      onFocus={preloadCheckout}
      onClick={() => open(entry, round)}
      aria-label={label || (children ? undefined : `Vote for ${entry.pet_name}`)}
    >
      {children || 'Vote'}
    </button>
  )
}
