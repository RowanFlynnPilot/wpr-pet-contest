import { useState } from 'react'
import { fromLocalInput, toLocalInput } from '../lib/datetime.js'
import { admin, q, SessionError } from './adminClient.js'
import { ErrorNote, useDesk } from './shared.jsx'

// The finale (0031): when the live reveal starts and where to watch it. The
// site counts down to it, links to the stream while it runs, then to the
// replay. Presentation only: close_round is still what makes the champion.
export default function FinaleSetting({ contest, onSaved }) {
  const { say, onSessionLost } = useDesk()
  const [at, setAt] = useState(contest.finale_at ? toLocalInput(contest.finale_at) : '')
  const [url, setUrl] = useState(contest.finale_url || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  if (!('finale_at' in contest)) return null

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await q(admin.rpc('set_contest_finale', { p_contest_id: contest.id, p_at: at ? fromLocalInput(at) : null, p_url: url.trim() || null }))
      say(at ? 'Finale saved. Home shows the countdown from four days out.' : 'Finale cleared.')
      onSaved()
    } catch (err) {
      if (err instanceof SessionError) onSessionLost(err.message)
      else setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card plain" onSubmit={save}>
      <h3 style={{ marginTop: 0 }}>The finale</h3>
      <p className="small">
        A live reveal of the champion, on Facebook Live or YouTube. Home and Results count down to it from four days out, say &ldquo;Live
        now&rdquo; for two hours from the start, then link to the replay for two weeks. Run the final <strong>Close</strong> on the stream
        at the moment of the reveal; the crown drops on everyone&rsquo;s screen within half a minute. Hold the email sweep until after.
      </p>
      <div className="window-form">
        <label>
          <span className="label">Starts</span>
          <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
        </label>
        <label>
          <span className="label">Stream or replay link</span>
          <input type="text" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
        </label>
        <div className="tool-row" style={{ alignSelf: 'end' }}>
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
            {busy ? 'Saving…' : 'Save finale'}
          </button>
        </div>
      </div>
      <p className="small muted">Paste the stream&rsquo;s link when it is scheduled, and swap in the replay&rsquo;s link afterward if it changes.</p>
      <ErrorNote error={error} />
    </form>
  )
}
