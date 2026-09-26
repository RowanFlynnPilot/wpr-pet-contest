import { createContext, lazy, Suspense, useCallback, useContext, useState } from 'react'

// Stripe.js loads with the modal, not with the page: most readers never buy.
const loadModal = () => import('./CheckoutModal.jsx')
const CheckoutModal = lazy(loadModal)
export const preloadCheckout = () => {
  loadModal().catch(() => {})
}

const CheckoutContext = createContext(() => {})

export function CheckoutProvider({ children }) {
  const [target, setTarget] = useState(null)
  const open = useCallback((entry, round) => setTarget({ entry, round, key: Date.now() }), [])
  const close = useCallback(() => setTarget(null), [])
  return (
    <CheckoutContext.Provider value={open}>
      {children}
      {target && (
        <Suspense fallback={null}>
          <CheckoutModal key={target.key} entry={target.entry} round={target.round} onClose={close} />
        </Suspense>
      )}
    </CheckoutContext.Provider>
  )
}

export const useCheckout = () => useContext(CheckoutContext)
