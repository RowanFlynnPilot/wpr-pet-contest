import { useMemo, useState } from 'react'
import { NEWSROOM } from '../config.js'
import { callLinks } from '../lib/api.js'
import { dropLinkToken, freeVote, readLinkToken } from '../lib/freeVote.js'
import { useDocumentTitle } from '../lib/hooks.js'

// Which email the link came from: free-vote reminders (fv=u.<token>), a
// buyer's "plays again" notes (bn=<token>), or an owner's tips
// (owner=<entry>.<token>).
function readLink(params) {
  const fv = readLinkToken(params)
  if (fv?.kind === 'unsubscribe') return { kind: 'free', token: fv.token, title: 'Free vote reminders', what: 'the morning emails reminding you to cast your free vote' }
  if (/^[A-Za-z0-9_-]{40,64}$/.test(params?.bn || '')) {
    return { kind: 'buyer', token: params.bn, title: 'Emails about the pets you backed', what: 'the once-a-round emails about the pets you bought votes for' }
  }
  const m = /^([0-9a-f-]{36})\.([0-9a-f-]{36})$/i.exec(params?.owner || '')
  if (m) return { kind: 'owner', entryId: m[1], token: m[2], title: 'Tips for your entry', what: 'the emails with tips on sharing your pet (notices about your entry itself still come)' }
  return null
}

// A button, not the link itself: mail scanners open links, and a scanner
// must not unsubscribe anyone.
export default function Unsubscribe({ route }) {
  // Re-read when the address changes (one email's link after another's);
  // `done` outlives the token, which leaves the address bar on success.
  const [done, setDone] = useState(null)
  const link = useMemo(() => readLink(route.params) || done, [route.params, done])
  const [state, setState] = useState('ready')
  const [error, setError] = useState(null)
  useDocumentTitle(`${link?.title || 'Email'} — ${NEWSROOM.name}`)

  async function stop() {
    setState('busy')
    setError(null)
    try {
      if (link.kind === 'free') await freeVote('unsubscribe', { token: link.token })
      else if (link.kind === 'buyer') await callLinks('unsubscribe', { token: link.token })
      else await callLinks('opt-out', { entry_id: link.entryId, token: link.token })
      setDone(link)
      setState('done')
      dropLinkToken()
    } catch (e) {
      setError(e.message)
      setState('ready')
    }
  }

  return (
    <div className="wrap-narrow section" style={{ paddingTop: 24 }}>
      <h1 style={{ fontSize: 'clamp(28px, 6vw, 40px)' }}>{link?.title || 'Email settings'}</h1>
      {!link ? (
        <p>This link is incomplete. Use the &ldquo;stop&rdquo; link at the bottom of the email.</p>
      ) : state === 'done' ? (
        <p role="status">Done. You won&rsquo;t get any more of these for this contest.</p>
      ) : (
        <>
          <p>Stop {link.what}?</p>
          <button type="button" className="btn btn-primary" onClick={stop} disabled={state === 'busy'}>
            {state === 'busy' ? 'Stopping…' : 'Stop these emails'}
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
