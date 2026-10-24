import { useState } from 'react'
import { fromLocalInput, stamp, toLocalInput } from '../lib/datetime.js'
import { roundLabel } from '../lib/rounds.js'
import { useNow } from '../lib/hooks.js'
import { admin, callAdmin, q, SessionError, view } from './adminClient.js'
import { ErrorNote, Stat, TypedConfirm, useAsync, useDesk } from './shared.jsx'

// Round state changes only through open_submissions / open_round /
// close_round, and each sits behind a typed word: results are irreversible.

// close_round refuses until the deadline plus this settle period, so a buyer
// who paid on time is not refunded because Stripe's webhook was slow.
export const SETTLE_MS = 10 * 60 * 1000
export const finalizableAt = (round) => new Date(round.closes_at).getTime() + SETTLE_MS
export default function Rounds() {
  const { contest, reloadContest, say, onSessionLost } = useDesk()
  const cid = contest.id
  const size = contest.bracket_size || 16
  const rounds = useAsync(() => q(admin.from('rounds').select('*').eq('contest_id', cid).order('seq')), [cid])
  const counts = useAsync(async () => {
    const [p, a] = await Promise.all([
      admin.from('entries').select('id', { count: 'exact', head: true }).eq('contest_id', cid).eq('status', 'pending'),
      admin.from('entries').select('id', { count: 'exact', head: true }).eq('contest_id', cid).eq('status', 'approved'),
    ])
    return { pending: p.count ?? 0, approved: a.count ?? 0 }
  }, [cid])
  const [action, setAction] = useState(null)
  const [closesAt, setClosesAt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [after, setAfter] = useState(null)
  const now = useNow(15000)

  const list = rounds.data || []
  const open = list.find((r) => r.status === 'open')
  const nextPending = list.find((r) => r.status === 'pending')

  async function run(fn) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      setAction(null)
      await Promise.all([rounds.reload(), counts.reload(), reloadContest()])
    } catch (err) {
      if (err instanceof SessionError) onSessionLost(err.message)
      else setError(err)
    } finally {
      setBusy(false)
    }
  }

  const openSubmissions = () =>
    run(async () => {
      await q(admin.rpc('open_submissions', { p_contest_id: cid }))
      say('Submissions are open.')
    })

  const openRound = (r) =>
    run(async () => {
      const iso = fromLocalInput(closesAt)
      await q(admin.rpc('open_round', { p_round_id: r.id, p_closes_at: iso }))
      say(`${roundLabel(r.seq, size)} is open.`)
    })

  const closeRound = (r) =>
    run(async () => {
      const next = await q(admin.rpc('close_round', { p_round_id: r.id }))
      say(next ? `${roundLabel(r.seq, size)} closed. The next round is built.` : 'Final closed. The contest is complete.')
      // The runbook's post-close checks, done for you.
      const [late, photos] = await Promise.all([
        view(admin.from('late_confirmations').select('*')),
        view(admin.from('rejected_photos_live').select('entry_id').eq('contest_id', cid)),
      ])
      let mail = null
      try {
        mail = await callAdmin('notify', {})
      } catch (err) {
        if (err instanceof SessionError) throw err
        mail = { error: err.message }
      }
      setAfter({ round: r, next, late: late.rows.length, lateError: late.error, photos: photos.rows.length, mail })
    })

  function startOpen(r) {
    setClosesAt(toLocalInput(r.closes_at))
    setAction({ kind: 'open', round: r })
  }

  const c = counts.data
  return (
    <div className="stack">
      <ErrorNote error={error || rounds.error} />
      <div className="stats">
        <Stat label="Contest status" value={contest.status.replace('_', ' ')} />
        <Stat label="Approved" value={c?.approved ?? '…'} sub={`bracket needs ${size}`} tone={c && c.approved < size ? 'warn' : undefined} />
        <Stat label="Pending review" value={c?.pending ?? '…'} tone={c?.pending ? 'warn' : 'good'} />
        <Stat label="Round length" value={`${contest.bracket_round_hours || 48}h`} sub="bracket rounds" />
      </div>

      {after && (
        <div className={`notice${after.late || after.photos ? ' error' : ''}`} role="status">
          <span>
            <strong>
              {roundLabel(after.round.seq, size)} closed{after.next ? '' : '. The contest is complete'}.
            </strong>
            Late payments: {after.lateError ? `could not check (${after.lateError})` : after.late === 0 ? '0 ✓' : `${after.late} — see Health`}. Rejected
            photos still public: {after.photos === 0 ? '0 ✓' : `${after.photos} — see Health`}.{' '}
            {after.mail?.error
              ? `Email sweep failed: ${after.mail.error}`
              : after.mail?.enabled === false
                ? `Email is off — ${after.mail.queued} notifications waiting.`
                : after.mail
                  ? `Emails sent: ${after.mail.sent}${after.mail.failed ? `, failed: ${after.mail.failed}` : ''}.`
                  : ''}
          </span>
        </div>
      )}

      {contest.status === 'draft' && (
        <div className="card">
          <h3>Open submissions</h3>
          <p className="small">
            Moves the contest from draft to accepting entries. Publish the {contest.beneficiary_split_pct}% shelter split on the rules page
            first. Needs at least one active vote pack.
          </p>
          {action?.kind === 'submissions' ? (
            <TypedConfirm word="OPEN" title="Open submissions" busy={busy} danger={false} onCancel={() => setAction(null)} onConfirm={openSubmissions}>
              <p>
                Entries open {new Date(contest.submissions_open_at) > new Date() ? stamp(contest.submissions_open_at) : 'immediately'} and close{' '}
                {stamp(contest.submissions_close_at)}.
              </p>
            </TypedConfirm>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => setAction({ kind: 'submissions' })}>
              Open submissions…
            </button>
          )}
        </div>
      )}

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">Round</th>
              <th scope="col">Status</th>
              <th scope="col">Opens</th>
              <th scope="col">Closes</th>
              <th scope="col">Resolved</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => {
              const overdue = r.status === 'open' && now >= finalizableAt(r)
              return (
                <tr key={r.id}>
                  <td>
                    <strong>{roundLabel(r.seq, size)}</strong>
                    <div className="small muted">round {r.seq}</div>
                  </td>
                  <td>
                    <span className={`pill ${r.status}`}>{r.status}</span>
                    {overdue && <div className="small bad">deadline passed: ready to finalize</div>}
                  </td>
                  <td>{stamp(r.opens_at)}</td>
                  <td>{stamp(r.closes_at)}</td>
                  <td>{stamp(r.resolved_at)}</td>
                  <td>
                    {r.id === nextPending?.id && !open && (
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => startOpen(r)} disabled={busy}>
                        Open…
                      </button>
                    )}
                    {r.id === open?.id && (
                      <>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => setAction({ kind: 'close', round: r })}
                          disabled={busy || now < finalizableAt(r)}
                        >
                          Close…
                        </button>
                        {now < finalizableAt(r) && (
                          <div className="small muted" style={{ marginTop: 4, maxWidth: 220 }}>
                            Results can be finalized from {stamp(finalizableAt(r))} so on-time payments can settle.
                          </div>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {!list.length && !rounds.loading && <p className="muted">No rounds yet. Opening submissions stages round 1, scheduled to start when submissions close.</p>}

      {action?.kind === 'open' && (
        <TypedConfirm word="OPEN" title={`Open the ${roundLabel(action.round.seq, size)}`} busy={busy} danger={false} onCancel={() => setAction(null)} onConfirm={() => openRound(action.round)}>
          {action.round.seq === 1 && (
            <p>
              <strong>Opening round 1 closes submissions</strong> and sets the field. Every pending entry must be approved or rejected first
              {c?.pending ? ` (${c.pending} still pending)` : ''}, and at least {size} must be approved.
            </p>
          )}
          <p>Voting opens now. Totals start at zero.</p>
          <label className="field">
            <span className="label">Voting closes at (your local time)</span>
            <input type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} />
            <span className="hint">Prefilled from the schedule. Must be at least an hour from now.</span>
          </label>
        </TypedConfirm>
      )}

      {action?.kind === 'close' && (
        <TypedConfirm word="CLOSE" title={`Close the ${roundLabel(action.round.seq, size)}`} busy={busy} onCancel={() => setAction(null)} onConfirm={() => closeRound(action.round)}>
          <p>
            This counts the votes, decides {action.round.seq === 1 ? `the top ${size} and their seeds` : 'every matchup'}, and builds the next round
            in one step. <strong>It cannot be undone.</strong>
          </p>
          <p className="small muted">Afterward this page checks for late payments and unpurged photos, and sends the round emails.</p>
        </TypedConfirm>
      )}
    </div>
  )
}
