// RFC 4180: every field quoted, inner quotes doubled, CRLF rows. A leading
// =, +, - or @ is prefixed with an apostrophe so a spreadsheet opens a hostile
// "email" as text instead of running it as a formula.
export function toCsv(rows, keys = rows.length ? Object.keys(rows[0]) : []) {
  const cell = (value) => {
    let s = value == null ? '' : Array.isArray(value) ? value.join('; ') : String(value)
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
    return `"${s.replace(/"/g, '""')}"`
  }
  return [keys.map(cell).join(','), ...rows.map((row) => keys.map((k) => cell(row[k])).join(','))].join('\r\n')
}

export function downloadCsv(filename, csv) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
