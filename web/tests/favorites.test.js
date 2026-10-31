import { describe, expect, it, vi } from 'vitest'
import { createFavorites, favoritesKey } from '../src/lib/favorites.js'

const C1 = 'c1000000-0000-0000-0000-000000000001'
const C2 = 'c1000000-0000-0000-0000-000000000002'

function memoryStorage() {
  const m = new Map()
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    map: m,
  }
}

// What a partitioned or blocked frame does: every call throws.
const blocked = {
  getItem() {
    throw new DOMException('The operation is insecure.', 'SecurityError')
  },
  setItem() {
    throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
  },
  removeItem() {
    throw new DOMException('The operation is insecure.', 'SecurityError')
  },
}

function storageEvent(key, newValue, storageArea) {
  return Object.assign(new Event('storage'), { key, newValue, storageArea })
}

describe('favorites', () => {
  it('toggles a pet on and off, per contest', () => {
    const fav = createFavorites({ storage: memoryStorage(), events: null })
    expect(fav.toggle(C1, 'a')).toBe(true)
    expect(fav.toggle(C1, 'b')).toBe(true)
    expect(fav.list(C1)).toEqual(['a', 'b'])
    expect(fav.has(C1, 'a')).toBe(true)
    expect(fav.has(C2, 'a')).toBe(false)
    expect(fav.toggle(C1, 'a')).toBe(false)
    expect(fav.list(C1)).toEqual(['b'])
  })

  it('ignores a toggle with no contest or no pet', () => {
    const fav = createFavorites({ storage: memoryStorage(), events: null })
    expect(fav.toggle(null, 'a')).toBe(false)
    expect(fav.toggle(C1, '')).toBe(false)
    expect(fav.list(null)).toEqual([])
    expect(fav.list(C1)).toEqual([])
  })

  it('keeps the same list object until it changes', () => {
    const fav = createFavorites({ storage: memoryStorage(), events: null })
    const before = fav.list(C1)
    expect(fav.list(C1)).toBe(before)
    fav.toggle(C1, 'a')
    const after = fav.list(C1)
    expect(after).not.toBe(before)
    expect(fav.list(C1)).toBe(after)
  })

  it('persists under a per-contest key, and a new visit reads it back', () => {
    const storage = memoryStorage()
    const first = createFavorites({ storage, events: null })
    first.toggle(C1, 'a')
    first.toggle(C1, 'b')
    first.toggle(C2, 'z')
    expect(JSON.parse(storage.getItem(favoritesKey(C1)))).toEqual(['a', 'b'])
    expect(favoritesKey(C1)).toBe(`wpr-pet-favorites:${C1}`)

    const later = createFavorites({ storage, events: null })
    expect(later.list(C1)).toEqual(['a', 'b'])
    expect(later.list(C2)).toEqual(['z'])
  })

  it('removes the key when the last favorite goes', () => {
    const storage = memoryStorage()
    const fav = createFavorites({ storage, events: null })
    fav.toggle(C1, 'a')
    fav.toggle(C1, 'a')
    expect(storage.map.has(favoritesKey(C1))).toBe(false)
  })

  it('reads a damaged slot as empty, and drops anything that is not an id', () => {
    const storage = memoryStorage()
    storage.setItem(favoritesKey(C1), '{not json')
    storage.setItem(favoritesKey(C2), JSON.stringify(['a', 7, null, 'a', '', 'b']))
    const fav = createFavorites({ storage, events: null })
    expect(fav.list(C1)).toEqual([])
    expect(fav.list(C2)).toEqual(['a', 'b'])
  })

  it('works in memory when storage throws', () => {
    const fav = createFavorites({ storage: blocked, events: null })
    const seen = vi.fn()
    fav.subscribe(seen)
    expect(fav.list(C1)).toEqual([])
    expect(fav.toggle(C1, 'a')).toBe(true)
    expect(fav.has(C1, 'a')).toBe(true)
    expect(seen).toHaveBeenCalledTimes(1)
    expect(fav.toggle(C1, 'a')).toBe(false)
    expect(fav.list(C1)).toEqual([])
  })

  it('works in memory with no storage at all', () => {
    const fav = createFavorites({ storage: null, events: null })
    fav.toggle(C1, 'a')
    expect(fav.list(C1)).toEqual(['a'])
  })

  it('tells subscribers about each change, until they leave', () => {
    const fav = createFavorites({ storage: memoryStorage(), events: null })
    const seen = vi.fn()
    const leave = fav.subscribe(seen)
    fav.toggle(C1, 'a')
    fav.toggle(C1, 'b')
    expect(seen).toHaveBeenCalledTimes(2)
    leave()
    fav.toggle(C1, 'c')
    expect(seen).toHaveBeenCalledTimes(2)
  })

  it('follows another tab through the storage event', () => {
    const storage = memoryStorage()
    const events = new EventTarget()
    const fav = createFavorites({ storage, events })
    const seen = vi.fn()
    fav.subscribe(seen)
    expect(fav.list(C1)).toEqual([])

    // The other tab writes storage, then this tab hears about it.
    storage.setItem(favoritesKey(C1), JSON.stringify(['a', 'b']))
    events.dispatchEvent(storageEvent(favoritesKey(C1), JSON.stringify(['a', 'b']), storage))
    expect(fav.list(C1)).toEqual(['a', 'b'])
    expect(fav.has(C1, 'b')).toBe(true)
    expect(seen).toHaveBeenCalledTimes(1)

    // It removed its last favorite.
    events.dispatchEvent(storageEvent(favoritesKey(C1), null, storage))
    expect(fav.list(C1)).toEqual([])
    expect(seen).toHaveBeenCalledTimes(2)
    fav.destroy()
  })

  it('starts over when another tab clears storage', () => {
    const storage = memoryStorage()
    const events = new EventTarget()
    const fav = createFavorites({ storage, events })
    fav.toggle(C1, 'a')
    storage.map.clear()
    events.dispatchEvent(storageEvent(null, null, storage))
    expect(fav.list(C1)).toEqual([])
    fav.destroy()
  })

  it('ignores other keys, other storage areas, and events after destroy', () => {
    const storage = memoryStorage()
    const events = new EventTarget()
    const fav = createFavorites({ storage, events })
    const seen = vi.fn()
    fav.subscribe(seen)
    events.dispatchEvent(storageEvent('something-else', '["a"]', storage))
    events.dispatchEvent(storageEvent(favoritesKey(C1), '["a"]', memoryStorage()))
    expect(seen).not.toHaveBeenCalled()
    expect(fav.list(C1)).toEqual([])
    fav.destroy()
    events.dispatchEvent(storageEvent(favoritesKey(C1), '["a"]', storage))
    expect(fav.list(C1)).toEqual([])
  })
})
