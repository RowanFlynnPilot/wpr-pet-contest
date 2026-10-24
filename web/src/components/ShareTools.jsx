import { useEffect, useState } from 'react'
import { APP_BASE, PUBLIC_URL } from '../lib/env.js'
import { petPublicUrl, petSharePageUrl, shareLinks, shareText } from '../lib/share.js'
import { track } from '../lib/analytics.js'
import { Chat, Facebook, LinkIcon, Mail, Share, XLogo } from './Icons.jsx'

// Share pages are built at deploy time, so a pet approved since the last build
// has none yet. Same-origin HEAD check; fall back to the plain link. The card
// share menu (CardShare) uses it too, once it is opened.
const sharePageCache = new Map()
export function useSharePage(id) {
  const [ok, setOk] = useState(() => sharePageCache.get(id) ?? null)
  useEffect(() => {
    if (sharePageCache.has(id)) return
    let alive = true
    const url = petSharePageUrl(APP_BASE, id)
    fetch(url, { method: 'HEAD', cache: 'no-store' })
      .then((r) => r.ok)
      .catch(() => false)
      .then((found) => {
        sharePageCache.set(id, found)
        if (alive) setOk(found)
      })
    return () => {
      alive = false
    }
  }, [id])
  return ok ? petSharePageUrl(APP_BASE, id) : null
}

// `extra` renders after the share buttons (the pet page's image maker).
export default function ShareTools({ entry, contestName, title = 'Share and get votes', compact = false, extra = null }) {
  const url = petPublicUrl(PUBLIC_URL, entry.id)
  const crawlerUrl = useSharePage(entry.id) || url
  const text = shareText(entry.pet_name, contestName)
  const links = shareLinks({ url, crawlerUrl, text, subject: `Vote for ${entry.pet_name}!` })
  const [copied, setCopied] = useState(false)
  const [fallback, setFallback] = useState(false)
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  const log = (network) => track('Share', { network, pet: entry.pet_name })

  async function nativeShare() {
    try {
      await navigator.share({ title: `Vote for ${entry.pet_name}`, text, url })
      log('native')
    } catch {
      // Cancelled, or blocked in this frame. Nothing to do.
    }
  }

  function copy() {
    log('copy')
    const done = () => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    }
    if (!navigator.clipboard) return setFallback(true)
    navigator.clipboard.writeText(url).then(done, () => setFallback(true))
  }

  return (
    <div className="share">
      {title && <div className="share-title">{title}</div>}
      <div className="share-buttons">
        {canNativeShare && (
          <button type="button" className="share-btn primary" onClick={nativeShare}>
            <Share /> Share
          </button>
        )}
        <a className="share-btn" href={links.facebook} target="_blank" rel="noopener noreferrer" onClick={() => log('facebook')}>
          <Facebook /> Facebook
        </a>
        {!compact && (
          <a className="share-btn" href={links.x} target="_blank" rel="noopener noreferrer" onClick={() => log('x')}>
            <XLogo /> X
          </a>
        )}
        <a className="share-btn" href={links.sms} onClick={() => log('sms')}>
          <Chat /> Text
        </a>
        {!compact && (
          <a className="share-btn" href={links.email} onClick={() => log('email')}>
            <Mail /> Email
          </a>
        )}
        <button type="button" className="share-btn" onClick={copy} aria-live="polite">
          <LinkIcon /> {copied ? 'Copied!' : 'Copy link'}
        </button>
        {extra}
      </div>
      {fallback && (
        <div className="copy-fallback">
          <label className="sr-only" htmlFor={`share-url-${entry.id}`}>
            Link to {entry.pet_name}
          </label>
          <input id={`share-url-${entry.id}`} type="text" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
        </div>
      )}
    </div>
  )
}
