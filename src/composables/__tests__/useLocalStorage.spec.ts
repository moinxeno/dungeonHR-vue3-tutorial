import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick } from 'vue'

import { useLocalStorage } from '@/composables/useLocalStorage'

const KEY = 'test:items'

/**
 * `useLocalStorage` registers a watcher and a cleanup callback, which need an active effect scope.
 * In a component that is the component; in a test we create one ourselves and stop it afterwards.
 */
function setup<T>(initialValue: T, options?: { version?: number }) {
  const scope = effectScope()
  const state = scope.run(() => useLocalStorage(KEY, initialValue, options))!
  return { state, scope }
}

/** What another browser tab would do: write to storage and fire a `storage` event here. */
function simulateOtherTab(value: unknown, version = 1): void {
  const raw = JSON.stringify({ version, data: value })
  localStorage.setItem(KEY, raw)
  window.dispatchEvent(
    new StorageEvent('storage', { key: KEY, newValue: raw, storageArea: localStorage }),
  )
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useLocalStorage', () => {
  it('starts with the initial value when nothing is stored', () => {
    const { state } = setup(['a'])
    expect(state.value).toEqual(['a'])
  })

  it('restores a previously stored value', () => {
    localStorage.setItem(KEY, JSON.stringify({ version: 1, data: ['saved'] }))
    const { state } = setup(['initial'])
    expect(state.value).toEqual(['saved'])
  })

  it('ignores data stored with a different version', () => {
    localStorage.setItem(KEY, JSON.stringify({ version: 1, data: ['old shape'] }))
    const { state } = setup(['initial'], { version: 2 })
    expect(state.value).toEqual(['initial'])
  })

  it('ignores malformed JSON instead of crashing', () => {
    localStorage.setItem(KEY, '{not json')
    const { state } = setup(['initial'])
    expect(state.value).toEqual(['initial'])
  })

  it('saves replacements and deep changes', async () => {
    const { state } = setup([{ hp: 10 }])

    state.value = [{ hp: 5 }]
    await nextTick() // watchers run asynchronously, batched before the next render
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ version: 1, data: [{ hp: 5 }] })

    state.value[0]!.hp = 1
    await nextTick()
    expect(JSON.parse(localStorage.getItem(KEY)!).data).toEqual([{ hp: 1 }])
  })

  it('picks up changes made in another tab', () => {
    const { state } = setup(['mine'])
    simulateOtherTab(['theirs'])
    expect(state.value).toEqual(['theirs'])
  })

  it('stops listening when its scope is stopped', () => {
    const { state, scope } = setup(['mine'])
    scope.stop()
    simulateOtherTab(['theirs'])
    expect(state.value).toEqual(['mine'])
  })

  it('keeps working when storage refuses to save', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError')
    })
    const { state } = setup(['a'])

    state.value = ['b']
    await nextTick()

    expect(state.value).toEqual(['b'])
  })
})
