import { useState } from 'react'
import { dropLinkToken, freeVote, readLinkToken } from '../lib/freeVote.js'
import { useDocumentTitle } from '../lib/hooks.js'

// From the link in a free-vote reminder. A button, not the link itself:
// mail scanners open links, and a scanner must not unsubscribe anyone.
export default function Unsubscribe({ route }) {
  const [link] = useState(() => readLinkToken(route.params))
  const [state, setState] = useState('ready')
  const [error, setError] = useState(null)
  useDocumentTitle('Free vote reminders — Wausau Pilot & Review')

  async function stop() {
    setState('busy')
    setError(null)
    try {
      await freeVote('unsubscribe', { token: link.token })
      setState('done')
      dropLinkToken()
    } catch (e) {
      setError(e.message)
      setState('ready')
    }
  }

  return (
    <div className="wrap-narrow section" style={{ paddingTop: 24 }}>
      <h1 style={{ fontSize: 'clamp(28px, 6vw, 40px)' }}>Free vote reminders</h1>
      {!link || link.kind !== 'unsubscribe' ? (
        <p>This link is incomplete. Use the &ldquo;Stop these reminders&rdquo; link at the bottom of a reminder email.</p>
      ) : state === 'done' ? (
        <p role="status">Done. You won&rsquo;t get any more free vote reminders for this contest.</p>
      ) : (
        <>
          <p>Stop the morning emails reminding you to cast your free vote? You can still vote free on the site any day.</p>
          <button type="button" className="btn btn-primary" onClick={stop} disabled={state === 'busy'}>
            {state === 'busy' ? 'Stopping…' : 'Stop reminders'}
          </button>
        </>
      )}
      {error && (
        <div className="notice error" role="alert" style={{ marginTop: 12 }}>
          <span>{error}</span>
        </div>
      )}
    </div>
  )
}
