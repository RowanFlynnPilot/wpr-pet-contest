import { useState } from 'react'
import { stamp } from '../lib/datetime.js'
import { cheerQuote } from '../lib/cheers.js'
import { admin, q, SessionError, view } from './adminClient.js'
import { ErrorNote, useAsync, useDesk } from './shared.jsx'

// Cheers with a first name (0033), newest first, for a glance: the words are
// fixed, so a name is the only thing a buyer can type. Hide removes the cheer
// from the pet page and the live feed (the pack and its votes stay).
export default function CheersReview({ contestId }) {
  const { say, onSessionLost } = useDesk()
  const rows = useAsync(
    async () =>
      (
        await view(
          admin
            .from('votes')
            .select('id, cheer, cheer_name, cheer_hidden_at, confirmed_at, entries(pet_name), rounds!inner(contest_id)')
            .eq('rounds.contest_id', contestId)
            .eq('status', 'succeeded')
            .not('cheer_name', 'is', null)
            .order('confirmed_at', { ascending: false })
            .limit(60),
        )
      ).rows,
    [contestId],
  )
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)

  async function hide(r) {
    setBusy(r.id)
    setError(null)
    try {
      await q(admin.rpc('hide_cheer', { p_vote_id: r.id }))
      say(`Hidden: ${r.cheer_name}'s cheer for ${r.entries?.pet_name || 'the pet'}.`)
      rows.reload()
    } catch (err) {
      if (err instanceof SessionError) onSessionLost(err.message)
      else setError(err)
    } finally {
      setBusy(null)
    }
  }

  const list = rows.data || []
  return (
    <section>
      <div className="panel-head">
        <h2>Cheers with a name</h2>
      </div>
      <p className="small muted">The cheers themselves are fixed phrases; only the first name is typed. Hide one that should not be public.</p>
      <ErrorNote error={error || rows.error} />
      {list.length === 0 ? (
        <p className="muted small">None yet.</p>
      ) : (
        <ul className="plain-list">
          {list.map((r) => (
            <li key={r.id}>
              <strong>{r.cheer_name}</strong> · {cheerQuote(r.cheer, r.entries?.pet_name || 'this pet')} ·{' '}
              <span className="muted">{stamp(r.confirmed_at)}</span>{' '}
              {r.cheer_hidden_at ? (
                <span className="muted small">hidden</span>
              ) : (
                <button type="button" className="link-btn small" onClick={() => hide(r)} disabled={busy === r.id}>
                  Hide
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
