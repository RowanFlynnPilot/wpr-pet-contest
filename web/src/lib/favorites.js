// Favorites: pets a reader keeps, private to this device. No sign-in, nothing
// sent to our servers, no counts anywhere. One list of entry ids per contest
// in localStorage. Inside the WordPress iframe storage can be partitioned,
// blocked or cleared under us, so every access is guarded and the list falls
// back to memory for the visit.
import { useSyncExternalStore } from 'react'

const PREFIX = 'wpr-pet-favorites:'
const NONE = Object.freeze([])

export const favoritesKey = (contestId) => `${PREFIX}${contestId}`

// Ids only, once each; anything else in the slot is ignored.
function parse(raw) {
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? Object.freeze([...new Set(v.filter((x) => typeof x === 'string' && x))]) : NONE
  } catch {
    return NONE
  }
}

// Reading window.localStorage itself throws when storage is blocked.
function browserStorage() {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export function createFavorites({ storage = browserStorage(), events = typeof window === 'undefined' ? null : window } = {}) {
  // key -> frozen array. The same array comes back until the list changes,
  // which is what useSyncExternalStore compares.
  const lists = new Map()
  const listeners = new Set()
  const emit = () => listeners.forEach((fn) => fn())

  function list(contestId) {
    if (!contestId) return NONE
    const key = favoritesKey(contestId)
    if (!lists.has(key)) {
      let saved = NONE
      try {
        const raw = storage?.getItem(key)
        if (raw) saved = parse(raw)
      } catch {
        // Blocked or partitioned: start empty, in memory.
      }
      lists.set(key, saved)
    }
    return lists.get(key)
  }

  function save(contestId, ids) {
    const key = favoritesKey(contestId)
    const next = Object.freeze(ids)
    lists.set(key, next)
    try {
      if (next.length) storage?.setItem(key, JSON.stringify(next))
      else storage?.removeItem(key)
    } catch {
      // Full, blocked or cleared: the list still holds for this visit.
    }
    emit()
  }

  // Returns whether the pet is a favorite now.
  function toggle(contestId, id) {
    if (!contestId || !id) return false
    const now = list(contestId)
    const on = !now.includes(id)
    save(contestId, on ? [...now, id] : now.filter((x) => x !== id))
    return on
  }

  // Another tab changed a list, or cleared storage (key is null).
  function onStorage(e) {
    if (e.storageArea && e.storageArea !== storage) return
    if (e.key === null) lists.clear()
    else if (typeof e.key === 'string' && e.key.startsWith(PREFIX)) lists.set(e.key, e.newValue ? parse(e.newValue) : NONE)
    else return
    emit()
  }
  events?.addEventListener?.('storage', onStorage)

  return {
    list,
    has: (contestId, id) => list(contestId).includes(id),
    toggle,
    subscribe(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    destroy: () => events?.removeEventListener?.('storage', onStorage),
  }
}

export const favorites = createFavorites()

// Every heart and list on the page reads the same store, so they change together.
export function useFavorites(contestId, store = favorites) {
  return useSyncExternalStore(store.subscribe, () => store.list(contestId), () => NONE)
}

// One pet's heart re-renders only when that pet changes.
export function useIsFavorite(contestId, id, store = favorites) {
  return useSyncExternalStore(store.subscribe, () => store.has(contestId, id), () => false)
}
