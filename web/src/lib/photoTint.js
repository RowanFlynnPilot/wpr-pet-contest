import { useEffect, useState } from 'react'

// The color a pet's own photo gives its page: the photo's average, pulled
// down to a deep ground that white type reads on. The teal arena stays the
// fallback, so a photo that will not load (or a bucket without CORS) changes
// nothing. One small copy of the photo is read, never the one on screen.
const cache = new Map() // src -> tint | null

function toHsl(r, g, b) {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return [h * 60, s, l]
}

function hslToRgb(h, s, l) {
  const k = (n) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255))
}

// Average the photo's color, then set it as a ground: the hue stays, the
// saturation is held in a middle band and the lightness pinned low enough
// for white at any size (about 9:1 against pure white).
export function tintFrom(pixels) {
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 200) continue
    r += pixels[i]
    g += pixels[i + 1]
    b += pixels[i + 2]
    n++
  }
  if (!n) return null
  const [h, s] = toHsl(r / n, g / n, b / n)
  const sat = Math.min(0.52, Math.max(0.24, s))
  const ground = hslToRgb(h, sat, 0.2)
  const glow = hslToRgb(h, sat, 0.3)
  return { ground: `rgb(${ground.join(' ')})`, glow: `rgb(${glow.join(' ')})`, rgb: ground }
}

function read(src) {
  if (cache.has(src)) return Promise.resolve(cache.get(src))
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    const done = (tint) => {
      cache.set(src, tint)
      resolve(tint)
    }
    img.onload = () => {
      try {
        const size = 24
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        ctx.drawImage(img, 0, 0, size, size)
        done(tintFrom(ctx.getImageData(0, 0, size, size).data))
      } catch {
        done(null) // a tainted canvas: no CORS on this bucket
      }
    }
    img.onerror = () => done(null)
    img.src = src
  })
}

export function usePhotoTint(src) {
  const [tint, setTint] = useState(() => (src ? (cache.get(src) ?? null) : null))
  useEffect(() => {
    if (!src || typeof document === 'undefined') return undefined
    let alive = true
    read(src).then((t) => {
      if (alive) setTint(t)
    })
    return () => {
      alive = false
    }
  }, [src])
  return tint
}

// The CSS custom properties a tinted surface reads, as a style object.
export function tintStyle(tint) {
  if (!tint) return undefined
  const [r, g, b] = tint.rgb
  return {
    '--tint': tint.ground,
    '--tint-glow': tint.glow,
    '--tint-0': `rgba(${r}, ${g}, ${b}, 0)`,
    '--tint-55': `rgba(${r}, ${g}, ${b}, 0.55)`,
    '--tint-90': `rgba(${r}, ${g}, ${b}, 0.9)`,
  }
}
