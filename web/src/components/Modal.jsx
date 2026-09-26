import { useEffect, useRef } from 'react'
import { EMBEDDED } from '../lib/env.js'
import { postHeight, postNav } from '../lib/embed.js'
import { Close } from './Icons.jsx'

const FOCUSABLE =
  'a[href], button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), iframe, [tabindex]:not([tabindex="-1"])'

// Accessible dialog: focus moves in on open and back to the opener on close,
// Tab cycles inside, Escape closes, the page behind stops scrolling.
// Embedded in WordPress it takes over the iframe instead of floating over it
// (see .takeover in app.css for why).
export default function Modal({ label, onClose, children, head }) {
  const ref = useRef(null)
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })

  useEffect(() => {
    const dialog = ref.current
    const opener = document.activeElement
    const openerY = opener?.getBoundingClientRect?.().top + window.scrollY
    if (EMBEDDED) {
      document.body.classList.add('takeover')
      window.scrollTo(0, 0)
      postNav()
      postHeight()
    } else {
      document.body.style.overflow = 'hidden'
    }
    dialog.focus({ preventScroll: true })

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeRef.current?.()
        return
      }
      if (e.key !== 'Tab') return
      const list = [...dialog.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null || el.tagName === 'IFRAME')
      if (!list.length) return
      const first = list[0]
      const last = list[list.length - 1]
      if (!dialog.contains(document.activeElement)) {
        e.preventDefault()
        first.focus()
      } else if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)

    return () => {
      document.removeEventListener('keydown', onKey)
      if (EMBEDDED) {
        document.body.classList.remove('takeover')
        postHeight()
        // Put the reader back where they were on the page.
        requestAnimationFrame(() => {
          if (opener?.isConnected) opener.scrollIntoView({ block: 'center' })
          else if (Number.isFinite(openerY)) window.scrollTo(0, openerY)
        })
      } else {
        document.body.style.overflow = ''
      }
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true })
    }
  }, [])

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div ref={ref} className="modal" role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
          <Close />
        </button>
        {head}
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}
