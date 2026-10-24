import { useState } from 'react'
import { downloadCsv, toCsv } from '../lib/csv.js'
import { stamp } from '../lib/datetime.js'
import { admin, all } from './adminClient.js'
import NewsletterBlock from './NewsletterBlock.jsx'
import { ErrorNote, useAsync, useDesk } from './shared.jsx'

export default function Newsletter() {
  const { contest } = useDesk()
  const cid = contest.id
  const count = useAsync(async () => {
    const { count: n, error } = await admin.from('newsletter_signups').select('email', { count: 'exact', head: true }).eq('contest_id', cid)
    if (error) throw new Error(error.message)
    return n ?? 0
  }, [cid])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [preview, setPreview] = useState(null)

  async function exportCsv() {
    setBusy(true)
    setError(null)
    try {
      const rows = await all(() => admin.from('newsletter_signups').select('email, first_seen, sources').eq('contest_id', cid).order('first_seen').order('email'))
      downloadCsv(`pet-contest-${contest.year}-newsletter-signups.csv`, toCsv(rows, ['email', 'first_seen', 'sources']))
      setPreview(rows.slice(-5).reverse())
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      <div className="panel-head">
        <h2>Newsletter</h2>
      </div>
      <NewsletterBlock />
      <section className="card plain">
        <h3 style={{ marginTop: 0 }}>Sign-ups</h3>
        <ErrorNote error={error || count.error} />
        <p>
          <strong className="mono" style={{ fontSize: 28 }}>
            {count.data ?? '…'}
          </strong>{' '}
          opt-ins from entries and vote pack purchases, one row per address. Every one ticked an unchecked box.
        </p>
        <div>
          <button type="button" className="btn btn-primary" onClick={exportCsv} disabled={busy || !count.data}>
            {busy ? 'Exporting…' : 'Download CSV'}
          </button>
        </div>
        <p className="small muted">Import into the newsletter platform. The file holds email addresses: keep it off shared drives and delete it after import.</p>
        {preview && (
          <ul className="plain-list small">
            {preview.map((r) => (
              <li key={r.email}>
                {r.email} · {r.sources} · {stamp(r.first_seen)}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
