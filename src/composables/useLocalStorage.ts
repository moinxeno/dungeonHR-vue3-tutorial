import { onScopeDispose, ref, watch, type Ref } from 'vue'

/**
 * What we actually write to localStorage. The version lets us throw away data that was saved by an
 * older version of the app with a different shape, instead of loading it and crashing.
 */
interface StoredEnvelope<T> {
  version: number
  data: T
}

export interface UseLocalStorageOptions {
  /** Bump this when the shape of the stored data changes. Older data is then ignored. */
  version?: number
}

/**
 * A ref that is saved to `localStorage` whenever it changes, and restored from it on startup.
 *
 * - Works in components and in Pinia setup stores: it only needs an active effect scope.
 * - Keeps several open tabs in sync through the browser's `storage` event.
 * - Never throws. If storage is unavailable (private mode, blocked cookies, quota exceeded), the
 *   ref simply behaves like a normal, unsaved ref.
 *
 * @param key Where to save the value. Prefix it with the app's name to avoid collisions.
 * @param initialValue Used when nothing valid is stored yet.
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T,
  { version = 1 }: UseLocalStorageOptions = {},
): Ref<T> {
  function read(): T {
    try {
      const raw = localStorage.getItem(key)
      if (raw === null) return initialValue
      const stored = JSON.parse(raw) as Partial<StoredEnvelope<T>>
      return stored.version === version && 'data' in stored ? (stored.data as T) : initialValue
    } catch {
      // Unreadable storage or malformed JSON: start fresh rather than break the app.
      return initialValue
    }
  }

  function write(value: T): void {
    try {
      const envelope: StoredEnvelope<T> = { version, data: value }
      localStorage.setItem(key, JSON.stringify(envelope))
    } catch {
      // Storage full or unavailable. The app keeps working; changes just are not saved.
    }
  }

  // `ref` would type the value as `UnwrapRef<T>`, which differs from `T` for nested refs. Our data
  // is plain JSON, so the two are the same, and the cast keeps the signature simple.
  const state = ref(read()) as Ref<T>

  // `deep: true`: also save when something inside changes, e.g. `minions.value[0].hp = 3`.
  watch(state, write, { deep: true })

  // Another tab saved a new value for our key: load it, so all tabs show the same dungeon.
  function onStorage(event: StorageEvent): void {
    if (event.storageArea === localStorage && event.key === key) {
      state.value = read()
    }
  }
  window.addEventListener('storage', onStorage)

  // Remove the listener when whoever created this ref goes away: a component that unmounts, or
  // a store that is disposed. `onScopeDispose` works for both, unlike `onUnmounted`.
  onScopeDispose(() => window.removeEventListener('storage', onStorage))

  return state
}
