// Setting a contest up from the desk: create it, fix it while it is a draft,
// list its shelters and their payout shares, and see what is still missing
// before submissions open. Contest status itself still moves only through the
// Rounds tab (open_submissions, open_round, close_round).
import { useState } from 'react'
import { RULES } from '../config.js'
import { fromLocalInput, stamp, toLocalInput } from '../lib/datetime.js'
import { APP_BASE, PUBLIC_URL, STRIPE_PUBLISHABLE_KEY } from '../lib/env.js'
import { useNow } from '../lib/hooks.js'
import { admin, q, SessionError } from './adminClient.js'
import { ErrorNote, TypedConfirm, useAsync, useDesk } from './shared.jsx'
import { FreeVoteSetting } from './FreeVotes.jsx'

const BRACKETS = [8, 16, 32]
const ROUND_HOURS = [24, 48, 72]

function SettingsFields({ d, set, withYear }) {
  return (
    <div className="window-form">
      {withYear && (
        <label>
          <span className="label">Year</span>
          <input type="number" min="2024" max="2100" value={d.year} onChange={(e) => set({ year: e.target.value })} required />
        </label>
      )}
      <label style={{ gridColumn: 'span 2' }}>
        <span className="label">Name</span>
        <input type="text" value={d.name} onChange={(e) => set({ name: e.target.value })} required maxLength={120} />
      </label>
      <label>
        <span className="label">Shelter share (%)</span>
        <input type="number" min="0" max="100" value={d.split} onChange={(e) => set({ split: e.target.value })} required />
      </label>
      <label>
        <span className="label">Submissions open</span>
        <input type="datetime-local" value={d.open} onChange={(e) => set({ open: e.target.value })} required />
      </label>
      <label>
        <span className="label">Submissions close</span>
        <input type="datetime-local" value={d.close} onChange={(e) => set({ close: e.target.value })} required />
      </label>
      <label>
        <span className="label">Bracket</span>
        <select value={d.bracket} onChange={(e) => set({ bracket: Number(e.target.value) })}>
          {BRACKETS.map((b) => (
            <option key={b} value={b}>
              {b} pets
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="label">Each bracket round</span>
        <select value={d.hours} onChange={(e) => set({ hours: Number(e.target.value) })}>
          {ROUND_HOURS.map((h) => (
            <option key={h} value={h}>
              {h} hours
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

const args = (d) => ({
  p_name: d.name,
  p_split_pct: Number(d.split),
  p_submissions_open_at: fromLocalInput(d.open),
  p_submissions_close_at: fromLocalInput(d.close),
  p_bracket_size: Number(d.bracket),
  p_round_hours: Number(d.hours),
})

// Shown on its own when no contest exists yet, and under "Start next year's
// contest" otherwise (copying that contest's packs and shelters).
export function NewContestForm({ from, onCreated, onCancel }) {
  const { say, onSessionLost } = useDesk() || {}
  const year = (from?.year || new Date().getFullYear() - 1) + 1
  const [d, setD] = useState({
    year,
    name: from?.name?.replace(/\d{4}/, String(year)) || `Cutest Pet in Marathon County ${year}`,
    split: from?.beneficiary_split_pct ?? 30,
    open: '',
    close: '',
    bracket: from?.bracket_size || 16,
    hours: from?.bracket_round_hours || 48,
  })
  const [copy, setCopy] = useState(Boolean(from))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function create(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const id = await q(admin.rpc('create_contest', { p_year: Number(d.year), ...args(d), p_copy_from: copy && from ? from.id : null }))
      say?.(`The ${d.year} contest is set up as a draft.`)
      onCreated(id)
    } catch (err) {
      if (err instanceof SessionError) onSessionLost?.(err.message)
      else setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card plain" onSubmit={create}>
      <h3 style={{ marginTop: 0 }}>{from ? `Start the ${year} contest` : 'Set up the contest'}</h3>
      <p className="small">
        It starts as a draft: nothing is public and everything can be changed until you open submissions from the Rounds tab. The shelter
        share is published on the rules page, so settle it with the shelters (and their MOUs) first.
      </p>
      <SettingsFields d={d} set={(p) => setD({ ...d, ...p })} withYear />
      {from && (
        <label className="check" style={{ marginTop: 10 }}>
          <input type="checkbox" checked={copy} onChange={(e) => setCopy(e.target.checked)} />
          <span>Copy the {from.year} vote packs and shelters</span>
        </label>
      )}
      {!copy && <p className="small muted">New contests start with the recommended pack ladder: $5, $20, $50, $100 and $250.</p>}
      <ErrorNote error={error} />
      <div className="tool-row" style={{ marginTop: 12 }}>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Creating…' : 'Create draft'}
        </button>
        {onCancel && (
          <button type="button" className="btn btn-quiet" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}

function Check({ ok, warn, label, hint }) {
  const mark = ok ? '✓' : warn ? '!' : '✗'
  return (
    <li className={ok ? 'good' : warn ? '' : 'bad'} style={{ marginBottom: 6 }}>
      <strong>{mark}</strong> {label}
      {!ok && hint && <div className="small muted">{hint}</div>}
    </li>
  )
}

function Readiness({ contest, packs, shelters, rounds }) {
  const now = useNow(60000)
  const draft = contest.status === 'draft'
  const live = STRIPE_PUBLISHABLE_KEY.startsWith('pk_live')
  const closes = Date.parse(contest.submissions_close_at)
  return (
    <section className="card plain">
      <h3 style={{ marginTop: 0 }}>Before submissions open</h3>
      <ul className="plain-list">
        <Check ok={packs.length > 0} label={`${packs.length} active vote pack${packs.length === 1 ? '' : 's'}`} hint="Packs & bonuses tab." />
        <Check ok={shelters.length > 0} label={`${shelters.length} partner shelter${shelters.length === 1 ? '' : 's'}`} hint="Add them below, once their MOUs are signed." />
        <Check
          ok={shelters.length > 0 && shelters.every((s) => s.logo_path)}
          warn
          label="Every shelter has a logo"
          hint="Paste a link to each shelter's logo below; the shelters page shows a paw without one."
        />
        <Check ok={RULES.rulesApproved} label="Rules approved" hint="The rules page shows a DRAFT ribbon until rulesApproved is true in web/src/config.js." />
        <Check
          ok={Boolean(STRIPE_PUBLISHABLE_KEY)}
          label={STRIPE_PUBLISHABLE_KEY ? `Checkout connected (${live ? 'live' : 'test'} mode)` : 'Checkout connected'}
          hint="Set VITE_STRIPE_PUBLISHABLE_KEY (docs/LAUNCH.md, section 3)."
        />
        {STRIPE_PUBLISHABLE_KEY && !live && <Check warn label="Checkout is in test mode" hint="Switch to live keys after the dry run." />}
        <Check ok={PUBLIC_URL !== APP_BASE} warn label="Share links point at the WordPress page" hint="Set VITE_PUBLIC_URL to the contest page." />
        {draft && <Check ok={closes > now} label={`Submissions close ${stamp(contest.submissions_close_at)}`} hint="That is in the past; change it below." />}
        <Check
          ok={rounds.some((r) => r.seq === 1)}
          warn={draft}
          label={draft ? 'Round 1 is staged when you open submissions' : 'Round 1 is staged'}
          hint={draft ? 'Rounds tab → Open submissions.' : undefined}
        />
      </ul>
    </section>
  )
}

function DraftSettings({ contest, onSaved }) {
  const { say, onSessionLost } = useDesk()
  const [d, setD] = useState({
    name: contest.name,
    split: contest.beneficiary_split_pct,
    open: toLocalInput(contest.submissions_open_at),
    close: toLocalInput(contest.submissions_close_at),
    bracket: contest.bracket_size,
    hours: contest.bracket_round_hours,
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await q(admin.rpc('update_draft_contest', { p_contest_id: contest.id, ...args(d) }))
      say('Contest details saved.')
      onSaved()
    } catch (err) {
      if (err instanceof SessionError) onSessionLost(err.message)
      else setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card plain" onSubmit={save}>
      <h3 style={{ marginTop: 0 }}>Contest details</h3>
      <p className="small muted">Editable until submissions open. After that the split and schedule are public and stay put.</p>
      <SettingsFields d={d} set={(p) => setD({ ...d, ...p })} />
      <ErrorNote error={error} />
      <div className="tool-row" style={{ marginTop: 12 }}>
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
          {busy ? 'Saving…' : 'Save details'}
        </button>
      </div>
    </form>
  )
}

function LockedSettings({ contest }) {
  return (
    <section className="card plain">
      <h3 style={{ marginTop: 0 }}>Contest details</h3>
      <dl className="facts">
        <dt>Shelter share</dt>
        <dd>{contest.beneficiary_split_pct}% of vote pack sales after refunds</dd>
        <dt>Submissions</dt>
        <dd>
          {stamp(contest.submissions_open_at)} to {stamp(contest.submissions_close_at)}
        </dd>
        <dt>Bracket</dt>
        <dd>
          {contest.bracket_size} pets, {contest.bracket_round_hours}-hour rounds
        </dd>
      </dl>
      <p className="small muted">Published and locked since submissions opened.</p>
    </section>
  )
}

function ShelterRow({ shelter, totalWeight, locked, onSaved, onError }) {
  const [d, setD] = useState({ name: shelter.name, url: shelter.url || '', logo: shelter.logo_path || '', weight: shelter.payout_weight })
  const share = totalWeight ? Math.round((shelter.payout_weight / totalWeight) * 1000) / 10 : 0
  async function save(e) {
    e.preventDefault()
    try {
      await q(
        admin
          .from('shelters')
          .update({ name: d.name.trim(), url: d.url.trim() || null, logo_path: d.logo.trim() || null, payout_weight: Number(d.weight) || 1 })
          .eq('id', shelter.id),
      )
      onSaved(`${d.name.trim()} saved.`)
    } catch (err) {
      onError(err)
    }
  }
  async function remove() {
    if (!window.confirm(`Remove ${shelter.name} from this contest?`)) return
    try {
      await q(admin.from('shelters').delete().eq('id', shelter.id))
      onSaved(`${shelter.name} removed.`)
    } catch (err) {
      onError(err)
    }
  }
  return (
    <form className="add-row" onSubmit={save}>
      <input type="text" aria-label="Shelter name" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} required />
      <input type="url" aria-label="Shelter website" placeholder="https://" value={d.url} onChange={(e) => setD({ ...d, url: e.target.value })} />
      <input type="url" aria-label="Logo link" placeholder="Logo link (https://…)" value={d.logo} onChange={(e) => setD({ ...d, logo: e.target.value })} />
      <input
        type="number"
        aria-label="Payout share weight"
        min="1"
        value={d.weight}
        onChange={(e) => setD({ ...d, weight: e.target.value })}
        title={locked ? 'Locked since submissions opened' : 'Relative share of the shelter pool'}
        disabled={locked}
      />
      <span className="small muted">{share}% of pool</span>
      <button type="submit" className="btn btn-primary btn-sm">
        Save
      </button>
      {!locked && (
        <button type="button" className="btn btn-quiet btn-sm" onClick={remove}>
          Remove
        </button>
      )}
    </form>
  )
}

function Shelters({ contest, shelters, onChange }) {
  const { say, onSessionLost } = useDesk()
  const [d, setD] = useState({ name: '', url: '', logo: '', weight: 1 })
  const [error, setError] = useState(null)
  const total = shelters.reduce((n, s) => n + s.payout_weight, 0)
  const locked = contest.status !== 'draft'
  const fail = (err) => (err instanceof SessionError ? onSessionLost(err.message) : setError(err))

  async function add(e) {
    e.preventDefault()
    try {
      await q(
        admin.from('shelters').insert({
          contest_id: contest.id,
          name: d.name.trim(),
          url: d.url.trim() || null,
          logo_path: d.logo.trim() || null,
          payout_weight: Number(d.weight) || 1,
        }),
      )
      setD({ name: '', url: '', logo: '', weight: 1 })
      say('Shelter added.')
      onChange()
    } catch (err) {
      fail(err)
    }
  }

  return (
    <section className="card plain">
      <h3 style={{ marginTop: 0 }}>Partner shelters</h3>
      <p className="small">
        Shown on the shelters page and in the payout statement. The weight sets each shelter&rsquo;s share of the pool, as agreed in its MOU:
        equal weights split evenly; 2 and 1 is two thirds and one third.
      </p>
      <ErrorNote error={error} />
      {shelters.map((s) => (
        <ShelterRow
          key={s.id}
          shelter={s}
          totalWeight={total}
          locked={locked}
          onSaved={(msg) => {
            say(msg)
            onChange()
          }}
          onError={fail}
        />
      ))}
      {locked ? (
        <p className="small muted">Weights and the list are locked since submissions opened: they are the published split. Names, links and logos can still be fixed.</p>
      ) : (
        <form className="add-row" onSubmit={add} style={{ marginTop: 8 }}>
          <input type="text" placeholder="Shelter name" aria-label="New shelter name" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} required />
          <input type="url" placeholder="https://" aria-label="New shelter website" value={d.url} onChange={(e) => setD({ ...d, url: e.target.value })} />
          <input type="url" placeholder="Logo link (https://…)" aria-label="New shelter logo link" value={d.logo} onChange={(e) => setD({ ...d, logo: e.target.value })} />
          <input type="number" min="1" aria-label="New shelter payout weight" value={d.weight} onChange={(e) => setD({ ...d, weight: e.target.value })} />
          <button type="submit" className="btn btn-primary btn-sm">
            Add shelter
          </button>
        </form>
      )}
    </section>
  )
}

export default function Setup() {
  const { contest, reloadContest, selectContest, say, onSessionLost } = useDesk()
  const cid = contest.id
  const data = useAsync(async () => {
    const [packs, shelters, rounds] = await Promise.all([
      q(admin.from('vote_packs').select('id').eq('contest_id', cid).eq('active', true)),
      q(admin.from('shelters').select('*').eq('contest_id', cid).order('name')),
      q(admin.from('rounds').select('id, seq').eq('contest_id', cid)),
    ])
    return { packs, shelters, rounds }
  }, [cid])
  const [startNext, setStartNext] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const draft = contest.status === 'draft'

  async function removeDraft() {
    setBusy(true)
    setError(null)
    try {
      await q(admin.rpc('delete_draft_contest', { p_contest_id: cid }))
      say(`The ${contest.year} draft was deleted.`)
      setDeleting(false)
      selectContest(null)
      await reloadContest()
    } catch (err) {
      if (err instanceof SessionError) onSessionLost(err.message)
      else setError(err)
    } finally {
      setBusy(false)
    }
  }

  const d = data.data
  return (
    <div className="stack">
      <div className="panel-head">
        <h2>
          {contest.year} setup <span className="count-pill">{contest.status.replace('_', ' ')}</span>
        </h2>
      </div>
      <ErrorNote error={error || data.error} />
      {d && (contest.status === 'draft' || contest.status === 'submissions_open') && <Readiness contest={contest} {...d} />}
      {draft ? <DraftSettings key={cid} contest={contest} onSaved={reloadContest} /> : <LockedSettings contest={contest} />}
      <FreeVoteSetting contest={contest} draft={draft} onSaved={reloadContest} />
      {d && <Shelters contest={contest} shelters={d.shelters} onChange={data.reload} />}

      {startNext ? (
        <NewContestForm
          from={contest}
          onCancel={() => setStartNext(false)}
          onCreated={async (id) => {
            setStartNext(false)
            await reloadContest()
            selectContest(id)
          }}
        />
      ) : (
        <div className="tool-row">
          <button type="button" className="btn btn-quiet" onClick={() => setStartNext(true)}>
            Start next year&rsquo;s contest…
          </button>
          {draft && (
            <button type="button" className="btn btn-quiet" onClick={() => setDeleting(true)}>
              Delete this draft…
            </button>
          )}
        </div>
      )}
      {deleting && (
        <TypedConfirm word="DELETE" title={`Delete the ${contest.year} draft`} busy={busy} onCancel={() => setDeleting(false)} onConfirm={removeDraft}>
          <p>The draft, its vote packs and its shelters are removed. A contest with entries cannot be deleted.</p>
        </TypedConfirm>
      )}
    </div>
  )
}
