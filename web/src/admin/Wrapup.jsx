// After the final: what the shelters are owed (printable), the contest's
// permanent record, and keeping the published privacy promise.
import { useState } from 'react'
import { bracketRows, openRoundRows, summary } from '../lib/archive.js'
import { downloadCsv, toCsv } from '../lib/csv.js'
import { apDate, fmtMoney, plural } from '../lib/format.js'

const exact = (cents) => fmtMoney(cents, { exact: true })
// A deduction; a zero is just zero, not "−$0.00".
const less = (cents) => (cents ? `−${exact(cents)}` : exact(0))
import { admin, all, q, SessionError } from './adminClient.js'
import { ErrorNote, TypedConfirm, useAsync, useDesk } from './shared.jsx'

const ERASE_AFTER_DAYS = 120
const PUBLIC_ENTRY_COLS = 'id, pet_name, species, town, seed, status, created_at'

function downloadJson(filename, data) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function Statement({ contest, payout, shelters }) {
  const final = contest.status === 'complete'
  return (
    <section className="card plain print-area">
      {!final && <p className="notice warn no-break">PRELIMINARY: the contest is still running and these figures will change.</p>}
      <p className="kicker" style={{ margin: 0 }}>
        Wausau Pilot &amp; Review
      </p>
      <h3 style={{ margin: '4px 0 2px' }}>Shelter payout statement</h3>
      <p className="small" style={{ marginTop: 0 }}>
        {contest.name} · prepared {apDate(new Date(), { year: true })}
      </p>
      <table className="statement">
        <tbody>
          <tr>
            <th scope="row">Vote pack sales</th>
            <td className="mono">{exact(payout.sales_cents)}</td>
          </tr>
          <tr>
            <th scope="row">Refunded</th>
            <td className="mono">{less(payout.refunded_cents)}</td>
          </tr>
          <tr>
            <th scope="row">Under chargeback (excluded)</th>
            <td className="mono">{less(payout.disputed_cents)}</td>
          </tr>
          <tr className="total">
            <th scope="row">Net vote pack sales</th>
            <td className="mono">{exact(payout.net_cents)}</td>
          </tr>
          <tr className="total">
            <th scope="row">Shelter share ({payout.beneficiary_split_pct}%)</th>
            <td className="mono">{exact(payout.shelter_pool_cents)}</td>
          </tr>
          {shelters.map((s) => (
            <tr key={s.shelter_id}>
              <th scope="row" style={{ paddingLeft: 20 }}>
                {s.name}
                {shelters.length > 1 && <span className="muted"> (share {s.payout_weight})</span>}
              </th>
              <td className="mono">{exact(s.amount_cents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small">
        Per the published rules, the shelters receive {payout.beneficiary_split_pct}% of vote pack sales after refunds. Card processing fees are
        paid by Wausau Pilot &amp; Review and are not deducted from the shelter share.
        {payout.disputed_cents > 0 && ` ${exact(payout.disputed_cents)} under chargeback is excluded unless the dispute is resolved in WPR’s favor.`}{' '}
        {plural(payout.purchases, 'purchase')}.
      </p>
      <div className="signatures">
        <span>Prepared by</span>
        <span>Date</span>
        <span>Received by (shelter)</span>
      </div>
    </section>
  )
}

export default function Wrapup() {
  const { contest, reloadContest, say, onSessionLost } = useDesk()
  const cid = contest.id
  const money = useAsync(async () => {
    const [payout, shelters, rounds] = await Promise.all([
      q(admin.from('payout_statement').select('*').eq('contest_id', cid)),
      q(admin.from('shelter_payouts').select('*').eq('contest_id', cid).order('amount_cents', { ascending: false })),
      q(admin.from('rounds').select('resolved_at').eq('contest_id', cid)),
    ])
    const ended = rounds.map((r) => r.resolved_at).filter(Boolean).sort().at(-1) || null
    return { payout: payout[0], shelters, ended }
  }, [cid])
  const [busy, setBusy] = useState(false)
  const [erasing, setErasing] = useState(false)
  const [error, setError] = useState(null)
  const fail = (err) => (err instanceof SessionError ? onSessionLost(err.message) : setError(err))

  async function exportArchive() {
    setBusy(true)
    setError(null)
    try {
      const [rounds, matchups, results, entries, sideAwards, packs] = await Promise.all([
        q(admin.from('rounds').select('*').eq('contest_id', cid).order('seq')),
        q(admin.from('matchups').select('*, rounds!inner(contest_id)').eq('rounds.contest_id', cid)),
        all(() =>
          admin.from('round_results').select('round_id, entry_id, votes, rounds!inner(contest_id)').eq('rounds.contest_id', cid).order('round_id').order('entry_id'),
        ),
        all(() => admin.from('entries').select(PUBLIC_ENTRY_COLS).eq('contest_id', cid).in('status', ['approved', 'disqualified']).order('created_at').order('id')),
        q(admin.from('side_awards').select('*').eq('contest_id', cid)),
        q(admin.from('vote_packs').select('label, votes, cents').eq('contest_id', cid).order('sort')),
      ])
      const round1 = rounds.find((r) => r.seq === 1)
      const year = contest.year
      downloadCsv(`pet-contest-${year}-open-round.csv`, toCsv(openRoundRows(entries, results.filter((r) => r.round_id === round1?.id))))
      downloadCsv(`pet-contest-${year}-bracket.csv`, toCsv(bracketRows(contest, rounds.filter((r) => r.seq > 1), matchups, results, entries)))
      downloadJson(
        `pet-contest-${year}-summary.json`,
        summary({ contest, rounds, matchups, entries, sideAwards, payout: money.data?.payout, shelterPayouts: money.data?.shelters || [], packs }),
      )
      say('Archive downloaded: open round, bracket and summary.')
    } catch (err) {
      fail(err)
    } finally {
      setBusy(false)
    }
  }

  async function erase() {
    setBusy(true)
    setError(null)
    try {
      const [res] = await q(admin.rpc('erase_personal_data', { p_contest_id: cid }))
      say(`Erased: ${res.entries} entrant and ${res.votes} buyer records.`)
      setErasing(false)
      await reloadContest()
    } catch (err) {
      fail(err)
    } finally {
      setBusy(false)
    }
  }

  const d = money.data
  const complete = contest.status === 'complete'
  const eraseFrom = d?.ended ? new Date(Date.parse(d.ended) + ERASE_AFTER_DAYS * 86400000) : null
  const canErase = complete && !contest.personal_data_erased_at && eraseFrom && eraseFrom <= new Date()

  return (
    <div className="stack">
      <div className="panel-head">
        <h2>Wrap-up</h2>
        <button type="button" className="btn btn-quiet btn-sm no-print" onClick={() => window.print()} disabled={!d?.payout}>
          Print payout statement
        </button>
      </div>
      <ErrorNote error={error || money.error} />
      {d?.payout && <Statement contest={contest} payout={d.payout} shelters={d.shelters} />}

      <section className="card plain no-print">
        <h3 style={{ marginTop: 0 }}>Archive</h3>
        <p className="small">
          The contest&rsquo;s permanent record: Open Round standings, every bracket matchup, the champion and side awards, and the money. Pet
          names and towns only; no owner or buyer details. Download it when the contest is complete and keep it with the shelter paperwork.
        </p>
        <button type="button" className="btn btn-primary btn-sm" onClick={exportArchive} disabled={busy}>
          {busy ? 'Preparing…' : 'Download archive'}
        </button>
      </section>

      <section className="card plain no-print">
        <h3 style={{ marginTop: 0 }}>Personal data</h3>
        {contest.personal_data_erased_at ? (
          <p className="small good">Entrant and buyer emails were erased on {apDate(contest.personal_data_erased_at, { year: true })}. ✓</p>
        ) : (
          <>
            <p className="small">
              The rules promise that entrant and buyer email addresses are erased a year after the contest ends. Pets, towns, photos, results and
              the money are kept. It cannot be done until the {ERASE_AFTER_DAYS}-day chargeback window has closed
              {eraseFrom ? `, on ${apDate(eraseFrom, { year: true })}` : ''}. <strong>Export the newsletter list first</strong> (Newsletter
              tab): opt-ins are erased too.
            </p>
            <button type="button" className="btn btn-danger btn-sm" onClick={() => setErasing(true)} disabled={!canErase || busy}>
              Erase personal data…
            </button>
            {!complete && <p className="small muted">Available once the contest is complete.</p>}
          </>
        )}
        {erasing && (
          <TypedConfirm word="ERASE" title={`Erase ${contest.year} personal data`} busy={busy} onCancel={() => setErasing(false)} onConfirm={erase}>
            <p>Every entrant&rsquo;s name and email, every buyer&rsquo;s email, and all newsletter opt-ins for this contest are replaced. This cannot be undone.</p>
          </TypedConfirm>
        )}
      </section>
    </div>
  )
}
