import { useState } from 'react'
import { SPONSOR_INQUIRY, SPONSOR_SLOTS, SPONSOR_UTM } from '../config.js'
import { track } from '../lib/analytics.js'

export function withUtm(url) {
  if (!url) return url
  return url.includes('utm_source=') ? url : `${url}${url.includes('?') ? '&' : '?'}${SPONSOR_UTM}`
}

// A mailto does nothing on a desk with no mail handler, and the prospect
// decides the link is broken. So every inquiry click also copies the address.
export function useInquiry(slot) {
  const [copied, setCopied] = useState(false)
  const onClick = () => {
    track('Sponsor Inquiry', { slot })
    try {
      navigator.clipboard
        ?.writeText(SPONSOR_INQUIRY)
        .then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 4000)
        })
        .catch(() => {})
    } catch {
      // No clipboard in this frame; the mailto still does its best.
    }
  }
  return { onClick, copied }
}

export const inquiryHref = (subject) => `mailto:${SPONSOR_INQUIRY}?subject=${encodeURIComponent(subject)}`

export function Upsell({ slot, dark = false, pitch, full = false }) {
  const { onClick, copied } = useInquiry(slot)
  const info = SPONSOR_SLOTS[slot] || {}
  return (
    <div className={`upsell${dark ? ' dark' : ''}${full ? ' full' : ''}`}>
      <div className="eyebrow">Sponsorship available</div>
      <p className="pitch">{pitch || info.pitch || 'Put your business in front of every pet lover in Marathon County.'}</p>
      <a
        className={`btn btn-sm ${dark ? 'btn-sun' : 'btn-primary'}`}
        href={inquiryHref(`Pet contest sponsorship — ${info.name || slot}`)}
        onClick={onClick}
      >
        {copied ? '✓ Address copied' : <>Book this placement <span aria-hidden="true">→</span></>}
      </a>
      <div className="addr">{SPONSOR_INQUIRY}</div>
    </div>
  )
}

// A sold slot renders the lockup; an open one renders the upsell, unless the
// placement asks to stay quiet when empty (`quiet`).
export default function Sponsor({ sponsor, slot, full = false, dark = false, quiet = false, eyebrow = 'Presented by' }) {
  const [logoFailed, setLogoFailed] = useState(false)
  if (!sponsor) return quiet ? null : <Upsell slot={slot} dark={dark} full={full} />

  const [what, where] = (sponsor.tagline || '').split('—').map((s) => s.trim())
  const Tag = sponsor.url ? 'a' : 'div'
  const linkProps = sponsor.url
    ? {
        href: withUtm(sponsor.url),
        target: '_blank',
        rel: 'noopener noreferrer sponsored',
        onClick: () => track('Sponsor Click', { sponsor: sponsor.name, slot }),
      }
    : {}

  return (
    <Tag className={`sponsor-card${full ? ' full' : ''}`} {...linkProps}>
      <span className="sponsor-eyebrow">{sponsor.demo ? `${eyebrow} · preview` : eyebrow}</span>
      {sponsor.logo && !logoFailed ? (
        <img src={sponsor.logo} alt={sponsor.name} onError={() => setLogoFailed(true)} />
      ) : (
        <span className="sponsor-name">{sponsor.name}</span>
      )}
      {sponsor.tagline && (
        <span className="sponsor-tag">
          <b>{what}</b>
          {where}
        </span>
      )}
      {sponsor.url && (
        <span className="sponsor-go">
          Visit <span aria-hidden="true">→</span>
        </span>
      )}
    </Tag>
  )
}
