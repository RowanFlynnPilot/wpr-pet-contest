import { useState } from 'react'
import { fromLocalInput, stamp, toLocalInput } from '../lib/datetime.js'
import { fmtMoney } from '../lib/format.js'
import { formatPerVote } from '../lib/packs.js'
import { admin, q, view } from './adminClient.js'
import { ErrorNote, useAsync, useDesk } from './shared.jsx'

const toCents = (dollars) => Math.round(Number(String(dollars).replace(/[$,]/g, '')) * 100)
const toDollars = (cents) => (cents / 100).toFixed(2)

function PackRow({ pack, sold, onSaved, onError }) {
  const [d, setD] = useState({ ...pack, price: toDollars(pack.cents) })
  const [busy, setBusy] = useState(false)
  const dirty =
    d.label !== pack.label || Number(d.votes) !== pack.votes || toCents(d.price) !== pack.cents || Number(d.sort) !== pack.sort || d.featured !== pack.featured || d.active !== pack.active

  async function save(patch = {}) {
    setBusy(true)
    try {
      const row = { label: d.label.trim(), votes: Number(d.votes), cents: toCents(d.price), sort: Number(d.sort), featured: d.featured, active: d.active, ...patch }
      await q(admin.from('vote_packs').update(row).eq('id', pack.id))
      onSaved()
    } catch (e) {
      onError(e)
    } finally {
      setBusy(false)
    }
  }
  async function remove() {
    if (!window.confirm(`Delete the ${pack.label} pack? It has never sold.`)) return
    setBusy(true)
    try {
      await q(admin.from('vote_packs').delete().eq('id', pack.id))
      onSaved()
    } catch (e) {
      onError(e)
    } finally {
      setBusy(false)
    }
  }
  const preview = Number(d.votes) > 0 && toCents(d.price) > 0 ? formatPerVote({ votes: Number(d.votes), cents: toCents(d.price) }) : ''
  return (
    <tr className={pack.active ? undefined : 'retired'}>
      <td>
        <code>{pack.slug}</code>
      </td>
      <td>
        <input type="text" aria-label="Label" value={d.label} onChange={(e) => setD({ ...d, label: e.target.value })} />
      </td>
      <td>
        <input type="number" min="1" aria-label="Votes" value={d.votes} onChange={(e) => setD({ ...d, votes: e.target.value })} style={{ width: 90 }} />
      </td>
      <td>
        <input type="text" inputMode="decimal" aria-label="Price in dollars" value={d.price} onChange={(e) => setD({ ...d, price: e.target.value })} style={{ width: 90 }} />
        <div className="small muted">{preview}</div>
      </td>
      <td>
        <input type="number" aria-label="Sort" value={d.sort} onChange={(e) => setD({ ...d, sort: e.target.value })} style={{ width: 70 }} />
      </td>
      <td>
        <input type="checkbox" aria-label="Featured (Most popular)" checked={d.featured} onChange={(e) => setD({ ...d, featured: e.target.checked })} />
      </td>
      <td>
        <input type="checkbox" aria-label="Active" checked={d.active} onChange={(e) => setD({ ...d, active: e.target.checked })} />
      </td>
      <td className="small">{sold ? `${sold.purchases} sold` : '—'}</td>
      <td>
        <div className="tool-row">
          <button type="button" className="btn btn-primary btn-sm" disabled={!dirty || busy} onClick={() => save()}>
            Save
          </button>
          {!sold && (
            <button type="button" className="link-btn small" onClick={remove} disabled={busy}>
              Delete
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

function AddPack({ cid, onSaved, onError }) {
  const [d, setD] = useState({ slug: '', label: '', votes: '', price: '', sort: '' })
  async function add(e) {
    e.preventDefault()
    try {
      await q(
        admin.from('vote_packs').insert({
          contest_id: cid,
          slug: d.slug.trim().toLowerCase(),
          label: d.label.trim(),
          votes: Number(d.votes),
          cents: toCents(d.price),
          sort: Number(d.sort) || 0,
        }),
      )
      setD({ slug: '', label: '', votes: '', price: '', sort: '' })
      onSaved()
    } catch (x) {
      onError(x)
    }
  }
  return (
    <form className="add-row" onSubmit={add}>
      <input type="text" placeholder="slug (a-z, 0-9, -)" aria-label="New pack slug" value={d.slug} onChange={(e) => setD({ ...d, slug: e.target.value })} pattern="[a-z0-9-]{1,32}" required />
      <input type="text" placeholder="Label" aria-label="New pack label" value={d.label} onChange={(e) => setD({ ...d, label: e.target.value })} required />
      <input type="number" placeholder="Votes" aria-label="New pack votes" min="1" value={d.votes} onChange={(e) => setD({ ...d, votes: e.target.value })} required />
      <input type="text" placeholder="Price $" aria-label="New pack price" inputMode="decimal" value={d.price} onChange={(e) => setD({ ...d, price: e.target.value })} required />
      <input type="number" placeholder="Sort" aria-label="New pack sort" value={d.sort} onChange={(e) => setD({ ...d, sort: e.target.value })} />
      <button type="submit" className="btn btn-primary btn-sm">
        Add pack
      </button>
    </form>
  )
}

const blankWindow = { starts: '', ends: '', multiplier: 2, label: 'Double Votes', sponsor_name: '', sponsor_url: '' }

function WindowForm({ initial, onSubmit, onDelete, submitLabel }) {
  const [d, setD] = useState(initial)
  return (
    <form
      className="window-form"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(d, () => setD(blankWindow))
      }}
    >
      <label>
        <span className="label">Starts</span>
        <input type="datetime-local" value={d.starts} onChange={(e) => setD({ ...d, starts: e.target.value })} required />
      </label>
      <label>
        <span className="label">Ends</span>
        <input type="datetime-local" value={d.ends} onChange={(e) => setD({ ...d, ends: e.target.value })} required />
      </label>
      <label>
        <span className="label">Multiplier</span>
        <select value={d.multiplier} onChange={(e) => setD({ ...d, multiplier: Number(e.target.value) })}>
          {[2, 3, 4, 5].map((m) => (
            <option key={m} value={m}>
              ×{m}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="label">Label</span>
        <input type="text" value={d.label} onChange={(e) => setD({ ...d, label: e.target.value })} required />
      </label>
      <label>
        <span className="label">Sponsor</span>
        <input type="text" value={d.sponsor_name} onChange={(e) => setD({ ...d, sponsor_name: e.target.value })} placeholder="optional" />
      </label>
      <label>
        <span className="label">Sponsor link</span>
        <input type="text" inputMode="url" value={d.sponsor_url} onChange={(e) => setD({ ...d, sponsor_url: e.target.value })} placeholder="https://" />
      </label>
      <div className="tool-row" style={{ alignSelf: 'end' }}>
        <button type="submit" className="btn btn-primary btn-sm">
          {submitLabel}
        </button>
        {onDelete && (
          <button type="button" className="link-btn small" onClick={onDelete}>
            Delete
          </button>
        )}
      </div>
    </form>
  )
}

export default function Packs() {
  const { contest, say } = useDesk()
  const cid = contest.id
  const packs = useAsync(() => q(admin.from('vote_packs').select('*').eq('contest_id', cid).order('sort')), [cid])
  const sales = useAsync(async () => (await view(admin.from('pack_revenue').select('*').eq('contest_id', cid))).rows, [cid])
  const windows = useAsync(() => q(admin.from('bonus_windows').select('*').eq('contest_id', cid).order('starts_at')), [cid])
  const [error, setError] = useState(null)
  const soldBy = new Map((sales.data || []).map((r) => [r.pack_slug, r]))

  const windowRow = (d) => ({
    starts_at: fromLocalInput(d.starts),
    ends_at: fromLocalInput(d.ends),
    multiplier: d.multiplier,
    label: d.label.trim(),
    sponsor_name: d.sponsor_name.trim() || null,
    sponsor_url: d.sponsor_url.trim() || null,
  })

  async function saveWindow(id, d, reset) {
    setError(null)
    try {
      if (id) await q(admin.from('bonus_windows').update(windowRow(d)).eq('id', id))
      else await q(admin.from('bonus_windows').insert({ contest_id: cid, ...windowRow(d) }))
      say('Bonus window saved.')
      if (!id) reset()
      windows.reload()
    } catch (e) {
      setError(/bonus_windows_no_overlap/.test(e.message) ? new Error('That window overlaps another one. Bonus windows cannot overlap.') : e)
    }
  }

  async function deleteWindow(w) {
    if (!window.confirm(`Delete "${w.label}" (${stamp(w.starts_at)})?`)) return
    try {
      await q(admin.from('bonus_windows').delete().eq('id', w.id))
      windows.reload()
    } catch (e) {
      setError(e)
    }
  }

  const afterSave = () => {
    say('Saved.')
    packs.reload()
    sales.reload()
  }

  return (
    <div className="stack">
      <ErrorNote error={error || packs.error || windows.error} />
      <section className="card plain">
        <h3>Vote packs</h3>
        <p className="small">
          Checkout charges exactly what this table says; the browser never sends a price. <strong>Featured</strong> shows as &ldquo;Most
          popular.&rdquo; Retire a pack by unchecking <strong>Active</strong>; packs that have sold can&rsquo;t be deleted. The public picker lists
          the biggest pack first.
        </p>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Slug</th>
                <th scope="col">Label</th>
                <th scope="col">Votes</th>
                <th scope="col">Price</th>
                <th scope="col">Sort</th>
                <th scope="col">Featured</th>
                <th scope="col">Active</th>
                <th scope="col">Sales</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {(packs.data || []).map((p) => (
                <PackRow key={`${p.id}-${p.cents}-${p.votes}-${p.label}-${p.active}-${p.featured}-${p.sort}`} pack={p} sold={soldBy.get(p.slug)} onSaved={afterSave} onError={setError} />
              ))}
            </tbody>
          </table>
        </div>
        <AddPack cid={cid} onSaved={afterSave} onError={setError} />
        {packs.data?.length > 0 && (
          <p className="small muted">
            Ladder: {[...packs.data].filter((p) => p.active).sort((a, b) => a.cents - b.cents).map((p) => `${p.votes} for ${fmtMoney(p.cents)}`).join(' · ')}
          </p>
        )}
      </section>

      <section className="card plain">
        <h3>Bonus windows</h3>
        <p className="small">
          Every pack bought while a window is live counts ×N. The multiplier locks when checkout <em>begins</em>, which is what the rules
          promise. Windows cannot overlap. Times are your local time.
        </p>
        <div className="stack">
          {(windows.data || []).map((w) => (
            <div key={`${w.id}-${w.starts_at}-${w.ends_at}-${w.multiplier}-${w.label}`} className="window-item">
              <div className="small muted">
                {stamp(w.starts_at)} → {stamp(w.ends_at)}
                {new Date(w.starts_at) <= new Date() && new Date() < new Date(w.ends_at) && <strong className="good"> · LIVE NOW</strong>}
              </div>
              <WindowForm
                submitLabel="Save"
                initial={{
                  starts: toLocalInput(w.starts_at),
                  ends: toLocalInput(w.ends_at),
                  multiplier: w.multiplier,
                  label: w.label,
                  sponsor_name: w.sponsor_name || '',
                  sponsor_url: w.sponsor_url || '',
                }}
                onSubmit={(d) => saveWindow(w.id, d)}
                onDelete={() => deleteWindow(w)}
              />
            </div>
          ))}
          <div className="window-item new">
            <div className="small" style={{ fontWeight: 700 }}>
              Add a window
            </div>
            <WindowForm submitLabel="Add window" initial={blankWindow} onSubmit={(d, reset) => saveWindow(null, d, reset)} />
          </div>
        </div>
      </section>
    </div>
  )
}
