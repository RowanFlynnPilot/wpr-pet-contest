import { useEffect, useState } from 'react'
import { APP_BASE, PUBLIC_URL } from '../lib/env.js'
import { petPublicUrl, shareLinks, sharePageUrl, shareText } from '../lib/share.js'
import { track } from '../lib/analytics.js'
import { Chat, Facebook, LinkIcon, Mail, Share, XLogo } from './Icons.jsx'

// Share pages are built at deploy time, so a pet approved since the last build
// has none yet. Same-origin HEAD check; fall back to the plain link. The card
// share menu (CardShare) uses it too, once it is opened. `path` is the page's
// path under the app: a pet's own page or a matchup's.
const sharePageCache = new Map()
export function useSharePage(path) {
  const [ok, setOk] = useState(() => (path ? (sharePageCache.get(path) ?? null) : null))
  useEffect(() => {
    if (!path || sharePageCache.has(path)) return
    let alive = true
    fetch(sharePageUrl(APP_BASE, path), { method: 'HEAD', cache: 'no-store' })
      .then((r) => r.ok)
      .catch(() => false)
      .then((found) => {
        sharePageCache.set(path, found)
        if (alive) setOk(found)
      })
    return () => {
      alive = false
    }
  }, [path])
  return path && (ok ?? sharePageCache.get(path)) ? sharePageUrl(APP_BASE, path) : null
}

// `extra` renders after the share buttons (the pet page's image maker).
// `sharePage` names a page for the crawlers other than the pet's own (a
// matchup card while a bracket round is live).
export default function ShareTools({ entry, contestName, title = 'Share and get votes', compact = false, extra = null, before = null, sharePage = null }) {
  const url = petPublicUrl(PUBLIC_URL, entry.id)
  const matchupPage = useSharePage(sharePage)
  const petPage = useSharePage(`p/${entry.id}/`)
  const crawlerUrl = matchupPage || petPage || url
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
      {before}
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
