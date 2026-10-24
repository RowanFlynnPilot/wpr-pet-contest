import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { DEMO, SPONSOR_INQUIRY } from './config.js'
import { BACKEND_CONFIGURED, EMBEDDED } from './lib/env.js'
import { useRoute } from './lib/router.js'
import { ContestProvider, useContest } from './components/ContestContext.jsx'
import { CheckoutProvider } from './components/Checkout.jsx'
import { FreeVoteProvider, ReminderNotice } from './components/FreeVote.jsx'
import Masthead from './components/Masthead.jsx'
import Banner from './components/Banner.jsx'
import Nav from './components/Nav.jsx'
import BonusBar from './components/BonusBar.jsx'
import Footer from './components/Footer.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import Home from './pages/Home.jsx'
import Enter from './pages/Enter.jsx'
import Gallery from './pages/Gallery.jsx'
import Pet from './pages/Pet.jsx'
import Bracket from './pages/Bracket.jsx'
import Rules from './pages/Rules.jsx'
import Shelters from './pages/Shelters.jsx'
import Results from './pages/Results.jsx'
import Sponsors from './pages/Sponsors.jsx'
import Unsubscribe from './pages/Unsubscribe.jsx'
import NotFound from './pages/NotFound.jsx'

// Readers never download the admin desk.
const AdminApp = lazy(() => import('./admin/AdminApp.jsx'))

const PAGES = {
  home: Home,
  enter: Enter,
  gallery: Gallery,
  pet: Pet,
  bracket: Bracket,
  rules: Rules,
  shelters: Shelters,
  results: Results,
  sponsors: Sponsors,
  unsubscribe: Unsubscribe,
}

// Stripe returns here only for payment methods that leave the page (most
// never do: cards and wallets confirm in place).
function usePaymentReturn() {
  const [notice, setNotice] = useState(() => {
    const q = new URLSearchParams(window.location.search)
    if (!q.has('paid')) return null
    return { status: q.get('redirect_status') || 'succeeded', pet: q.get('pet') }
  })
  useEffect(() => {
    if (!notice) return
    const clean = `${window.location.pathname}${notice.pet ? `#/pet/${notice.pet}` : window.location.hash}`
    window.history.replaceState(null, '', clean)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    const t = setTimeout(() => setNotice(null), 12000)
    return () => clearTimeout(t)
  }, [notice])
  return notice
}

function Shell({ route }) {
  const c = useContest()
  const Page = PAGES[route.name] || NotFound
  const main = useRef(null)
  const first = useRef(true)
  const payment = usePaymentReturn()

  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    window.scrollTo(0, 0)
    main.current?.focus({ preventScroll: true })
  }, [route.name, route.id])

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main" onClick={(e) => { e.preventDefault(); main.current?.focus() }}>
        Skip to content
      </a>
      {DEMO && (
        <div className="demo-ribbon">
          Sponsor preview: open placements show &ldquo;Your Brand Here.&rdquo;{' '}
          <a href={`mailto:${SPONSOR_INQUIRY}?subject=${encodeURIComponent('Pet contest sponsorship')}`}>Ask about a placement</a>
        </div>
      )}
      <header>
        <Masthead />
        <Banner />
      </header>
      <Nav route={route} />
      {c.loading || !c.windowsLoaded ? (
        // Nothing below the nav until the contest list is in. Anything painted
        // sooner is shoved down when the Double Votes bar arrives with it, and
        // no page has anything to show without the contest anyway.
        <div className="shell-wait" aria-busy="true" />
      ) : (
        <>
          <BonusBar />
          <ReminderNotice />
          {payment && (
            <div className="wrap" style={{ marginTop: 14 }} role="status">
              <div className={`notice${payment.status === 'failed' ? ' error' : ''}`}>
                <span>
                  {payment.status === 'failed' ? (
                    <>
                      <strong>That payment didn&rsquo;t go through.</strong> You were not charged. Please try again.
                    </>
                  ) : (
                    <>
                      <strong>Payment received — your votes will appear within a minute.</strong> Your receipt is on its way by email.
                    </>
                  )}
                </span>
              </div>
            </div>
          )}
          <main id="main" ref={main} tabIndex={-1} style={{ outline: 'none' }}>
            {c.error && !c.contest ? (
              <div className="wrap section">
                <div className="notice error" role="alert">
                  <span>
                    <strong>We can&rsquo;t reach the contest right now.</strong>
                    Check your connection, or try again in a minute.
                  </span>
                </div>
              </div>
            ) : (
              // One page failing keeps the masthead and nav, and moving to
              // another page clears it.
              <ErrorBoundary key={`${route.name}:${route.id || ''}`}>
                <Page route={route} />
              </ErrorBoundary>
            )}
          </main>
          <Footer />
        </>
      )}
    </div>
  )
}

function NotConfigured() {
  return (
    <div className="app-shell">
      <header>
        <Masthead />
      </header>
      <main className="wrap-narrow section">
        <div className="card">
          <h1 style={{ fontSize: 28 }}>The pet contest is almost here.</h1>
          <p style={{ marginTop: 10 }}>
            This page isn&rsquo;t connected to the contest yet. Check back soon, or visit{' '}
            <a href="https://wausaupilotandreview.com/">Wausau Pilot &amp; Review</a>.
          </p>
          <p className="small muted">Developers: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see web/.env.example).</p>
        </div>
      </main>
    </div>
  )
}

export default function App() {
  const route = useRoute()

  if (route.name === 'admin') {
    // Never inside someone else's page: a framed desk could be clickjacked
    // into approving entries (A approves without a confirm). The WordPress
    // embed forwards any #/ route, #/admin included.
    if (EMBEDDED) {
      return (
        <main className="wrap-narrow section">
          <p>
            The contest desk opens only in its own tab.{' '}
            <a href={window.location.href} target="_blank" rel="noopener noreferrer">
              Open it directly
            </a>
            .
          </p>
        </main>
      )
    }
    return (
      <Suspense fallback={<p className="wrap section">Opening the contest desk…</p>}>
        <AdminApp />
      </Suspense>
    )
  }
  if (!BACKEND_CONFIGURED) return <NotConfigured />

  return (
    <ContestProvider>
      <CheckoutProvider>
        <FreeVoteProvider>
          <Shell route={route} />
        </FreeVoteProvider>
      </CheckoutProvider>
    </ContestProvider>
  )
}
