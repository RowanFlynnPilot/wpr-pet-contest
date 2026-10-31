import { useState } from 'react'
import { admin, q, SessionError } from './adminClient.js'
import { ErrorNote, useDesk } from './shared.jsx'

// Setup: Last Chance on or off while the contest is a draft (0032). It is in
// the published rules, so it freezes when submissions open.
export default function LastChanceSetting({ contest, draft, onSaved }) {
  const { say, onSessionLost } = useDesk()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  if (!('last_chance_enabled' in contest)) return null
  const on = Boolean(contest.last_chance_enabled)
  const size = contest.bracket_size || 16

  async function toggle() {
    setBusy(true)
    setError(null)
    try {
      await q(admin.rpc('set_last_chance_enabled', { p_contest_id: contest.id, p_enabled: !on }))
      say(on ? 'Last Chance turned off.' : 'Last Chance turned on.')
      onSaved()
    } catch (err) {
      if (err instanceof SessionError) onSessionLost(err.message)
      else setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card plain">
      <h3 style={{ marginTop: 0 }}>Last Chance</h3>
      <p className="small">
        {on ? 'On.' : 'Off.'} When the Open Round&rsquo;s clock runs out, the top {size - 1} are in and places {size} to {size + 4} get
        about 24 more hours; the most Open Round votes at the end takes seed {size}. Their votes carry over, and only they can be voted
        for. It adds a day before the bracket, and a second deadline readers rush for.
      </p>
      <p className="small muted">
        {draft
          ? 'Staff start it from the Rounds tab after the Open Round closes. Freezes when submissions open.'
          : 'Published in the rules and locked since submissions opened.'}
      </p>
      <ErrorNote error={error} />
      {draft && (
        <button type="button" className={`btn ${on ? 'btn-quiet' : 'btn-primary'} btn-sm`} onClick={toggle} disabled={busy}>
          {busy ? 'Saving…' : on ? 'Turn off' : 'Turn on'}
        </button>
      )}
    </section>
  )
}
