import { useState } from 'react'
import { fromLocalInput, stamp } from '../lib/datetime.js'
import { fmtInt } from '../lib/format.js'
import { roundLabel } from '../lib/rounds.js'
import { sprintTitle, sprintWhen } from '../lib/sprints.js'
import { useNow } from '../lib/hooks.js'
import { admin, q, SessionError, view } from './adminClient.js'
import { ErrorNote, useAsync, useDesk } from './shared.jsx'

// Sprints (0030): a sponsor's prize for the most votes in a window. Every
// change goes through a function that checks the rules (a day's notice,
// inside the round, no overlap, cancel only before the start, settle 10
// minutes after the end). See docs/SPRINTS.md.

// Setup: on or off while the contest is a draft, like the free daily vote.
export function SprintSetting({ contest, draft, onSaved }) {
  const { say, onSessionLost } = useDesk()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  if (!('sprints_enabled' in contest)) return null
  const on = Boolean(contest.sprints_enabled)

  async function toggle() {
    setBusy(true)
    setError(null)
    try {
      await q(admin.rpc('set_sprints_enabled', { p_contest_id: contest.id, p_enabled: !on }))
      say(on ? 'Sprints turned off.' : 'Sprints turned on.')
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
      <h3 style={{ marginTop: 0 }}>Sprints</h3>
      <p className="small">
        {on ? 'On.' : 'Off.'} A sponsor offers a prize to the owner of the pet with the most votes in a set window: &ldquo;the most votes
        from 6 to 9 p.m. wins a $50 gift card.&rdquo; Sprint votes are ordinary votes; the prize is the sponsor&rsquo;s. Schedule them in
        Packs &amp; bonuses.
      </p>
      <p className="small muted">
        {draft
          ? 'A prize decided by paid votes needs counsel’s sign-off before it is published (docs/SPRINTS.md). Freezes when submissions open.'
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

const blank = { round_id: '', starts: '', ends: '', label: '', prize: '', sponsor_name: '', sponsor_url: '' }

function AddSprint({ rounds, bracketSize, onAdd }) {
  const [d, setD] = useState(blank)
  const set = (k) => (e) => setD({ ...d, [k]: e.target.value })
  return (
    <form
      className="window-form"
      onSubmit={(e) => {
        e.preventDefault()
        onAdd(d, () => setD(blank))
      }}
    >
      <label>
        <span className="label">Round</span>
        <select value={d.round_id} onChange={set('round_id')} required>
          <option value="">Choose…</option>
          {rounds.map((r) => (
            <option key={r.id} value={r.id}>
              {roundLabel(r.seq, bracketSize)}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="label">Starts</span>
        <input type="datetime-local" value={d.starts} onChange={set('starts')} required />
      </label>
      <label>
        <span className="label">Ends</span>
        <input type="datetime-local" value={d.ends} onChange={set('ends')} required />
      </label>
      <label>
        <span className="label">Name</span>
        <input type="text" value={d.label} onChange={set('label')} placeholder="Tuesday night sprint" maxLength={60} />
      </label>
      <label>
        <span className="label">Prize</span>
        <input type="text" value={d.prize} onChange={set('prize')} placeholder="a $50 gift card" maxLength={140} required />
      </label>
      <label>
        <span className="label">Sponsor</span>
        <input type="text" value={d.sponsor_name} onChange={set('sponsor_name')} maxLength={80} required />
      </label>
      <label>
        <span className="label">Sponsor link</span>
        <input type="text" inputMode="url" value={d.sponsor_url} onChange={set('sponsor_url')} placeholder="https://" />
      </label>
      <div className="tool-row" style={{ alignSelf: 'end' }}>
        <button type="submit" className="btn btn-primary btn-sm">
          Schedule sprint
        </button>
      </div>
    </form>
  )
}

function SprintItem({ s, roundName, now, onCancel, onSettle, winner }) {
  const started = now >= new Date(s.starts_at).getTime()
  const ended = now >= new Date(s.ends_at).getTime()
  const settleAt = new Date(s.ends_at).getTime() + 10 * 60e3
  let status
  if (s.cancelled_at) status = `Cancelled: ${s.cancel_reason}`
  else if (s.settled_at) status = winner ? `Won by ${winner.pet_name} with ${fmtInt(s.winner_votes)} votes` : 'Settled: no votes, no winner'
  else if (ended) status = now >= settleAt ? 'Ready to settle' : `Settle after ${stamp(new Date(settleAt).toISOString())}`
  else if (started) status = 'Running now'
  else status = 'Scheduled'
  return (
    <div className="window-item">
      <div className="small">
        <strong>{sprintTitle(s)}</strong> · {roundName} · {sprintWhen(s)}
      </div>
      <div className="small muted">
        {s.prize}, from {s.sponsor_name}. <strong className={s.settled_at ? 'good' : undefined}>{status}</strong>
      </div>
      {winner && s.settled_at && (
        <div className="small">
          Deliver the prize to {winner.owner_name} ({winner.owner_email}).
        </div>
      )}
      <div className="tool-row">
        {!s.cancelled_at && !started && (
          <button type="button" className="link-btn small" onClick={() => onCancel(s)}>
            Cancel…
          </button>
        )}
        {!s.cancelled_at && !s.settled_at && ended && (
          <button type="button" className="btn btn-primary btn-sm" disabled={now < settleAt} onClick={() => onSettle(s)}>
            Settle and name the winner
          </button>
        )}
      </div>
    </div>
  )
}

// Packs & bonuses: schedule, cancel and settle.
export function SprintsPanel({ contest }) {
  const { say, onSessionLost } = useDesk()
  const cid = contest.id
  const now = useNow(30000)
  const data = useAsync(async () => {
    const [sprints, rounds] = await Promise.all([
      view(admin.from('sprints').select('*').eq('contest_id', cid).order('starts_at')),
      q(admin.from('rounds').select('id, seq, status, opens_at, closes_at').eq('contest_id', cid).order('seq')),
    ])
    const winnerIds = sprints.rows.map((s) => s.winner_entry_id).filter(Boolean)
    const winners = winnerIds.length ? await q(admin.from('entries').select('id, pet_name, owner_name, owner_email').in('id', winnerIds)) : []
    return { sprints: sprints.rows, missing: sprints.error, rounds, winners: new Map(winners.map((w) => [w.id, w])) }
  }, [cid])
  const [error, setError] = useState(null)
  if (!('sprints_enabled' in contest)) return null
  const d = data.data
  const rounds = (d?.rounds || []).filter((r) => r.status === 'pending' || r.status === 'open')
  const label = (id) => {
    const r = d?.rounds.find((x) => x.id === id)
    return r ? roundLabel(r.seq, contest.bracket_size) : 'Round'
  }

  const run = async (fn, done) => {
    setError(null)
    try {
      await fn()
      say(done)
      data.reload()
    } catch (err) {
      if (err instanceof SessionError) onSessionLost(err.message)
      else setError(err)
    }
  }

  const add = (f, reset) =>
    run(async () => {
      await q(
        admin.rpc('add_sprint', {
          p_round_id: f.round_id,
          p_starts_at: fromLocalInput(f.starts),
          p_ends_at: fromLocalInput(f.ends),
          p_prize: f.prize,
          p_sponsor_name: f.sponsor_name,
          p_sponsor_url: f.sponsor_url.trim() || null,
          p_label: f.label.trim() || 'Sprint',
        }),
      )
      reset()
    }, 'Sprint scheduled. Announce it today: the rules promise a day’s notice.')

  const cancel = (s) => {
    const reason = window.prompt(`Why is "${sprintTitle(s)}" cancelled? The reason is kept with the sprint.`)
    if (reason == null) return
    run(() => q(admin.rpc('cancel_sprint', { p_sprint_id: s.id, p_reason: reason })), 'Sprint cancelled.')
  }

  const settle = (s) => run(() => q(admin.rpc('settle_sprint', { p_sprint_id: s.id })), 'Sprint settled. The winner shows on the home page.')

  return (
    <section className="card plain">
      <h3>Sprints</h3>
      <p className="small">
        The pet with the most votes in the window wins the sponsor&rsquo;s prize. A pack counts when its checkout begins in the window and its
        payment clears within 10 minutes of the end; a free vote counts when it is cast in the window. Ties go as the round&rsquo;s do.
        Schedule at least a day ahead, inside one round, without overlapping another sprint. Times are your local time.
      </p>
      {!contest.sprints_enabled && <p className="small muted">Sprints are off for this contest (Setup, while it is a draft).</p>}
      <ErrorNote error={error || data.error} />
      {d?.missing && <p className="small muted">Sprints are not available on this database yet.</p>}
      <div className="stack">
        {(d?.sprints || []).map((s) => (
          <SprintItem key={`${s.id}-${s.settled_at}-${s.cancelled_at}`} s={s} roundName={label(s.round_id)} now={now} onCancel={cancel} onSettle={settle} winner={d.winners.get(s.winner_entry_id)} />
        ))}
        {contest.sprints_enabled && rounds.length > 0 && (
          <div className="window-item new">
            <div className="small" style={{ fontWeight: 700 }}>
              Schedule a sprint
            </div>
            <AddSprint rounds={rounds} bracketSize={contest.bracket_size} onAdd={add} />
          </div>
        )}
      </div>
    </section>
  )
}
