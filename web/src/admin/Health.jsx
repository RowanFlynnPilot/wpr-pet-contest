import { useEffect, useState } from 'react'
import { stamp } from '../lib/datetime.js'
import { fmtMoney } from '../lib/format.js'
import { admin, callAdmin, SessionError, view } from './adminClient.js'
import { ErrorNote, Stat, Table, useAsync, useDesk } from './shared.jsx'

export default function Health() {
  const { contest, say, onSessionLost } = useDesk()
  const cid = contest.id
  const checks = useAsync(async () => {
    const [late, photos, pending] = await Promise.all([
      view(admin.from('late_confirmations').select('*').order('confirmed_at', { ascending: false })),
      view(admin.from('rejected_photos_live').select('*').eq('contest_id', cid)),
      admin.from('entries').select('id', { count: 'exact', head: true }).eq('contest_id', cid).eq('status', 'pending'),
    ])
    return { late, photos, pending: pending.count ?? 0 }
  }, [cid])
  // The scheduled alert's own checks, including the Stripe cross-check only
  // the server can run. Viewing them here notifies nobody.
  const live = useAsync(() => callAdmin('health', {}), [cid])
  const [purging, setPurging] = useState(null)
  const [error, setError] = useState(null)

  const reloadAll = () => Promise.all([checks.reload(), live.reload()])

  async function purge(row) {
    setPurging(row.entry_id)
    setError(null)
    try {
      const res = await callAdmin('moderate', { entry_id: row.entry_id, decision: 'purge' })
      say(res.photo_deleted ? `${row.pet_name}'s photo deleted.` : `Could not delete ${row.pet_name}'s photo. Try again.`)
      await checks.reload()
    } catch (err) {
      if (err instanceof SessionError) onSessionLost(err.message)
      else setError(err)
    } finally {
      setPurging(null)
    }
  }

  const d = checks.data
  const late = d?.late.rows || []
  const photos = d?.photos.rows || []
  const votingStarted = contest.status === 'voting' || contest.status === 'complete'

  return (
    <div className="stack">
      <div className="panel-head">
        <h2>Health checks</h2>
        <button type="button" className="btn btn-quiet btn-sm" onClick={reloadAll} disabled={checks.loading || live.loading}>
          {checks.loading || live.loading ? 'Checking…' : 'Run checks again'}
        </button>
      </div>
      <ErrorNote error={error || checks.error} />
      <LiveChecks live={live} />
      <div className="stats">
        <Stat label="Late payments" value={d ? late.length : '…'} tone={d ? (late.length ? 'bad' : 'good') : undefined} sub="must be 0" />
        <Stat label="Rejected photos still public" value={d ? photos.length : '…'} tone={d ? (photos.length ? 'bad' : 'good') : undefined} sub="must be 0" />
        <Stat
          label="Pending entries"
          value={d ? d.pending : '…'}
          tone={d ? (d.pending === 0 ? 'good' : votingStarted ? 'bad' : 'warn') : undefined}
          sub={votingStarted ? 'should be 0 once voting starts' : 'normal while entries are open'}
        />
      </div>

      <section className="card plain">
        <h3>Late payments</h3>
        <p className="small">
          A payment that completed after its round&rsquo;s deadline (plus the two-minute grace). Its votes do not count and never will, so the
          buyer is refunded.
          <strong> The webhook refunds these automatically</strong>: a row here should disappear on its own within a minute or two, once Stripe
          processes the refund. Anything that stays needs a manual refund in the Stripe dashboard (search the payment intent id).
        </p>
        {d?.late.error && <p className="small bad">Could not read: {d.late.error}</p>}
        <Table
          rows={late}
          rowKey={(r) => r.stripe_payment_intent_id}
          empty="None. ✓"
          columns={[
            { key: 'pet_name', label: 'Pet' },
            { key: 'round_seq', label: 'Round', num: true },
            { key: 'quantity', label: 'Votes', num: true },
            { key: 'amount_cents', label: 'Amount', num: true, render: (r) => fmtMoney(r.amount_cents) },
            { key: 'buyer_email', label: 'Buyer' },
            { key: 'confirmed_at', label: 'Confirmed', render: (r) => stamp(r.confirmed_at) },
            { key: 'status', label: 'Status' },
            { key: 'stripe_payment_intent_id', label: 'Payment intent', render: (r) => <code>{r.stripe_payment_intent_id}</code> },
          ]}
        />
      </section>

      <section className="card plain">
        <h3>Rejected photos still in the public bucket</h3>
        <p className="small">
          The bucket is public, so a rejected photo stays reachable at its URL until the file is deleted. Rejection deletes it automatically;
          anything listed here is a delete that failed. Delete it now.
        </p>
        {d?.photos.error && <p className="small bad">Could not read: {d.photos.error}</p>}
        <Table
          rows={photos}
          rowKey={(r) => r.object_name || r.entry_id}
          empty="None. ✓"
          columns={[
            { key: 'pet_name', label: 'Pet' },
            { key: 'moderated_at', label: 'Rejected', render: (r) => stamp(r.moderated_at) },
            { key: 'object_name', label: 'File', render: (r) => <code>{r.object_name || r.photo_path}</code> },
            {
              key: 'act',
              label: '',
              render: (r) => (
                <button type="button" className="btn btn-danger btn-sm" onClick={() => purge(r)} disabled={purging === r.entry_id}>
                  {purging === r.entry_id ? 'Deleting…' : 'Delete photo now'}
                </button>
              ),
            },
          ]}
        />
      </section>
    </div>
  )
}


function channelText(channels) {
  const on = [channels?.email && 'staff email', channels?.webhook && 'the alert webhook'].filter(Boolean)
  return on.length ? on.join(' and ') : null
}

function LiveChecks({ live }) {
  const { onSessionLost } = useDesk()
  const err = live.error
  const expired = err instanceof SessionError
  useEffect(() => {
    if (expired) onSessionLost(err.message)
  }, [expired, err, onSessionLost])
  if (expired) return null
  const d = live.data
  const to = channelText(d?.channels)
  return (
    <section className="card plain">
      <h3>Live checks</h3>
      <p className="small">
        What the alert schedule checks every ten minutes during a contest, including asking Stripe whether every successful vote-pack payment
        was credited. A payment that succeeded but was not credited means the webhook is failing: buyers were charged and got no votes.{' '}
        {d && (to ? <>Problems are sent to {to}.</> : <strong>Alerts are not going anywhere yet: set STAFF_ALERT_EMAILS or ALERT_WEBHOOK_URL on the edge functions (docs/LAUNCH.md).</strong>)}
      </p>
      {err && <p className="small bad">Could not run the live checks: {err.message}</p>}
      {!d && !err && <p className="small muted">Checking…</p>}
      {d && !d.problems.length && <p className="small">All clear. ✓</p>}
      {d?.problems.map((p) => (
        <div key={p.check_name} className={`notice ${p.severity === 'alert' ? 'error' : 'warn'}`} role={p.severity === 'alert' ? 'alert' : undefined} style={{ marginTop: 8 }}>
          <span>
            <strong>{p.severity === 'alert' ? 'Urgent' : 'Check'}:</strong> {p.detail}
          </span>
        </div>
      ))}
    </section>
  )
}
