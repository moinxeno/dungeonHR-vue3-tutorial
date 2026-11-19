import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useDungeonStore } from '@/stores/dungeon'
import { useRequestsStore } from '@/stores/requests'

// Seed requests: r-001 vacation for m-003 (pending), r-002 full-moon leave for m-006 (approved),
// r-003 shift swap for m-012 (pending).

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
})

describe('requests store', () => {
  it('counts pending requests', () => {
    expect(useRequestsStore().pendingCount).toBe(2)
  })

  it('files new requests as pending, newest first', () => {
    const requests = useRequestsStore()
    requests.submitRequest({
      type: 'full-moon-leave',
      minionId: 'm-012',
      note: '',
      fullMoonDate: '2026-11-24',
    })

    expect(requests.requests[0]).toMatchObject({ type: 'full-moon-leave', status: 'pending' })
    expect(requests.requests[0]?.id).toMatch(/^r-/)
    expect(requests.pendingCount).toBe(3)
  })

  it('clears all stress when a vacation is approved', () => {
    const dungeon = useDungeonStore()
    const requests = useRequestsStore()
    expect(dungeon.getMinion('m-003')?.stress).toBe(55)

    requests.approveRequest('r-001')

    expect(requests.requests.find((r) => r.id === 'r-001')?.status).toBe('approved')
    expect(dungeon.getMinion('m-003')?.stress).toBe(0)
  })

  it('takes 40 stress off for approved full-moon leave', () => {
    const dungeon = useDungeonStore()
    const requests = useRequestsStore()
    requests.submitRequest({
      type: 'full-moon-leave',
      minionId: 'm-012',
      note: '',
      fullMoonDate: '2026-11-24',
    })

    requests.approveRequest(requests.requests[0]!.id)

    expect(dungeon.getMinion('m-012')?.stress).toBe(58 - 40)
  })

  it('does not change stress for an approved shift swap', () => {
    const dungeon = useDungeonStore()
    useRequestsStore().approveRequest('r-003')
    expect(dungeon.getMinion('m-012')?.stress).toBe(58)
  })

  it('rejects requests without touching stress', () => {
    const dungeon = useDungeonStore()
    const requests = useRequestsStore()
    requests.rejectRequest('r-001')

    expect(requests.requests.find((r) => r.id === 'r-001')?.status).toBe('rejected')
    expect(dungeon.getMinion('m-003')?.stress).toBe(55)
  })

  it('only decides pending requests', () => {
    const requests = useRequestsStore()
    requests.rejectRequest('r-002') // already approved
    expect(requests.requests.find((r) => r.id === 'r-002')?.status).toBe('approved')
  })
})
