import { fmtInt, fmtMoney } from '../lib/format.js'
import { roundLabel } from '../lib/rounds.js'
import { admin, view } from './adminClient.js'
import { ErrorNote, Stat, Table, useAsync, useDesk } from './shared.jsx'

export default function Money() {
  const { contest } = useDesk()
  const cid = contest.id
  const size = contest.bracket_size || 16
  const data = useAsync(async () => {
    const [stats, rounds, packs, entries, shelters] = await Promise.all([
      view(admin.from('contest_stats').select('*').eq('contest_id', cid)),
      view(admin.from('round_revenue').select('*').eq('contest_id', cid).order('seq')),
      view(admin.from('pack_revenue').select('*').eq('contest_id', cid).order('gross_cents', { ascending: false })),
      view(admin.from('entry_revenue').select('*').eq('contest_id', cid).order('gross_cents', { ascending: false }).limit(25)),
      view(admin.from('shelters').select('id, name').eq('contest_id', cid)),
    ])
    return { stats: stats.rows[0] || null, rounds, packs, entries, shelters: shelters.rows }
  }, [cid])

  const d = data.data
  const s = d?.stats
  const split = contest.beneficiary_split_pct
  const gross = Number(s?.gross_cents || 0)
  const payout = Math.round((gross * split) / 100)
  const reversed = (d?.rounds.rows || []).reduce((n, r) => n + Number(r.reversed_cents || 0), 0)

  return (
    <div className="stack">
      <div className="panel-head">
        <h2>Money</h2>
        <button type="button" className="btn btn-quiet btn-sm" onClick={data.reload} disabled={data.loading}>
          Refresh
        </button>
      </div>
      <ErrorNote error={data.error} />
      <div className="stats">
        <Stat label="Vote pack sales" value={fmtMoney(gross)} sub="confirmed, net of refunds" />
        <Stat label={`Shelter payout (${split}%)`} value={fmtMoney(payout)} sub="sales × split" tone="good" />
        <Stat label="Votes sold" value={fmtInt(s?.votes || 0)} />
        <Stat label="Refunded / late / disputed" value={fmtMoney(reversed)} tone={reversed ? 'warn' : undefined} />
      </div>
      {d?.shelters.length > 1 && (
        <p className="small muted">
          {d.shelters.length} partner shelters share {fmtMoney(payout)}. Divide as each shelter&rsquo;s MOU says.
        </p>
      )}
      <p className="small muted">Stripe fees come out of gross before it reaches the bank. Reconcile against the Stripe payout report.</p>

      <section className="card plain">
        <h3>By round</h3>
        <Table
          rows={d?.rounds.rows}
          rowKey={(r) => r.round_id}
          empty={d?.rounds.error || 'No rounds.'}
          columns={[
            { key: 'seq', label: 'Round', render: (r) => roundLabel(r.seq, size) },
            { key: 'status', label: 'Status' },
            { key: 'purchases', label: 'Purchases', num: true, render: (r) => fmtInt(r.purchases) },
            { key: 'buyers', label: 'Buyers', num: true, render: (r) => fmtInt(r.buyers) },
            { key: 'votes', label: 'Votes', num: true, render: (r) => fmtInt(r.votes) },
            { key: 'gross_cents', label: 'Gross', num: true, render: (r) => fmtMoney(r.gross_cents) },
            { key: 'pending', label: 'Abandoned', num: true, render: (r) => fmtInt(r.pending) },
            { key: 'reversed', label: 'Reversed', num: true, render: (r) => (r.reversed ? `${r.reversed} · ${fmtMoney(r.reversed_cents)}` : '0') },
          ]}
        />
        <p className="small muted">Abandoned = checkouts started and never paid. A high number points at a checkout problem.</p>
      </section>

      <section className="card plain">
        <h3>By pack</h3>
        <Table
          rows={d?.packs.rows}
          rowKey={(r) => r.pack_slug || 'none'}
          empty={d?.packs.error || 'No sales yet.'}
          columns={[
            { key: 'pack_slug', label: 'Pack', render: (r) => r.pack_slug || '(legacy)' },
            { key: 'purchases', label: 'Purchases', num: true, render: (r) => fmtInt(r.purchases) },
            { key: 'votes', label: 'Votes', num: true, render: (r) => fmtInt(r.votes) },
            { key: 'gross_cents', label: 'Gross', num: true, render: (r) => fmtMoney(r.gross_cents) },
            { key: 'share', label: 'Share', num: true, render: (r) => (gross ? `${Math.round((Number(r.gross_cents) / gross) * 100)}%` : '—') },
          ]}
        />
      </section>

      <section className="card plain">
        <h3>Top pets by money raised</h3>
        <Table
          rows={(d?.entries.rows || []).filter((r) => Number(r.gross_cents) > 0)}
          rowKey={(r) => r.entry_id}
          empty={d?.entries.error || 'No sales yet.'}
          columns={[
            { key: 'pet_name', label: 'Pet', render: (r) => <a href={`#/pet/${r.entry_id}`}>{r.pet_name}</a> },
            { key: 'votes', label: 'Votes', num: true, render: (r) => fmtInt(r.votes) },
            { key: 'gross_cents', label: 'Raised', num: true, render: (r) => fmtMoney(r.gross_cents) },
          ]}
        />
      </section>
    </div>
  )
}
