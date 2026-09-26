import { preloadCheckout, useCheckout } from './Checkout.jsx'

export default function VoteButton({ entry, round, className = 'btn btn-primary btn-sm', children, label }) {
  const open = useCheckout()
  return (
    <button
      type="button"
      className={className}
      onPointerEnter={preloadCheckout}
      onFocus={preloadCheckout}
      onClick={() => open(entry, round)}
      aria-label={label || `Vote for ${entry.pet_name}`}
    >
      {children || 'Vote'}
    </button>
  )
}
