import { useEffect, useState } from 'react'
import { useContest } from '../components/ContestContext.jsx'
import { Arrow, Paw } from '../components/Icons.jsx'
import { fetchFeaturedAdoptable } from '../lib/api.js'
import { fmtMoney } from '../lib/format.js'
import { useDocumentTitle } from '../lib/hooks.js'
import { photoUrl } from '../lib/photos.js'

// logo_path is either a full URL (a logo the shelter already hosts) or a path
// in the pets bucket. Staff cannot upload to the bucket, so a URL is the usual
// case.
export function shelterLogoUrl(logoPath) {
  if (!logoPath) return null
  return /^https?:\/\//i.test(logoPath) ? logoPath : photoUrl(logoPath)
}

function Logo({ shelter }) {
  const [failed, setFailed] = useState(false)
  const src = shelterLogoUrl(shelter.logo_path)
  return (
    <span className="shelter-logo" aria-hidden="true">
      {src && !failed ? <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} /> : <Paw size={30} style={{ color: 'var(--teal)' }} />}
    </span>
  )
}

export function ShelterList({ shelters }) {
  return (
    <div className="shelters">
      {shelters.map((s) => (
        <div className="card plain shelter" key={s.id}>
          <Logo shelter={s} />
          <div style={{ minWidth: 0 }}>
            <div className="shelter-name">{s.name}</div>
            {s.url && (
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="small" style={{ fontWeight: 700 }}>
                Visit their site <Arrow size={14} />
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function Adoptable() {
  const [pet, setPet] = useState(null)
  useEffect(() => {
    let alive = true
    fetchFeaturedAdoptable().then((p) => alive && setPet(p))
    return () => {
      alive = false
    }
  }, [])
  if (!pet) return null
  const facts = [pet.breed, pet.age].filter(Boolean).join(' · ')
  return (
    <section className="section" aria-labelledby="adopt-title">
      <div className="card sun adoptable">
        {pet.pngLatestUrl && <img src={pet.pngLatestUrl} alt={`${pet.name}, ${facts}`} loading="lazy" width="1200" height="1502" />}
        <div>
          <p className="kicker sun">Looking for a home</p>
          <h2 id="adopt-title" style={{ fontSize: 30 }}>
            Meet {pet.name}
          </h2>
          <p style={{ margin: '8px 0 0' }}>
            {facts}
            {pet.shelterName ? `, at ${pet.shelterName}` : ''}.
            {pet.tenureDays > 30 ? ` ${pet.name} has been waiting ${pet.tenureDays} days for a family.` : ''}
          </p>
          <a className="btn btn-primary" href={pet.petUrl} target="_blank" rel="noopener noreferrer" style={{ marginTop: 12 }}>
            See {pet.name}&rsquo;s profile
          </a>
          <p className="fine">From Wausau Pilot &amp; Review&rsquo;s daily adoptable-pet feature.</p>
        </div>
      </div>
    </section>
  )
}

export default function Shelters() {
  const c = useContest()
  useDocumentTitle('Partner shelters — Wausau Pilot & Review')
  const split = c.contest?.beneficiary_split_pct
  return (
    <div className="wrap section" style={{ paddingTop: 24 }}>
      <p className="kicker">Where the money goes</p>
      <h1 style={{ fontSize: 'clamp(30px, 6vw, 46px)' }}>Our partner shelters</h1>
      <p className="dek">
        {split != null ? `${split}% of every vote pack` : 'A share of every vote pack'} goes to these local animal shelters
        {c.stats ? `: ${fmtMoney(c.stats.shelter_cents, { whole: true })} so far this year` : ''}.
      </p>
      <div style={{ marginTop: 20 }}>
        {c.shelters.length ? <ShelterList shelters={c.shelters} /> : <p className="muted">Partner shelters will be announced soon.</p>}
      </div>
      <Adoptable />
      <div className="card plain">
        <h2 style={{ fontSize: 20 }}>How the split works</h2>
        <p style={{ margin: '8px 0 0' }}>
          Vote packs are a purchase, not a donation, so they aren&rsquo;t tax-deductible.{' '}
          {split != null ? `${split}% of what readers spend on vote packs` : 'The published share of vote pack sales'} is paid to the partner
          shelters after the contest; the rest covers payment processing and supports Wausau Pilot &amp; Review, a nonprofit newsroom.
          Adoptable shelter pets entered as wildcards compete like everyone else.
        </p>
      </div>
    </div>
  )
}
