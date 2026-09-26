import { useCallback, useEffect, useMemo, useState } from 'react'
import { STRIPE_DASHBOARD, WPR_BADGE } from '../config.js'
import { STRIPE_PUBLISHABLE_KEY } from '../lib/env.js'
import { parseHash } from '../lib/router.js'
import { admin, q } from './adminClient.js'
import { DeskContext, ErrorNote } from './shared.jsx'
import Moderation from './Moderation.jsx'
import Rounds from './Rounds.jsx'
import Health from './Health.jsx'
import Money from './Money.jsx'
import Packs from './Packs.jsx'
import Email from './Email.jsx'
import Newsletter from './Newsletter.jsx'
import './admin.css'

const TABS = [
  ['moderation', 'Moderation', Moderation],
  ['rounds', 'Rounds', Rounds],
  ['health', 'Health', Health],
  ['money', 'Money', Money],
  ['packs', 'Packs & bonuses', Packs],
  ['email', 'Email', Email],
  ['newsletter', 'Newsletter', Newsletter],
]

// Staff see drafts too. Prefer the contest that is live, then a draft being
// set up, then the most recent.
export function pickAdminContest(contests) {
  const sorted = [...contests].sort((a, b) => b.year - a.year)
  return (
    sorted.find((c) => c.status === 'voting' || c.status === 'submissions_open') ||
    sorted.find((c) => c.status === 'draft') ||
    sorted[0] ||
    null
  )
}

function SignIn({ notice }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error: err } = await admin.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (err) setError(err.message)
  }

  return (
    <main className="desk">
      <form className="card signin" onSubmit={submit}>
        <img src={WPR_BADGE} alt="" width="56" height="56" />
        <p className="kicker" style={{ marginTop: 10 }}>
          Wausau Pilot &amp; Review
        </p>
        <h1 style={{ fontSize: 28, marginBottom: 14 }}>Pet contest desk</h1>
        {notice && (
          <div className="notice warn" style={{ marginBottom: 12 }}>
            <span>{notice}</span>
          </div>
        )}
        {error && (
          <div className="notice error" role="alert" style={{ marginBottom: 12 }}>
            <span>{error}</span>
          </div>
        )}
        <div className="field">
          <label htmlFor="admin-email">Email</label>
          <input id="admin-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="admin-password">Password</label>
          <input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="fine">Staff accounts are invite-only. Ask the contest editor for access.</p>
      </form>
    </main>
  )
}

function useTab() {
  const read = () => parseHash(window.location.hash).sub || 'moderation'
  const [tab, setTab] = useState(read)
  useEffect(() => {
    const on = () => setTab(read())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return tab
}

function Desk({ session, onSessionLost }) {
  const tab = useTab()
  const [isAdmin, setIsAdmin] = useState(null)
  const [contests, setContests] = useState([])
  const [contestId, setContestId] = useState(null)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)

  const loadContests = useCallback(async () => {
    try {
      const rows = await q(admin.from('contests').select('*').order('year', { ascending: false }))
      setContests(rows)
      setContestId((id) => (id && rows.some((c) => c.id === id) ? id : pickAdminContest(rows)?.id || null))
    } catch (e) {
      setError(e)
    }
  }, [])

  useEffect(() => {
    let alive = true
    admin.rpc('is_admin').then(({ data, error: err }) => {
      if (!alive) return
      if (err) setError(err)
      setIsAdmin(data === true)
      if (data === true) loadContests()
    })
    return () => {
      alive = false
    }
  }, [loadContests])

  const say = useCallback((msg) => {
    setToast(msg)
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 5000)
  }, [])

  const contest = contests.find((c) => c.id === contestId) || null
  const ctx = useMemo(() => ({ contest, reloadContest: loadContests, say, onSessionLost }), [contest, loadContests, say, onSessionLost])
  const Panel = (TABS.find(([key]) => key === tab) || TABS[0])[2]
  const stripeUrl = STRIPE_PUBLISHABLE_KEY.startsWith('pk_test') ? `${STRIPE_DASHBOARD}test/payments` : `${STRIPE_DASHBOARD}payments`

  if (isAdmin === false) {
    return (
      <div className="desk">
        <div className="card signin">
          <h1 style={{ fontSize: 24 }}>This account isn&rsquo;t on the contest staff list.</h1>
          <p style={{ marginTop: 8 }}>Signed in as {session.user.email}. Ask the contest editor to add you.</p>
          <button type="button" className="btn btn-quiet" onClick={() => admin.auth.signOut()}>
            Sign out
          </button>
        </div>
      </div>
    )
  }

  return (
    <DeskContext.Provider value={ctx}>
      <div className="desk">
        <header className="desk-head">
          <img src={WPR_BADGE} alt="" width="40" height="40" />
          <div className="desk-title">
            <span className="kicker" style={{ margin: 0 }}>
              Wausau Pilot &amp; Review
            </span>
            <strong>Pet contest desk</strong>
          </div>
          {contests.length > 1 ? (
            <select aria-label="Contest" value={contestId || ''} onChange={(e) => setContestId(e.target.value)} style={{ width: 'auto' }}>
              {contests.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.year} · {c.status}
                </option>
              ))}
            </select>
          ) : (
            contest && (
              <span className="pill">
                {contest.year} · {contest.status.replace('_', ' ')}
              </span>
            )
          )}
          <span className="desk-spacer" />
          <a className="small" href={stripeUrl} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 700 }}>
            Stripe dashboard ↗
          </a>
          <a className="small" href="#/" style={{ fontWeight: 700 }}>
            Public site
          </a>
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => admin.auth.signOut()}>
            Sign out
          </button>
        </header>
        <nav className="desk-tabs" aria-label="Desk sections">
          {TABS.map(([key, label]) => (
            <a key={key} href={`#/admin/${key}`} aria-current={tab === key ? 'page' : undefined}>
              {label}
            </a>
          ))}
        </nav>
        <main className="desk-main">
          <ErrorNote error={error} />
          {isAdmin === null ? <p className="muted">Checking your access…</p> : !contest ? <p className="muted">No contest found.</p> : <Panel key={contest.id} />}
        </main>
        {toast && (
          <div className="toast" role="status">
            {toast}
          </div>
        )}
      </div>
    </DeskContext.Provider>
  )
}

export default function AdminApp() {
  const [session, setSession] = useState(undefined)
  const [notice, setNotice] = useState(null)

  useEffect(() => {
    if (!admin) return
    document.title = 'Pet contest desk — Wausau Pilot & Review'
    admin.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = admin.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const onSessionLost = useCallback((message) => {
    setNotice(message || 'Your session has expired. Sign in again.')
    setSession(null)
  }, [])

  if (!admin) {
    return (
      <div className="desk">
        <div className="card signin">
          <h1 style={{ fontSize: 24 }}>Not connected</h1>
          <p>Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.</p>
        </div>
      </div>
    )
  }
  if (session === undefined) return <div className="desk" aria-busy="true" />
  if (!session) return <SignIn notice={notice} />
  return <Desk session={session} onSessionLost={onSessionLost} />
}
