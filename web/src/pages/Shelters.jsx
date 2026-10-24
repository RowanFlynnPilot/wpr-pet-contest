import { useEffect, useState } from 'react'
import { NEWSROOM } from '../config.js'
import { useContest } from '../components/ContestContext.jsx'
import { Arrow, Facebook } from '../components/Icons.jsx'
import Logo from '../components/ShelterLogo.jsx'
import { fetchFeaturedAdoptable } from '../lib/api.js'
import { fmtMoney } from '../lib/format.js'
import { useDocumentTitle } from '../lib/hooks.js'

export { shelterLogoUrl } from '../components/ShelterLogo.jsx'

// A shelter's link is often its Facebook page, which deserves the name.
export const isFacebook = (url) => /^https?:\/\/([a-z0-9-]+\.)*(facebook\.com|fb\.com)\//i.test(url || '')

export function ShelterLink({ shelter, className = 'small shelter-link' }) {
  if (!shelter.url) return null
  const fb = isFacebook(shelter.url)
  return (
    <a href={shelter.url} target="_blank" rel="noopener noreferrer" className={className}>
      {fb ? (
        <>
          <Facebook size={16} /> Follow {shelter.name} on Facebook
        </>
      ) : (
        <>
          Visit {shelter.name} <Arrow size={14} />
        </>
      )}
    </a>
  )
}

// One partner is the contest's partner: a featured card that says what each
// pack does for it. Several are listed side by side.
export function ShelterList({ shelters, split = null }) {
  if (shelters.length === 1) {
    const s = shelters[0]
    return (
      <div className="card plain shelter partner">
        <Logo shelter={s} />
        <div style={{ minWidth: 0 }}>
          <div className="shelter-name">{s.name}</div>
          <p className="shelter-note">
            {split != null ? `${split}% of every vote pack` : 'A share of every vote pack'} goes to {s.name}.
          </p>
          <ShelterLink shelter={s} className="btn btn-ghost btn-sm shelter-link" />
        </div>
      </div>
    )
  }
  return (
    <div className="shelters">
      {shelters.map((s) => (
        <div className="card plain shelter" key={s.id}>
          <Logo shelter={s} />
          <div style={{ minWidth: 0 }}>
            <div className="shelter-name">{s.name}</div>
            <ShelterLink shelter={s} />
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
          <h2 id="adopt-title" style={{ fontSize: 30 }}>
            Meet {pet.name}
          </h2>
          <p className="section-count">Looking for a home</p>
          <p style={{ margin: '8px 0 0' }}>
            {facts}
            {pet.shelterName ? `, at ${pet.shelterName}` : ''}.
            {pet.tenureDays > 30 ? ` ${pet.name} has been waiting ${pet.tenureDays} days for a family.` : ''}
          </p>
          <a className="btn btn-primary" href={pet.petUrl} target="_blank" rel="noopener noreferrer" style={{ marginTop: 12 }}>
            See {pet.name}&rsquo;s profile
          </a>
          <p className="fine">From {NEWSROOM.name}&rsquo;s daily adoptable-pet feature.</p>
        </div>
      </div>
    </section>
  )
}

export default function Shelters() {
  const c = useContest()
  useDocumentTitle(`Partner shelters — ${NEWSROOM.name}`)
  const split = c.contest?.beneficiary_split_pct
  return (
    <div className="wrap section" style={{ paddingTop: 24 }}>
      <h1 style={{ fontSize: 'clamp(30px, 6vw, 46px)' }}>{c.shelters.length === 1 ? 'Our partner shelter' : 'Our partner shelters'}</h1>
      <p className="dek">
        {split != null ? `${split}% of every vote pack` : 'A share of every vote pack'} goes to{' '}
        {c.shelters.length === 1 ? c.shelters[0].name : 'these local animal shelters'}
        {c.stats ? `: ${fmtMoney(c.stats.shelter_cents, { whole: true })} so far this year` : ''}.
      </p>
      <div style={{ marginTop: 20 }}>
        {c.shelters.length ? <ShelterList shelters={c.shelters} split={split} /> : <p className="muted">Partner shelters will be announced soon.</p>}
      </div>
      <Adoptable />
      <div className="card plain">
        <h2 style={{ fontSize: 20 }}>How the split works</h2>
        <p style={{ margin: '8px 0 0' }}>
          Vote packs are a purchase, not a donation, so they aren&rsquo;t tax-deductible.{' '}
          {split != null ? `${split}% of what readers spend on vote packs` : 'The published share of vote pack sales'} is paid to the partner
          shelters after the contest; the rest covers payment processing and supports {NEWSROOM.name}
          {NEWSROOM.nonprofit ? ', a nonprofit newsroom' : ''}.
          Adoptable shelter pets entered as wildcards compete like everyone else.
        </p>
      </div>
    </div>
  )
}
