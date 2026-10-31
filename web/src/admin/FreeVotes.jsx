import { useState } from 'react'
import { stamp } from '../lib/datetime.js'
import { fmtInt } from '../lib/format.js'
import { admin, q, SessionError, view } from './adminClient.js'
import { ErrorNote, Stat, Table, TypedConfirm, useAsync, useDesk } from './shared.jsx'

// The free daily vote, for staff: what is happening, what looks wrong, and the
// two actions (void and block, pause and resume). Each is run as the staff
// member, needs a reason, and is logged. Finished rounds keep their results.
export default function FreeVotes() {
  const { contest, say, onSessionLost, reloadContest } = useDesk()
  const cid = contest.id
  const data = useAsync(async () => {
    const [daily, pets, connections, log, voters] = await Promise.all([
      view(admin.from('free_vote_daily').select('*').eq('contest_id', cid).order('vote_day', { ascending: false })),
      view(admin.from('free_vote_pet_watch').select('*').eq('contest_id', cid).order('free_last_hour', { ascending: false })),
      view(admin.from('free_vote_connection_watch').select('*').eq('contest_id', cid).order('voters', { ascending: false })),
      view(admin.from('free_vote_staff_log').select('*').eq('contest_id', cid).order('created_at', { ascending: false }).limit(20)),
      admin.from('free_voters').select('id', { count: 'exact', head: true }).eq('contest_id', cid).not('verified_at', 'is', null),
    ])
    return { daily, pets, connections, log, verified: voters.count ?? 0 }
  }, [cid])
  const [voiding, setVoiding] = useState(null)
  const [pausing, setPausing] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [lookup, setLookup] = useState('')
  const [found, setFound] = useState(null)

  if (!contest.free_vote_enabled) {
    return (
      <div className="stack">
        <div className="panel-head">
          <h2>Free votes</h2>
        </div>
        <p className="muted">
          Free voting is off for this contest. It can be turned on in Setup while the contest is a draft, and it freezes when
          submissions open.
        </p>
      </div>
    )
  }

  async function act(fn, done) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      say(done)
      setReason('')
      setVoiding(null)
      setPausing(false)
      await Promise.all([data.reload(), reloadContest()])
    } catch (err) {
      if (err instanceof SessionError) onSessionLost(err.message)
      else setError(err)
    } finally {
      setBusy(false)
    }
  }

  async function find(e) {
    e.preventDefault()
    setError(null)
    try {
      const rows = await q(
        admin
          .from('free_voters')
          .select('id, email, verified_at, blocked_at, blocked_reason, reminders_opt_in, newsletter_opt_in')
          .eq('contest_id', cid)
          .eq('email', lookup.trim().toLowerCase()),
      )
      const voter = rows[0] || null
      const votes = voter
        ? await q(admin.from('free_votes').select('vote_day, status, entry_id').eq('voter_id', voter.id).order('vote_day', { ascending: false }))
        : []
      setFound({ voter, votes })
    } catch (err) {
      setError(err)
    }
  }

  const d = data.data
  const today = d?.daily.rows[0]
  const paused = Boolean(contest.free_vote_paused_at)

  return (
    <div className="stack">
      <div className="panel-head">
        <h2>Free votes</h2>
        <button type="button" className="btn btn-quiet btn-sm" onClick={data.reload} disabled={data.loading}>
          {data.loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>
      <ErrorNote error={error || data.error} />
      {paused && (
        <div className="notice warn" role="status">
          <span>
            <strong>Free voting is paused</strong> since {stamp(contest.free_vote_paused_at)}. Readers see &ldquo;Free voting is paused right
            now.&rdquo; Vote packs are unaffected.
          </span>
        </div>
      )}

      <div className="stats">
        <Stat label="Free votes, latest day" value={today ? fmtInt(today.votes) : d ? 0 : '…'} sub={today ? today.vote_day : undefined} />
        <Stat label="Voters, latest day" value={today ? fmtInt(today.voters) : d ? 0 : '…'} />
        <Stat label="Verified addresses" value={d ? fmtInt(d.verified) : '…'} />
        <Stat label="Voided, latest day" value={today ? fmtInt(today.voided) : d ? 0 : '…'} tone={today?.voided ? 'bad' : undefined} />
      </div>

      <section>
        <h3>Pets by free votes, last hour</h3>
        <Table
          rows={d?.pets.rows}
          empty="No free votes in the last hour."
          rowKey={(r) => r.entry_id}
          columns={[
            { key: 'pet_name', label: 'Pet' },
            { key: 'free_last_hour', label: 'Free', num: true },
            { key: 'paid_last_hour', label: 'Paid', num: true },
          ]}
        />
      </section>

      <section>
        <h3>Connections casting for several addresses, last hour</h3>
        <p className="small muted">
          A connection is a keyed hash, never an address. Phones on carrier networks share connections, so a row here is a reason to look,
          not proof.
        </p>
        <Table
          rows={d?.connections.rows}
          empty="Nothing unusual."
          rowKey={(r) => r.connection}
          columns={[
            { key: 'connection', label: 'Connection', render: (r) => <span className="mono">{r.connection}</span> },
            { key: 'voters', label: 'Addresses', num: true },
            { key: 'votes', label: 'Votes', num: true },
            {
              key: 'act',
              label: '',
              render: (r) => (
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => setVoiding({ ids: r.voter_ids, what: `${r.voters} addresses on ${r.connection}` })}>
                  Void and block…
                </button>
              ),
            },
          ]}
        />
      </section>

      <section>
        <h3>Look up a voter</h3>
        <form className="tool-row" onSubmit={find}>
          <label className="sr-only" htmlFor="fv-lookup">
            Email address
          </label>
          <input id="fv-lookup" type="email" value={lookup} onChange={(e) => setLookup(e.target.value)} placeholder="name@example.com" />
          <button type="submit" className="btn btn-quiet btn-sm" disabled={!lookup.trim()}>
            Look up
          </button>
        </form>
        {found && !found.voter && <p className="muted small">No free voter with that address in this contest.</p>}
        {found?.voter && (
          <div className="card plain" style={{ marginTop: 10 }}>
            <dl className="facts">
              <dt>Verified</dt>
              <dd>{found.voter.verified_at ? stamp(found.voter.verified_at) : 'Not yet'}</dd>
              <dt>Free votes</dt>
              <dd>
                {found.votes.filter((v) => v.status === 'counted').length} counted
                {found.votes.some((v) => v.status !== 'counted') ? `, ${found.votes.filter((v) => v.status !== 'counted').length} voided or returned` : ''}
              </dd>
              <dt>Reminders</dt>
              <dd>{found.voter.reminders_opt_in ? 'On' : 'Off'}</dd>
              {found.voter.blocked_at && (
                <>
                  <dt>Blocked</dt>
                  <dd>
                    {stamp(found.voter.blocked_at)}: {found.voter.blocked_reason}
                  </dd>
                </>
              )}
            </dl>
            {!found.voter.blocked_at && (
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => setVoiding({ ids: [found.voter.id], what: found.voter.email })}>
                Void and block…
              </button>
            )}
          </div>
        )}
      </section>

      {voiding && (
        <TypedConfirm
          word="VOID"
          title="Void and block"
          busy={busy}
          onCancel={() => setVoiding(null)}
          onConfirm={() =>
            act(() => q(admin.rpc('void_free_voters', { p_voter_ids: voiding.ids, p_reason: reason })), 'Voided and blocked.')
          }
        >
          <p>
            Blocks {voiding.what}, voids their free votes in rounds still open, and signs out their browsers.{' '}
            <strong>Finished rounds keep their results.</strong>
          </p>
          <label className="field">
            <span className="label">Reason (kept in the log; no email addresses)</span>
            <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
        </TypedConfirm>
      )}

      <section>
        <h3>Pause</h3>
        <p className="small muted">
          For abuse that outruns the limits. Readers can still buy vote packs. Check with counsel before pausing: the free path may matter
          to how the contest is classified.
        </p>
        {pausing ? (
          <div className="card plain">
            <label className="field">
              <span className="label">Reason (kept in the log)</span>
              <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
            <div className="tool-row">
              <button
                type="button"
                className={`btn ${paused ? 'btn-primary' : 'btn-danger'} btn-sm`}
                disabled={busy || !reason.trim()}
                onClick={() =>
                  act(
                    () => q(admin.rpc('set_free_vote_paused', { p_contest_id: cid, p_paused: !paused, p_reason: reason })),
                    paused ? 'Free voting resumed.' : 'Free voting paused.',
                  )
                }
              >
                {paused ? 'Resume free voting' : 'Pause free voting'}
              </button>
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => setPausing(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setPausing(true)}>
            {paused ? 'Resume…' : 'Pause…'}
          </button>
        )}
      </section>

      <section>
        <h3>Log</h3>
        <Table
          rows={d?.log.rows}
          empty="No staff actions yet."
          rowKey={(r) => r.id}
          columns={[
            { key: 'created_at', label: 'When', render: (r) => stamp(r.created_at) },
            { key: 'action', label: 'Action' },
            { key: 'votes_voided', label: 'Voided', num: true },
            { key: 'reason', label: 'Reason' },
          ]}
        />
      </section>
    </div>
  )
}

// Setup: on or off while the contest is a draft. In the published rules, so it
// freezes when submissions open, like the split.
export function FreeVoteSetting({ contest, draft, onSaved }) {
  const { say, onSessionLost } = useDesk()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const on = Boolean(contest.free_vote_enabled)

  async function toggle() {
    setBusy(true)
    setError(null)
    try {
      await q(admin.rpc('set_free_vote_enabled', { p_contest_id: contest.id, p_enabled: !on }))
      say(on ? 'Free daily vote turned off.' : 'Free daily vote turned on.')
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
      <h3 style={{ marginTop: 0 }}>Free daily vote</h3>
      <p className="small">
        {on ? 'On.' : 'Off.'} Readers get one free vote a day, verified by email, alongside vote packs. Free votes count like any vote and
        raise no money.
      </p>
      <p className="small muted">
        {draft
          ? 'Needs, before submissions open: counsel’s answers (docs/FREE-DAILY-VOTE.md, section 9), email turned on, and the FREE_VOTE_HASH_KEY and Turnstile keys set. Freezes when submissions open.'
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
