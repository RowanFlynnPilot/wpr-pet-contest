import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

export const DeskContext = createContext(null)
export const useDesk = () => useContext(DeskContext)

// Load-and-reload for admin panels. `deps` are serialized into a key; a new
// key refetches. `reload` keeps the old data on screen while it works.
export function useAsync(run, deps) {
  const key = JSON.stringify(deps)
  const runRef = useRef(run)
  useEffect(() => {
    runRef.current = run
  })
  const [state, setState] = useState({ key: null, data: null, error: null })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    Promise.resolve()
      .then(() => runRef.current())
      .then(
        (data) => alive && setState({ key, data, error: null }),
        (error) => alive && setState({ key, data: null, error }),
      )
    return () => {
      alive = false
    }
  }, [key])

  const reload = useCallback(async () => {
    setBusy(true)
    try {
      const data = await runRef.current()
      setState((s) => ({ ...s, data, error: null }))
    } catch (error) {
      setState((s) => ({ ...s, error }))
    } finally {
      setBusy(false)
    }
  }, [])

  const fresh = state.key === key
  return { data: fresh ? state.data : null, error: fresh ? state.error : null, loading: !fresh || busy, reload }
}

export function Stat({ label, value, tone, sub }) {
  return (
    <div className={`stat${tone ? ` ${tone}` : ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}

export function ErrorNote({ error }) {
  if (!error) return null
  return (
    <div className="notice error" role="alert">
      <span>{String(error.message || error)}</span>
    </div>
  )
}

// Irreversible actions ask for a typed word, not a click.
export function TypedConfirm({ word, title, children, busy, onConfirm, onCancel, danger = true }) {
  const [typed, setTyped] = useState('')
  const ok = typed.trim().toUpperCase() === word
  return (
    <div className="confirm" role="dialog" aria-modal="false" aria-label={title}>
      <h3>{title}</h3>
      <div className="confirm-body">{children}</div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (ok && !busy) onConfirm()
        }}
      >
        <label className="field" style={{ marginBottom: 10 }}>
          <span className="label">
            Type <b className="mono">{word}</b> to confirm
          </span>
          <input type="text" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus autoComplete="off" spellCheck={false} />
        </label>
        <div className="tool-row">
          <button type="submit" className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} disabled={!ok || busy}>
            {busy ? 'Working…' : title}
          </button>
          <button type="button" className="btn btn-quiet" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

export function Table({ columns, rows, empty = 'Nothing here.', rowKey }) {
  if (!rows?.length) return <p className="muted small">{empty}</p>
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={c.num ? 'num' : undefined}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={rowKey ? rowKey(r) : i}>
              {columns.map((c) => (
                <td key={c.key} className={c.num ? 'num' : undefined}>
                  {c.render ? c.render(r) : r[c.key] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
