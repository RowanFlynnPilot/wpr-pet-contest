import { SPONSOR_INQUIRY, SPONSOR_SLOTS, SPONSORS } from '../config.js'
import { useContest } from '../components/ContestContext.jsx'
import { inquiryHref, useInquiry } from '../components/Sponsor.jsx'
import { apDateTime, fmtInt } from '../lib/format.js'
import { useDocumentTitle, useNow } from '../lib/hooks.js'
import { windowTitle } from '../lib/bonus.js'
import { Arrow } from '../components/Icons.jsx'

function Cta({ slot, subject, label, big }) {
  const { onClick, copied } = useInquiry(slot)
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
      <a className={`btn btn-primary${big ? ' btn-lg' : ' btn-sm'}`} href={inquiryHref(subject)} onClick={onClick}>
        {label}
      </a>
      {copied && <span className="small" style={{ fontWeight: 700, color: 'var(--teal-ink)' }}>✓ Address copied</span>}
    </span>
  )
}

// The hosted media kit. Inventory is read live from config.js, so a slot
// marked sold there reads "Sold" here without anyone editing a deck.
export default function Sponsors() {
  const c = useContest()
  useDocumentTitle('Sponsor the pet contest — Wausau Pilot & Review')
  const bonusSold = c.windows.filter((w) => w.sponsor_name)
  const now = useNow(60000)
  const upcoming = c.windows.filter((w) => new Date(w.ends_at).getTime() > now)
  const why = [
    [c.stats ? fmtInt(c.stats.entries) : '—', 'local pets entered, each with a family sharing their page'],
    [c.stats ? fmtInt(c.stats.votes) : '—', 'votes cast so far, every one a return visit'],
    ['2½ weeks', 'of daily traffic, peaking in the bracket'],
    ['0', 'cookies. No consent banner between readers and your brand'],
  ]

  return (
    <div className="wrap section" style={{ paddingTop: 24 }}>
      <p className="kicker">Sponsorships · {c.contest?.year}</p>
      <h1 style={{ fontSize: 'clamp(30px, 6vw, 46px)' }}>Put your name on the county&rsquo;s cutest contest</h1>
      <p className="dek">
        {c.contest?.name || 'The pet contest'} is Wausau Pilot &amp; Review&rsquo;s biggest reader event of the year, and{' '}
        {c.contest ? `${c.contest.beneficiary_split_pct}%` : 'a share'} of every vote pack goes to local animal shelters. Sponsors are seen
        by every pet lover in Marathon County, in a story they want to share.
      </p>
      <div className="hero-actions">
        <Cta slot="media-kit-top" subject="Pet contest sponsorship" label="Start the conversation" big />
        <a className="btn btn-ghost btn-lg" href="?demo#/" target="_blank" rel="noopener">
          Preview your brand on the page
        </a>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', margin: '30px 0' }}>
        {why.map(([n, t]) => (
          <div className="card sun" key={t}>
            <div className="raised-amount" style={{ fontSize: 34 }}>
              {n}
            </div>
            <p className="small muted" style={{ margin: '6px 0 0' }}>
              {t}
            </p>
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: 26, marginBottom: 8 }}>The placements</h2>
      <ul className="inventory card plain">
        {Object.entries(SPONSOR_SLOTS).map(([key, slot]) => {
          const sold = Boolean(SPONSORS[key]) && !SPONSORS[key].demo
          return (
            <li key={key}>
              <div className="inv-main">
                <span className="inv-name">{slot.name}</span>
                <span className={`status-pill${sold ? ' sold' : ''}`}>{sold ? 'Sold' : 'Open'}</span>
                <div className="inv-desc">{slot.pitch}</div>
              </div>
              <a className="small" style={{ fontWeight: 700 }} href={`?demo${slot.demo}`} target="_blank" rel="noopener">
                See it live <Arrow size={14} />
              </a>
              {!sold && <Cta slot={`media-kit-${key}`} subject={`Pet contest sponsorship — ${slot.name}`} label="Inquire" />}
            </li>
          )
        })}
        <li>
          <div className="inv-main">
            <span className="inv-name">Bonus vote windows</span>
            <span className="status-pill">{bonusSold.length ? `${bonusSold.length} booked` : 'Open'}</span>
            <div className="inv-desc">
              &ldquo;Double Vote Hour, presented by you.&rdquo; A site-wide banner, a badge in every checkout, and a spike in purchases while
              your window is live. Sold per window.
              {upcoming.length > 0 && (
                <> Scheduled: {upcoming.map((w) => `${windowTitle(w)} ${apDateTime(w.starts_at)}${w.sponsor_name ? ` (${w.sponsor_name})` : ''}`).join('; ')}</>
              )}
            </div>
          </div>
          <Cta slot="media-kit-bonus" subject="Pet contest sponsorship — bonus vote window" label="Inquire" />
        </li>
      </ul>

      <div className="card plain" style={{ marginTop: 24, background: 'var(--cream)' }}>
        <h2 style={{ fontSize: 19 }}>Provable, not promised</h2>
        <p className="small" style={{ margin: '6px 0 0' }}>
          Each placement reports its own impressions and click-throughs, measured without cookies, and your link carries your campaign tags so
          the traffic shows up in your analytics too.
        </p>
      </div>

      <div className="center" style={{ margin: '36px 0 0' }}>
        <Cta slot="media-kit-bottom" subject="Pet contest sponsorship" label="Book a placement" big />
        <p className="small muted" style={{ marginTop: 10 }}>
          {SPONSOR_INQUIRY} · 715-301-5539 · Wausau Pilot &amp; Review
        </p>
      </div>
    </div>
  )
}
