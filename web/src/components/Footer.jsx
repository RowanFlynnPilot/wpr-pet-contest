import { NEWSROOM, SUPPORT_URL } from '../config.js'
import { track } from '../lib/analytics.js'
import { useContest } from './ContestContext.jsx'
import { ShelterMark } from './ShelterLogo.jsx'

export default function Footer() {
  const { contest, shelters } = useContest()
  const split = contest?.beneficiary_split_pct
  const partner = shelters?.length === 1 ? shelters[0] : null
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="footer-marks">
          {NEWSROOM.badge && <img src={NEWSROOM.badge} alt="" width="44" height="44" loading="lazy" decoding="async" />}
          {partner && <ShelterMark shelter={partner} size={44} />}
        </div>
        <div className="footer-text">
          <p>
            Photos are submitted by readers and reviewed by an editor at {NEWSROOM.name} before they appear.
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
                ; the remainder covers payment processing and supports{' '}
                {NEWSROOM.nonprofit ? <>{NEWSROOM.name}&rsquo;s nonprofit newsroom</> : NEWSROOM.name}.
              </>
            )}{' '}
            Payments are processed by Stripe; {NEWSROOM.shortName} never sees your card number.
          </p>
          <p>
            {NEWSROOM.name} · {NEWSROOM.phone} · {NEWSROOM.nonprofit ? 'a nonprofit newsroom' : 'a newsroom'} serving {NEWSROOM.region}.
          </p>
          <div className="footer-links">
            <a href="#/rules">Official rules</a>
            <a href="#/shelters">{partner ? partner.name : 'Partner shelters'}</a>
            <a href="#/sponsors">Advertise on this contest</a>
            <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer" onClick={() => track('Donate Click', { from: 'footer' })}>
              {NEWSROOM.nonprofit ? 'Support local news (tax-deductible)' : `Subscribe to ${NEWSROOM.shortName}`}
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
