import { useState } from 'react'
import { stamp } from '../lib/datetime.js'
import { admin, callAdmin, q, SessionError } from './adminClient.js'
import { ErrorNote, Table, useAsync, useDesk } from './shared.jsx'

const KIND = {
  entry_received: 'Entry received',
  entry_approved: 'Approved + share link',
  entry_rejected: 'Rejected',
  advanced: 'Advanced',
  eliminated: 'Eliminated',
  champion: 'Champion',
  last_chance: 'Last Chance',
  nurture_ready: 'Tip: get ready',
  nurture_open: 'Tip: voting is open',
  nurture_halfway: 'Tip: halfway',
  nurture_last_day: 'Tip: last day',
  nurture_matchup_last_day: 'Tip: matchup last day',
  nurture_thanks: 'Tip: thanks',
  club_100: 'Club note: 100',
  club_500: 'Club note: 500',
  club_1000: 'Club note: 1,000',
  club_5000: 'Club note: 5,000',
}
const STATUS_CLASS = { sent: 'good', failed: 'bad', pending: 'status-pending' }

export default function Email() {
  const { onSessionLost } = useDesk()
  const log = useAsync(() => q(admin.from('notifications').select('*').order('created_at', { ascending: false }).limit(100)), [])
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function sweep() {
    setBusy(true)
    setError(null)
    try {
      setResult(await callAdmin('notify', {}))
      log.reload()
    } catch (err) {
      if (err instanceof SessionError) onSessionLost(err.message)
      else setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      <div className="panel-head">
        <h2>Email</h2>
        <button type="button" className="btn btn-primary btn-sm" onClick={sweep} disabled={busy}>
          {busy ? 'Sending…' : 'Send notifications now'}
        </button>
      </div>
      <p className="small">
        Sends whatever is owed: entry received, approved (with the owner&rsquo;s share link), rejected, advanced, eliminated, champion. Safe to
        press any number of times; nothing is sent twice. Moderation and round closes trigger it for you.
      </p>
      <ErrorNote error={error || log.error} />
      {result &&
        (result.enabled === false ? (
          <div className="notice warn" role="status">
            <span>
              <strong>Email is off — {result.queued} notifications waiting.</strong> Set RESEND_API_KEY on the edge functions to turn it on. Nothing
              is lost: the waiting messages go out on the first sweep after (fresh ones only; stale ones expire by design).
            </span>
          </div>
        ) : (
          <div className="notice" role="status">
            <span>
              Sent {result.sent}
              {result.failed ? `, ${result.failed} failed` : ''}
              {result.queued ? `, ${result.queued} still waiting (retried on the next sweep)` : ''}.{result.more ? ' More are queued; press again.' : ''}
            </span>
          </div>
        ))}
      <section className="card plain">
        <h3>Recent notifications</h3>
        <Table
          rows={log.data}
          rowKey={(r) => r.id}
          empty="Nothing sent yet."
          label="Recent notifications"
          stack
          columns={[
            { key: 'created_at', label: 'When', render: (r) => stamp(r.created_at) },
            { key: 'kind', label: 'Kind', render: (r) => KIND[r.kind] || r.kind },
            { key: 'to_email', label: 'To' },
            { key: 'status', label: 'Status', render: (r) => <span className={STATUS_CLASS[r.status] || 'bad'}>{r.status}</span> },
            { key: 'error', label: 'Error', render: (r) => (r.error ? <code>{r.error.slice(0, 120)}</code> : '') },
          ]}
        />
      </section>
    </div>
  )
}
