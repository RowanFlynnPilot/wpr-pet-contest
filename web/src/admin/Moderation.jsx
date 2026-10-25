import { useEffect, useRef, useState } from 'react'
import PetPhoto from '../components/PetPhoto.jsx'
import { stamp } from '../lib/datetime.js'
import { admin, callAdmin, q, SessionError } from './adminClient.js'
import { ErrorNote, useAsync, useDesk } from './shared.jsx'
import CheersReview from './Cheers.jsx'

export const REJECT_PRESETS = [
  'Photo is not a pet',
  'Photo quality too low',
  'Duplicate entry',
  'Inappropriate content',
  "Not the entrant's own photo",
]

const SPECIES = ['dog', 'cat', 'other']

// Removing a pet after voting has started. Everything bought for it is
// refunded and its opponent advances, so this asks for a reason and a typed
// confirmation, like closing a round.
function DisqualifyForm({ entry, busy, onSubmit, onCancel }) {
  const [reason, setReason] = useState('')
  const [typed, setTyped] = useState('')
  const ok = reason.trim().length > 0 && typed.trim().toUpperCase() === 'DISQUALIFY'
  return (
    <form
      className="confirm"
      role="dialog"
      aria-modal="false"
      aria-label={`Disqualify ${entry.pet_name}`}
      onSubmit={(e) => {
        e.preventDefault()
        if (ok && !busy) onSubmit(reason.trim())
      }}
    >
      <h3 style={{ marginTop: 0 }}>Disqualify {entry.pet_name}?</h3>
      <ul className="small" style={{ margin: '0 0 12px', paddingLeft: 18 }}>
        <li>Every vote pack bought for {entry.pet_name}, in every round, is refunded through Stripe.</li>
        <li>If it is in a matchup, its opponent advances whatever the count.</li>
        <li>It leaves the public site and its photo is deleted.</li>
        <li>This cannot be undone.</li>
      </ul>
      <label className="field" style={{ marginBottom: 10 }}>
        <span className="label">Reason (kept with the entry)</span>
        <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} autoFocus />
      </label>
      <label className="field" style={{ marginBottom: 10 }}>
        <span className="label">
          Type <strong>DISQUALIFY</strong> to confirm
        </span>
        <input type="text" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />
      </label>
      <div className="tool-row">
        <button type="submit" className="btn btn-danger" disabled={!ok || busy}>
          {busy ? 'Disqualifying…' : 'Disqualify and refund'}
        </button>
        <button type="button" className="btn btn-quiet" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  )
}
// The owner takes the pet out (it died, was rehomed, the family changed its
// mind). Unlike a disqualification nobody is refunded: the published rules say
// so, and the shelters' share stands.
function WithdrawForm({ entry, busy, onSubmit, onCancel }) {
  const [reason, setReason] = useState('')
  const [typed, setTyped] = useState('')
  const ok = reason.trim().length > 0 && typed.trim().toUpperCase() === 'WITHDRAW'
  return (
    <form
      className="confirm"
      role="dialog"
      aria-modal="false"
      aria-label={`Withdraw ${entry.pet_name}`}
      onSubmit={(e) => {
        e.preventDefault()
        if (ok && !busy) onSubmit(reason.trim())
      }}
    >
      <h3 style={{ marginTop: 0 }}>Withdraw {entry.pet_name}?</h3>
      <ul className="small" style={{ margin: '0 0 12px', paddingLeft: 18 }}>
        <li>For an owner who asks to take the pet out. A pet that broke the rules is disqualified instead.</li>
        <li>Vote packs already bought for {entry.pet_name} are not refunded, and the shelters&rsquo; share stands.</li>
        <li>If it is in a matchup, its opponent advances whatever the count. Its free votes go back to their voters.</li>
        <li>It leaves the public site and its photo is deleted. This cannot be undone.</li>
      </ul>
      <label className="field" style={{ marginBottom: 10 }}>
        <span className="label">Reason (kept with the entry)</span>
        <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} autoFocus />
      </label>
      <label className="field" style={{ marginBottom: 10 }}>
        <span className="label">
          Type <strong>WITHDRAW</strong> to confirm
        </span>
        <input type="text" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />
      </label>
      <div className="tool-row">
        <button type="submit" className="btn btn-danger" disabled={!ok || busy}>
          {busy ? 'Withdrawing…' : 'Withdraw, no refunds'}
        </button>
        <button type="button" className="btn btn-quiet" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  )
}

const TEXTY = new Set(['text', 'email', 'search', 'number', 'password', 'url', 'tel', 'datetime-local'])
// Shortcuts stay out of the way while someone is typing, but not while a
// radio button or checkbox merely has focus.
const typing = (el) =>
  el && ((el.tagName === 'INPUT' && TEXTY.has(el.type)) || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)

function ReasonPicker({ pet, busy, onSubmit, onCancel }) {
  const [pick, setPick] = useState(null)
  const [other, setOther] = useState('')
  const reason = pick === 'other' ? other.trim() : pick
  const first = useRef(null)

  useEffect(() => {
    first.current?.focus()
  }, [])

  useEffect(() => {
    const on = (e) => {
      if (e.key === 'Escape') return onCancel()
      if (e.key === 'Enter' && reason && !busy) {
        e.preventDefault()
        return onSubmit(reason)
      }
      if (typing(e.target)) return
      const n = Number(e.key)
      if (n >= 1 && n <= REJECT_PRESETS.length) setPick(REJECT_PRESETS[n - 1])
      else if (e.key === String(REJECT_PRESETS.length + 1)) {
        e.preventDefault()
        setPick('other')
        setTimeout(() => document.getElementById('reject-other')?.focus(), 0)
      }
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [reason, busy, onSubmit, onCancel])

  return (
    <form
      className="confirm"
      onSubmit={(e) => {
        e.preventDefault()
        if (reason && !busy) onSubmit(reason)
      }}
      aria-label={`Reject ${pet}`}
    >
      <h3>Reject {pet}?</h3>
      <p className="small muted" style={{ margin: '0 0 8px' }}>
        The reason goes to the entrant. The photo is deleted from the public bucket.
      </p>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="sr-only">Reason</legend>
        {REJECT_PRESETS.map((r, i) => (
          <label key={r} className="check" style={{ marginBottom: 6 }}>
            <input type="radio" name="reason" ref={i === 0 ? first : undefined} checked={pick === r} onChange={() => setPick(r)} />
            <span>
              <kbd>{i + 1}</kbd> {r}
            </span>
          </label>
        ))}
        <label className="check" style={{ marginBottom: 6 }}>
          <input type="radio" name="reason" checked={pick === 'other'} onChange={() => setPick('other')} />
          <span>
            <kbd>{REJECT_PRESETS.length + 1}</kbd> Other
          </span>
        </label>
        {pick === 'other' && (
          <input id="reject-other" type="text" maxLength={200} value={other} onChange={(e) => setOther(e.target.value)} placeholder="Reason the entrant will see" aria-label="Other reason" />
        )}
      </fieldset>
      <div className="tool-row" style={{ marginTop: 12 }}>
        <button type="submit" className="btn btn-danger" disabled={!reason || busy}>
          {busy ? 'Rejecting…' : 'Reject and delete photo'}
        </button>
        <button type="button" className="btn btn-quiet" onClick={onCancel} disabled={busy}>
          Cancel <kbd>Esc</kbd>
        </button>
      </div>
    </form>
  )
}

function Details({ entry, onSaved }) {
  const [edit, setEdit] = useState(false)
  const [draft, setDraft] = useState({
    pet_name: entry.pet_name,
    town: entry.town,
    species: entry.species,
    profile_nickname: entry.profile_nickname || '',
    profile_favorite: entry.profile_favorite || '',
    profile_trick: entry.profile_trick || '',
  })
  const [err, setErr] = useState(null)
  async function save(e) {
    e.preventDefault()
    try {
      // A bad answer can be corrected or cleared here instead of rejecting the entry.
      const answer = (s) => s.trim() || null
      await q(
        admin
          .from('entries')
          .update({
            pet_name: draft.pet_name.trim(),
            town: draft.town.trim(),
            species: draft.species,
            profile_nickname: answer(draft.profile_nickname),
            profile_favorite: answer(draft.profile_favorite),
            profile_trick: answer(draft.profile_trick),
          })
          .eq('id', entry.id),
      )
      setEdit(false)
      onSaved()
    } catch (x) {
      setErr(x)
    }
  }
  if (edit) {
    return (
      <form onSubmit={save} className="stack-sm">
        <ErrorNote error={err} />
        <label className="field">
          <span className="label">Pet name</span>
          <input type="text" maxLength={40} value={draft.pet_name} onChange={(e) => setDraft({ ...draft, pet_name: e.target.value })} />
        </label>
        <label className="field">
          <span className="label">Town</span>
          <input type="text" maxLength={60} value={draft.town} onChange={(e) => setDraft({ ...draft, town: e.target.value })} />
        </label>
        <label className="field">
          <span className="label">Species</span>
          <select value={draft.species} onChange={(e) => setDraft({ ...draft, species: e.target.value })}>
            {SPECIES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        {[
          ['profile_nickname', 'Also answers to', 40],
          ['profile_favorite', 'Favorite thing', 60],
          ['profile_trick', 'Best trick or quirk', 80],
        ].map(([key, label, max]) => (
          <label className="field" key={key}>
            <span className="label">{label}</span>
            <input type="text" maxLength={max} value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} />
          </label>
        ))}
        <div className="tool-row">
          <button className="btn btn-primary btn-sm" type="submit">
            Save
          </button>
          <button className="btn btn-quiet btn-sm" type="button" onClick={() => setEdit(false)}>
            Cancel
          </button>
        </div>
      </form>
    )
  }
  return (
    <>
      <dl className="facts">
        <dt>Pet</dt>
        <dd>
          <strong style={{ fontSize: 20, fontFamily: 'var(--display)' }}>{entry.pet_name}</strong> · {entry.species}
        </dd>
        <dt>Town</dt>
        <dd>{entry.town}</dd>
        <dt>Caption</dt>
        <dd>{entry.caption ? <q>{entry.caption}</q> : <span className="muted">none</span>}</dd>
        {(entry.profile_nickname || entry.profile_favorite || entry.profile_trick) && (
          <>
            <dt>Get to know</dt>
            <dd>
              {entry.profile_nickname && <div>Also answers to: <q>{entry.profile_nickname}</q></div>}
              {entry.profile_favorite && <div>Favorite thing: <q>{entry.profile_favorite}</q></div>}
              {entry.profile_trick && <div>Best trick or quirk: <q>{entry.profile_trick}</q></div>}
            </dd>
          </>
        )}
        <dt>Owner</dt>
        <dd>
          {entry.owner_name} · <a href={`mailto:${entry.owner_email}`}>{entry.owner_email}</a>
        </dd>
        <dt>Newsletter</dt>
        <dd>{entry.newsletter_opt_in ? 'Opted in' : 'No'}</dd>
        <dt>Submitted</dt>
        <dd>{stamp(entry.created_at)}</dd>
        <dt>Release</dt>
        <dd>{entry.rights_accepted_at ? `Accepted ${stamp(entry.rights_accepted_at)}` : <span className="bad">Missing</span>}</dd>
        {entry.shelter_id && (
          <>
            <dt>Wildcard</dt>
            <dd>Adoptable shelter pet</dd>
          </>
        )}
      </dl>
      <button type="button" className="link-btn small" onClick={() => setEdit(true)}>
        Fix a typo in name, town or species
      </button>
    </>
  )
}

export default function Moderation() {
  const { contest, say, onSessionLost } = useDesk()
  const cid = contest.id
  const pending = useAsync(() => q(admin.from('entries').select('*').eq('contest_id', cid).eq('status', 'pending').order('created_at')), [cid])
  const approved = useAsync(() => q(admin.from('entries').select('*').eq('contest_id', cid).eq('status', 'approved').order('moderated_at', { ascending: false })), [cid])
  const rejected = useAsync(
    () => q(admin.from('entries').select('id, pet_name, owner_email, rejection_reason, moderated_at').eq('contest_id', cid).eq('status', 'rejected').order('moderated_at', { ascending: false }).limit(50)),
    [cid],
  )
  const disqualified = useAsync(
    () => q(admin.from('entries').select('id, pet_name, owner_email, disqualification_reason, disqualified_at').eq('contest_id', cid).eq('status', 'disqualified').order('disqualified_at', { ascending: false })),
    [cid],
  )
  const withdrawn = useAsync(
    () => q(admin.from('entries').select('id, pet_name, owner_email, withdrawal_reason, withdrawn_at').eq('contest_id', cid).eq('status', 'withdrawn').order('withdrawn_at', { ascending: false })),
    [cid],
  )
  const [index, setIndex] = useState(0)
  const [rejecting, setRejecting] = useState(null)
  const [disqualifying, setDisqualifying] = useState(null)
  const [withdrawing, setWithdrawing] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const queue = pending.data || []
  const current = queue[Math.min(index, Math.max(0, queue.length - 1))] || null
  const fieldOpen = contest.status === 'draft' || contest.status === 'submissions_open'
  const voting = contest.status === 'voting'

  useEffect(() => {
    const n = queue.length
    document.title = `${n ? `(${n}) ` : ''}Moderation — Pet contest desk`
    return () => {
      document.title = 'Pet contest desk — Wausau Pilot & Review'
    }
  }, [queue.length])

  async function decide(entry, decision, reason) {
    setBusy(true)
    setError(null)
    try {
      const res = await callAdmin('moderate', { entry_id: entry.id, decision, reason })
      if (decision === 'reject' && res.photo_deleted === false) {
        say(`${entry.pet_name} rejected, but the photo was NOT deleted. Check the Health tab.`)
      } else {
        say(`${entry.pet_name} ${decision === 'approve' ? 'approved' : 'rejected'}${res.notified ? ' · email sent' : ''}.`)
      }
      setRejecting(null)
      await Promise.all([pending.reload(), approved.reload(), rejected.reload()])
    } catch (err) {
      if (err instanceof SessionError) onSessionLost(err.message)
      else setError(err)
    } finally {
      setBusy(false)
    }
  }

  async function disqualify(entry, reason) {
    setBusy(true)
    setError(null)
    try {
      const res = await callAdmin('disqualify', { entry_id: entry.id, reason })
      const failed = res.refunds_failed?.length || 0
      say(
        failed
          ? `${entry.pet_name} disqualified, but ${failed} refund${failed === 1 ? '' : 's'} did not go through. Use "Retry refunds" below.`
          : `${entry.pet_name} disqualified · ${res.refunds_requested} refund${res.refunds_requested === 1 ? '' : 's'} requested.`,
      )
      setDisqualifying(null)
      await Promise.all([approved.reload(), disqualified.reload()])
    } catch (err) {
      if (err instanceof SessionError) onSessionLost(err.message)
      else setError(err)
    } finally {
      setBusy(false)
    }
  }

  async function withdraw(entry, reason) {
    setBusy(true)
    setError(null)
    try {
      // As the staff member, so withdrawn_by is the real person.
      await q(admin.rpc('withdraw_entry', { p_entry_id: entry.id, p_reason: reason }))
      const res = await callAdmin('moderate', { entry_id: entry.id, decision: 'purge' }).catch(() => null)
      say(
        res?.photo_deleted === false || !res
          ? `${entry.pet_name} withdrawn, but the photo was NOT deleted. Check the Health tab.`
          : `${entry.pet_name} withdrawn · no refunds · photo deleted.`,
      )
      setWithdrawing(null)
      await Promise.all([approved.reload(), withdrawn.reload()])
    } catch (err) {
      if (err instanceof SessionError) onSessionLost(err.message)
      else setError(err)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    const on = (e) => {
      if (rejecting || disqualifying || withdrawing || busy || typing(e.target) || e.metaKey || e.ctrlKey || e.altKey || !current) return
      if (e.key === 'a') {
        e.preventDefault()
        decide(current, 'approve')
      } else if (e.key === 'r') {
        e.preventDefault()
        setRejecting(current)
      } else if (e.key === 'j' || e.key === 'ArrowRight') setIndex((i) => Math.min(i + 1, queue.length - 1))
      else if (e.key === 'k' || e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1))
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  })

  return (
    <div className="stack">
      <ErrorNote error={error || pending.error} />
      <section>
        <div className="panel-head">
          <h2>
            Pending <span className="count-pill">{queue.length}</span>
          </h2>
          <span className="small muted">
            <kbd>A</kbd> approve · <kbd>R</kbd> reject · <kbd>J</kbd>/<kbd>K</kbd> next/previous
          </span>
        </div>
        {pending.loading && !pending.data ? (
          <p className="muted">Loading the queue…</p>
        ) : !current ? (
          <div className="all-clear">The queue is clear. Nothing waiting.</div>
        ) : (
          <div className="mod-card">
            <div className="mod-photo">
              <PetPhoto entry={current} width={1200} contain eager />
            </div>
            <div className="mod-info">
              <p className="small muted" style={{ margin: 0 }}>
                {Math.min(index, queue.length - 1) + 1} of {queue.length}
              </p>
              <Details key={current.id} entry={current} onSaved={pending.reload} />
              {rejecting?.id === current.id ? (
                <ReasonPicker pet={current.pet_name} busy={busy} onCancel={() => setRejecting(null)} onSubmit={(reason) => decide(current, 'reject', reason)} />
              ) : (
                <div className="tool-row" style={{ marginTop: 16 }}>
                  <button type="button" className="btn btn-primary" onClick={() => decide(current, 'approve')} disabled={busy}>
                    Approve <kbd>A</kbd>
                  </button>
                  <button type="button" className="btn btn-quiet" onClick={() => setRejecting(current)} disabled={busy}>
                    Reject <kbd>R</kbd>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
        {queue.length > 1 && (
          <div className="thumbs" aria-label="Queue">
            {queue.map((e, i) => (
              <button key={e.id} type="button" className={`thumb${e.id === current?.id ? ' on' : ''}`} onClick={() => setIndex(i)} aria-label={`${e.pet_name}, ${i + 1} of ${queue.length}`}>
                <PetPhoto entry={e} width={160} square alt="" />
              </button>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="panel-head">
          <h2>
            Approved <span className="count-pill">{approved.data?.length ?? '…'}</span>
          </h2>
          <span className="small muted">
            {fieldOpen
              ? 'A bad approval can still be rejected until voting starts.'
              : voting
                ? 'Voting has started: the field is set. A pet that breaks the rules can still be disqualified.'
                : 'The contest is over.'}
          </span>
        </div>
        {disqualifying && (
          <DisqualifyForm entry={disqualifying} busy={busy} onCancel={() => setDisqualifying(null)} onSubmit={(reason) => disqualify(disqualifying, reason)} />
        )}
        {withdrawing && (
          <WithdrawForm entry={withdrawing} busy={busy} onCancel={() => setWithdrawing(null)} onSubmit={(reason) => withdraw(withdrawing, reason)} />
        )}
        {rejecting && rejecting.status === 'approved' && (
          <ReasonPicker pet={rejecting.pet_name} busy={busy} onCancel={() => setRejecting(null)} onSubmit={(reason) => decide(rejecting, 'reject', reason)} />
        )}
        <div className="mini-grid">
          {(approved.data || []).map((e) => (
            <div className="mini" key={e.id}>
              <PetPhoto entry={e} width={300} square alt="" />
              <div className="mini-body">
                <strong>{e.pet_name}</strong>
                <span className="small muted">
                  {e.town} · {e.owner_email}
                </span>
                {fieldOpen && (
                  <button type="button" className="link-btn small" onClick={() => setRejecting(e)} disabled={busy}>
                    Reject
                  </button>
                )}
                {voting && (
                  <button type="button" className="link-btn small" onClick={() => setDisqualifying(e)} disabled={busy}>
                    Disqualify…
                  </button>
                )}
                {(voting || contest.status === 'submissions_open') && (
                  <button type="button" className="link-btn small" onClick={() => setWithdrawing(e)} disabled={busy}>
                    Withdraw…
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {(withdrawn.data || []).length > 0 && (
        <section>
          <div className="panel-head">
            <h2>Withdrawn</h2>
            <span className="small muted">Taken out at the owner&rsquo;s request. No refunds; the shelters&rsquo; share stands.</span>
          </div>
          <ul className="plain-list">
            {withdrawn.data.map((e) => (
              <li key={e.id}>
                <strong>{e.pet_name}</strong> · {e.withdrawal_reason} · <span className="muted">{stamp(e.withdrawn_at)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(disqualified.data || []).length > 0 && (
        <section>
          <div className="panel-head">
            <h2>Disqualified</h2>
            <span className="small muted">Retrying asks Stripe again only for refunds still outstanding.</span>
          </div>
          <ul className="plain-list">
            {disqualified.data.map((e) => (
              <li key={e.id}>
                <strong>{e.pet_name}</strong> · {e.disqualification_reason} · <span className="muted">{stamp(e.disqualified_at)}</span>{' '}
                <button type="button" className="link-btn small" onClick={() => disqualify(e, null)} disabled={busy}>
                  Retry refunds
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {contest.status !== 'draft' && <CheersReview contestId={cid} />}

      <section>
        <div className="panel-head">
          <h2>Recently rejected</h2>
        </div>
        {(rejected.data || []).length === 0 ? (
          <p className="muted small">None.</p>
        ) : (
          <ul className="plain-list">
            {rejected.data.map((e) => (
              <li key={e.id}>
                <strong>{e.pet_name}</strong> · {e.rejection_reason} · <span className="muted">{stamp(e.moderated_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
