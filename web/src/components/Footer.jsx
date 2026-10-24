import { SUPPORT_URL, WPR_BADGE, WPR_PHONE } from '../config.js'
import { track } from '../lib/analytics.js'
import { useContest } from './ContestContext.jsx'

export default function Footer() {
  const { contest, shelters } = useContest()
  const split = contest?.beneficiary_split_pct
  const partner = shelters?.length === 1 ? shelters[0] : null
  return (
    <footer className="footer">
      <div className="wrap">
        <img src={WPR_BADGE} alt="" width="44" height="44" loading="lazy" decoding="async" />
        <div className="footer-text">
          <p>
            Photos are submitted by readers and reviewed by a Wausau Pilot &amp; Review editor before they appear.
            Vote counts come straight from confirmed payments and refresh every 20 seconds; vote totals reset at
            the start of every round.
          </p>
          <p>
            Vote pack purchases are not tax-deductible donations.
            {split != null && (
              <>
                {' '}
                {split}% of proceeds go to{' '}
                {partner ? (
                  partner.url ? (
                    <a href={partner.url} target="_blank" rel="noopener noreferrer">
                      {partner.name}
                    </a>
                  ) : (
                    partner.name
                  )
                ) : (
                  "the contest's partner animal shelters"
                )}
                ; the remainder covers payment processing and supports Wausau Pilot &amp; Review&rsquo;s nonprofit newsroom.
              </>
            )}{' '}
            Payments are processed by Stripe; WPR never sees your card number.
          </p>
          <p>
            Wausau Pilot &amp; Review · {WPR_PHONE} · a nonprofit newsroom serving Marathon County.
          </p>
          <div className="footer-links">
            <a href="#/rules">Official rules</a>
            <a href="#/shelters">{partner ? partner.name : 'Partner shelters'}</a>
            <a href="#/sponsors">Advertise on this contest</a>
            <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer" onClick={() => track('Donate Click', { from: 'footer' })}>
              Support local news (tax-deductible)
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
