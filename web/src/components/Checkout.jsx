import { Component, createContext, lazy, Suspense, useCallback, useContext, useState } from 'react'
import Modal from './Modal.jsx'

// Stripe.js loads with the modal, not with the page: most readers never buy.
const loadModal = () => import('./CheckoutModal.jsx')
export const preloadCheckout = () => {
  loadModal().catch(() => {})
}

// A checkout chunk that fails to load (a flaky connection, or a tab left open
// across a deploy) stays a checkout problem instead of replacing the whole
// page. "Try again" makes a fresh lazy(), since React caches a failed one.
class LoadBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

function LoadFailed({ again, onRetry, onClose }) {
  return (
    <Modal label="Checkout could not load" onClose={onClose}>
      <div className="notice error" role="alert">
        <span>
          <strong>Checkout couldn&rsquo;t load.</strong>
          {again ? 'If this page has been open a while, reloading it usually fixes this.' : 'Check your connection, then try again.'} You
          have not been charged.
        </span>
      </div>
      <div className="hero-actions" style={{ marginTop: 14 }}>
        <button type="button" className="btn btn-primary" onClick={again ? () => window.location.reload() : onRetry}>
          {again ? 'Reload the page' : 'Try again'}
        </button>
        <button type="button" className="btn btn-quiet" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  )
}

const CheckoutContext = createContext(() => {})

export function CheckoutProvider({ children }) {
  const [target, setTarget] = useState(null)
  const [CheckoutModal, setModal] = useState(() => lazy(loadModal))
  const [attempts, setAttempts] = useState(0)
  // opts.pack: a pack to start on (the checkout reminder's link).
  const open = useCallback((entry, round, opts = {}) => setTarget({ entry, round, pack: opts.pack || null, key: Date.now() }), [])
  const close = useCallback(() => setTarget(null), [])
  const retry = () => {
    setModal(() => lazy(loadModal))
    setAttempts((n) => n + 1)
  }
  return (
    <CheckoutContext.Provider value={open}>
      {children}
      {target && (
        <LoadBoundary key={attempts} fallback={<LoadFailed again={attempts > 0} onRetry={retry} onClose={close} />}>
          <Suspense fallback={null}>
            <CheckoutModal key={target.key} entry={target.entry} round={target.round} initialPack={target.pack} onClose={close} />
          </Suspense>
        </LoadBoundary>
      )}
    </CheckoutContext.Provider>
  )
}

export const useCheckout = () => useContext(CheckoutContext)
