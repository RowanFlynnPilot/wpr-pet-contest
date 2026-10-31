import { Component, createContext, lazy, Suspense, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { dropLinkToken, freeVote, freeVoteOpen, readLinkToken, setDevice } from '../lib/freeVote.js'
import { useCheckout } from './Checkout.jsx'
import { useContest } from './ContestContext.jsx'
import '../styles/freevote.css'

// The sheet loads when a reader opens it, like checkout.
const loadSheet = () => import('./FreeVoteSheet.jsx')
const preload = () => {
  loadSheet().catch(() => {})
}

class LoadBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

const FreeVoteContext = createContext(() => {})

export function FreeVoteProvider({ children }) {
  const [target, setTarget] = useState(null)
  const [Sheet] = useState(() => lazy(loadSheet))
  const buy = useCheckout()
  const open = useCallback((entry, round, link = null) => setTarget({ entry, round, link, key: Date.now() }), [])
  const close = useCallback(() => setTarget(null), [])
  // Moving to another page closes the sheet. (Clearing a used token from the
  // address bar uses replaceState, which fires no hashchange.)
  useEffect(() => {
    window.addEventListener('hashchange', close)
    return () => window.removeEventListener('hashchange', close)
  }, [close])
  return (
    <FreeVoteContext.Provider value={open}>
      {children}
      {target && (
        <LoadBoundary key={target.key} fallback={null}>
          <Suspense fallback={null}>
            <Sheet
              entry={target.entry}
              round={target.round}
              link={target.link}
              onClose={close}
              onBuy={() => {
                close()
                buy(target.entry, target.round)
              }}
            />
          </Suspense>
        </LoadBoundary>
      )}
    </FreeVoteContext.Provider>
  )
}

export const useFreeVote = () => useContext(FreeVoteContext)

// Under the paid Vote button: quieter, because paid stays the main action.
export function FreeVoteButton({ entry, round, className = 'btn btn-quiet btn-block fv-button' }) {
  const c = useContest()
  const open = useFreeVote()
  if (!freeVoteOpen(c.contest, round, c.now)) return null
  return (
    <button type="button" className={className} onPointerEnter={preload} onFocus={preload} onClick={() => open(entry, round)}>
      Or cast your free daily vote
    </button>
  )
}

// A pet page opened from an emailed link: the sheet opens ready to confirm.
// Only once per token, and only while free voting is open.
export function useFreeVoteLanding(entry, round, params) {
  const c = useContest()
  const open = useFreeVote()
  const used = useRef(null)
  const link = readLinkToken(params)
  const ready = Boolean(entry && round && link && link.kind !== 'unsubscribe' && freeVoteOpen(c.contest, round, c.now))
  useEffect(() => {
    if (!ready || used.current === link.token) return
    used.current = link.token
    open(entry, round, link)
  }, [ready, link, entry, round, open])
}

// A reminder whose pet is out of the running lands on the gallery or bracket.
// Proving the address there sets up this browser for the two-tap vote.
export function ReminderNotice() {
  const c = useContest()
  const [link, setLink] = useState(() => {
    const l = readLinkToken(paramsFromHash())
    return l?.kind === 'reminder' && !/^#\/pet\//.test(window.location.hash) ? l : null
  })
  const [state, setState] = useState('ready')
  const [message, setMessage] = useState(null)
  if (!link || !c.contest?.free_vote_enabled) return null

  async function confirm() {
    setState('busy')
    try {
      const v = await freeVote('verify', { kind: 'reminder', token: link.token })
      if (v.outcome === 'verified') {
        setDevice(c.contest.id, v.device_token)
        setState('done')
      } else {
        setMessage(v.message)
        setState('ready')
      }
    } catch (e) {
      setMessage(e.message)
      setState('ready')
    } finally {
      dropLinkToken()
    }
  }

  return (
    <div className="fv-notice" role="status">
      <div className="wrap fv-notice-row">
        <p>
          {state === 'done'
            ? 'You’re set. Open any pet and tap “Or cast your free daily vote.”'
            : message || 'Your free vote is ready. Confirm it’s you, then pick a pet.'}
        </p>
        {state === 'done' ? (
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setLink(null)}>
            Close
          </button>
        ) : (
          <button type="button" className="btn btn-primary btn-sm" onClick={confirm} disabled={state === 'busy'}>
            {state === 'busy' ? 'Confirming…' : 'It’s me'}
          </button>
        )}
      </div>
    </div>
  )
}

function paramsFromHash() {
  const query = window.location.hash.split('?')[1] || ''
  return Object.fromEntries(new URLSearchParams(query))
}
