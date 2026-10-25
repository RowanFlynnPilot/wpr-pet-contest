import { useRef, useState } from 'react'
import Modal from './Modal.jsx'
import { entryPhotoUrl } from '../lib/photos.js'
import { tintStyle } from '../lib/photoTint.js'

// The pet's photo, whole and as big as the screen allows, on the color of the
// photo itself. A tap on the hero opens it; Escape, the close button, a tap
// beside the photo or a pull down on a phone closes it. Pinch still zooms.
export default function PhotoLightbox({ entry, tint, onClose }) {
  const [dy, setDy] = useState(0)
  const start = useRef(null)
  const label = `${entry.pet_name}${entry.town ? `, from ${entry.town}` : ''}`

  const onDown = (e) => {
    if (e.pointerType === 'mouse' || e.isPrimary === false) return
    start.current = e.clientY
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const onMove = (e) => {
    if (start.current == null) return
    setDy(Math.max(0, e.clientY - start.current))
  }
  const onUp = () => {
    if (start.current == null) return
    const far = dy > 90
    start.current = null
    setDy(0)
    if (far) onClose()
  }

  return (
    <Modal label={`${entry.pet_name}'s photo`} onClose={onClose} className="lightbox">
      <figure
        className="lightbox-figure"
        style={{ ...tintStyle(tint), transform: dy ? `translateY(${dy}px)` : undefined, opacity: dy ? Math.max(0.4, 1 - dy / 400) : undefined }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose()
        }}
      >
        <img src={entryPhotoUrl(entry, { width: 2048 })} alt={label} decoding="async" draggable="false" />
        <figcaption>{label}</figcaption>
      </figure>
    </Modal>
  )
}
