import { useEffect, useId, useRef, useState } from 'react'
import { PUBLIC_URL } from '../lib/env.js'
import { petPublicUrl, shareLinks, shareText } from '../lib/share.js'
import { track } from '../lib/analytics.js'
import { useContest } from './ContestContext.jsx'
import { useSharePage } from './ShareTools.jsx'
import { Chat, Check, Facebook, LinkIcon, Share, XLogo } from './Icons.jsx'

const canNativeShare = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function'

// The choices, once opened. Same url, text and links as ShareTools.
function ShareMenu({ id, open, entry, url, text, log, onDone }) {
  const crawlerUrl = useSharePage(`p/${entry.id}/`) || url
  const links = shareLinks({ url, crawlerUrl, text, subject: `Vote for ${entry.pet_name}!` })
  const list = useRef(null)
  const input = useRef(null)
  const [manual, setManual] = useState(false)

  // Opening puts focus on the first choice.
  useEffect(() => {
    if (open) list.current?.querySelector('a, button')?.focus()
  }, [open])
  useEffect(() => {
    if (manual) input.current?.select()
  }, [manual])

  function arrows(e) {
    const items = [...list.current.querySelectorAll('a, button')]
    const i = items.indexOf(document.activeElement)
    const next = { ArrowDown: items[(i + 1) % items.length], ArrowUp: items[(i - 1 + items.length) % items.length], Home: items[0], End: items.at(-1) }[e.key]
    if (next) {
      e.preventDefault()
      next.focus()
    }
  }

  const pick = (network) => {
    log(network)
    onDone()
  }

  async function copy() {
    log('copy')
    try {
      await navigator.clipboard.writeText(url)
      onDone(true)
    } catch {
      // No clipboard in this frame: show the link to copy by hand.
      setManual(true)
    }
  }

  return (
    <div id={id} className="share-pop" hidden={!open}>
      <ul ref={list} aria-label={`Share ${entry.pet_name}`} onKeyDown={arrows}>
        <li>
          <a href={links.facebook} target="_blank" rel="noopener noreferrer" onClick={() => pick('facebook')}>
            <Facebook /> Facebook
          </a>
        </li>
        <li>
          <a href={links.x} target="_blank" rel="noopener noreferrer" onClick={() => pick('x')}>
            <XLogo /> X
          </a>
        </li>
        <li>
          <a href={links.sms} onClick={() => pick('sms')}>
            <Chat /> Text
          </a>
        </li>
        <li>
          <button type="button" onClick={copy}>
            <LinkIcon /> Copy link
          </button>
        </li>
      </ul>
      {manual && (
        <>
          <label className="sr-only" htmlFor={`${id}-url`}>
            Link to {entry.pet_name}
          </label>
          <input id={`${id}-url`} ref={input} type="text" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
        </>
      )}
    </div>
  )
}

// The pet card's quiet share button: the phone's own share sheet where there
// is one, otherwise a small menu of the links ShareTools offers.
export default function CardShare({ entry }) {
  const contestName = useContest()?.contest?.name
  const [native, setNative] = useState(canNativeShare)
  const [open, setOpen] = useState(false)
  // Once opened the menu stays in the page, hidden, so a link still opens its
  // tab as the menu closes under it.
  const [mounted, setMounted] = useState(false)
  const [copied, setCopied] = useState(false)
  const wrap = useRef(null)
  const button = useRef(null)
  const id = useId()
  const name = entry.pet_name
  const url = petPublicUrl(PUBLIC_URL, entry.id)
  const text = shareText(name, contestName)
  const log = (network) => track('Share', { network, pet: name, from: 'card' })

  function show(next) {
    if (next) setMounted(true)
    setOpen(next)
  }

  function done(copiedNow) {
    setOpen(false)
    button.current?.focus()
    if (copiedNow) setCopied(true)
  }

  async function onClick() {
    if (!native) return show(!open)
    try {
      await navigator.share({ title: `Vote for ${name}`, text, url })
      log('native')
    } catch (err) {
      // Cancelled: nothing to do. Blocked in this frame: offer the menu.
      if (err?.name !== 'AbortError') {
        setNative(false)
        show(true)
      }
    }
  }

  // A press anywhere else closes it.
  useEffect(() => {
    if (!open) return
    const away = (e) => {
      if (!wrap.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [open])

  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 2500)
    return () => clearTimeout(t)
  }, [copied])

  function onKeyDown(e) {
    if (e.key === 'Escape' && open) {
      e.preventDefault()
      done()
    }
  }

  // Tabbing out of the menu closes it.
  function onBlur(e) {
    if (open && e.relatedTarget && !wrap.current?.contains(e.relatedTarget)) setOpen(false)
  }

  return (
    <div className="card-share" ref={wrap} onKeyDown={onKeyDown} onBlur={onBlur}>
      <button
        ref={button}
        type="button"
        className={`icon-btn${copied ? ' done' : ''}`}
        aria-label={`Share ${name}`}
        aria-expanded={native ? undefined : open}
        aria-controls={!native && mounted ? id : undefined}
        onClick={onClick}
      >
        {copied ? <Check size={18} /> : <Share size={18} />}
      </button>
      <span className="sr-only" aria-live="polite">
        {copied ? `Link to ${name} copied` : ''}
      </span>
      {mounted && <ShareMenu id={id} open={open} entry={entry} url={url} text={text} log={log} onDone={done} />}
    </div>
  )
}
