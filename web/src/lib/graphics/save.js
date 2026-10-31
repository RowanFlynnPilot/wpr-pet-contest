// Getting a finished PNG off the page: a download, or the phone's share
// sheet (which is how an image reaches Instagram from a browser).

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoking at once can cancel the download in Safari.
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

// A File the share sheet accepts, or null where files cannot be shared.
export function shareableFile(blob, name) {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return null
  try {
    const file = new File([blob], name, { type: 'image/png' })
    return navigator.canShare({ files: [file] }) ? file : null
  } catch {
    return null
  }
}

// Resolves true when shared, false when the person backed out. Throws only
// for real failures (blocked in this frame, file refused).
export async function shareFile(file, { title, text } = {}) {
  try {
    await navigator.share({ files: [file], title, text })
    return true
  } catch (err) {
    if (err?.name === 'AbortError') return false
    throw err
  }
}

export const pause = (ms) => new Promise((r) => setTimeout(r, ms))
