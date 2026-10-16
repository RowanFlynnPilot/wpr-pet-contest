import qrcode from 'qrcode-generator'

// A QR code drawn straight into the canvas, modules snapped to whole pixels
// so a printer never sees hairline seams. `quiet` is the margin in modules
// (the spec asks for 4). Medium error correction survives a creased flyer.
export function drawQr(ctx, text, x, y, size, { dark = '#1a1a1a', light = '#ffffff', quiet = 4 } = {}) {
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  const n = qr.getModuleCount()
  const cell = size / (n + quiet * 2)
  const at = (i) => Math.round((i + quiet) * cell)
  ctx.fillStyle = light
  ctx.fillRect(x, y, size, size)
  ctx.fillStyle = dark
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) ctx.fillRect(x + at(c), y + at(r), at(c + 1) - at(c), at(r + 1) - at(r))
    }
  }
  return n
}
