import { useState } from 'react'
import { PUBLIC_URL } from '../lib/env.js'
import { stamp } from '../lib/datetime.js'
import { useNow } from '../lib/hooks.js'
import { admin, q, SessionError } from './adminClient.js'
import { ErrorNote, useAsync, useDesk } from './shared.jsx'

// Late-entry passes (0039): staff let one more pet in after entries close,
// while the Open Round runs. Each pass is a one-use link with a reason on
// record; the owner still enters through the ordinary form (photo release,
// metadata stripped) and the pet waits in the queue above for approval.
export default function LatePasses() {
  const { contest, say, onSessionLost } = useDesk()
  const cid = contest.id
  const passes = useAsync(async () => {
    const rows = await q(
      admin
        .from('late_entry_passes')
        .select('id, reason, issued_at, expires_at, revoked_at, used_at, entry_id')
        .eq('contest_id', cid)
        .order('issued_at', { ascending: false }),
    )
    const ids = rows.map((r) => r.entry_id).filter(Boolean)
    const pets = ids.length ? await q(admin.from('entries').select('id, pet_name, status').in('id', ids)) : []
    const byId = new Map(pets.map((p) => [p.id, p]))
    return rows.map((r) => ({ ...r, entry: r.entry_id ? byId.get(r.entry_id) : null }))
  }, [cid])
  const [reason, setReason] = useState('')
  const [hours, setHours] = useState('48')
  const [link, setLink] = useState(null)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const now = useNow(30000)

  async function run(fn) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      await passes.reload()
    } catch (err) {
      if (err instanceof SessionError) onSessionLost(err.message)
      else setError(err)
    } finally {
      setBusy(false)
    }
  }

  const issue = (e) => {
    e.preventDefault()
    run(async () => {
      const token = await q(admin.rpc('issue_late_entry_pass', { p_contest_id: cid, p_reason: reason.trim(), p_hours: Number(hours) }))
      setLink(`${PUBLIC_URL.replace(/#.*$/, '')}#/enter?pass=${token}`)
      setCopied(false)
      setReason('')
      say('Late-entry pass issued. Copy the link now; it is shown only once.')
    })
  }

  const withdraw = (id) =>
    run(async () => {
      await q(admin.rpc('revoke_late_entry_pass', { p_pass_id: id }))
      say('Pass withdrawn. The link no longer works.')
    })

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  const state = (p) =>
    p.used_at
      ? { label: p.entry ? `Used: ${p.entry.pet_name} (${p.entry.status})` : 'Used', tone: 'good' }
      : p.revoked_at
        ? { label: 'Withdrawn', tone: 'muted' }
        : new Date(p.expires_at).getTime() <= now
          ? { label: 'Expired', tone: 'muted' }
          : { label: `Unused, works until ${stamp(p.expires_at)}`, tone: 'warn' }

  const list = passes.data || []
  return (
    <section className="card" aria-labelledby="late-passes-title">
      <h3 id="late-passes-title">Late-entry passes</h3>
      <p className="small">
        One more pet after entries closed: a one-use link for one owner, only while the Open Round runs and before Last Chance. The owner
        enters through the normal form, and the pet lands in the queue above for approval. Every pass keeps its reason, who issued it and
        what it became. If others ask, give them the same answer.
      </p>
      <ErrorNote error={error || passes.error} />

      <form onSubmit={issue} className="stack" style={{ gap: 10 }}>
        <label className="field">
          <span className="label">Why, and who approved it</span>
          <input
            id="late-pass-reason"
            type="text"
            value={reason}
            maxLength={300}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Owner emailed Nov. 21 after the deadline; approved by Rowan Flynn"
            required
          />
        </label>
        <label className="field">
          <span className="label">Link works for</span>
          <select id="late-pass-hours" value={hours} onChange={(e) => setHours(e.target.value)}>
            <option value="24">24 hours</option>
            <option value="48">48 hours</option>
            <option value="72">72 hours</option>
          </select>
        </label>
        <div className="tool-row">
          <button type="submit" className="btn btn-primary" disabled={busy || reason.trim().length < 3}>
            Issue late-entry pass
          </button>
        </div>
      </form>

      {link && (
        <div className="notice" role="status" style={{ marginTop: 12, display: 'grid', gap: 8 }}>
          <span>
            <strong>Send this link to the owner.</strong> It is shown only once and works for one entry.
          </span>
          <input id="late-pass-link" type="text" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
          <div className="tool-row">
            <button type="button" className="btn btn-sm" onClick={copy}>
              {copied ? 'Copied' : 'Copy link'}
            </button>
            <button type="button" className="btn btn-sm btn-quiet" onClick={() => setLink(null)}>
              Done
            </button>
          </div>
        </div>
      )}

      {list.length > 0 && (
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Late-entry passes" style={{ marginTop: 14 }}>
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Issued</th>
                <th scope="col">Reason</th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => {
                const s = state(p)
                const open = !p.used_at && !p.revoked_at && new Date(p.expires_at).getTime() > now
                return (
                  <tr key={p.id}>
                    <td>{stamp(p.issued_at)}</td>
                    <td>{p.reason}</td>
                    <td className={`small ${s.tone}`}>{s.label}</td>
                    <td>
                      {open && (
                        <button type="button" className="btn btn-sm btn-quiet" onClick={() => withdraw(p.id)} disabled={busy}>
                          Withdraw
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
