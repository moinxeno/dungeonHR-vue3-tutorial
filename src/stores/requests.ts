import { acceptHMRUpdate, defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { seedRequests } from '@/data/seedRequests'
import { useDungeonStore } from '@/stores/dungeon'
import type { LeaveRequest, LeaveRequestDraft, RequestId, RequestType } from '@/types/dungeon'
import { createId } from '@/utils/id'

/**
 * How much stress an approved request takes away. Stress never exceeds 100, so a vacation clears
 * it completely. Swapping a shift is a logistics matter, not a rest.
 */
export const STRESS_RELIEF_ON_APPROVAL: Record<RequestType, number> = {
  vacation: 100,
  'full-moon-leave': 40,
  'shift-swap': 0,
}

export const useRequestsStore = defineStore('requests', () => {
  // A store can use other stores. Approving leave changes a minion's stress, and the minions belong
  // to the dungeon store, so we ask the dungeon store to do it.
  const dungeon = useDungeonStore()

  const requests = ref<LeaveRequest[]>(structuredClone(seedRequests))

  const pendingCount = computed(
    () => requests.value.filter((request) => request.status === 'pending').length,
  )

  function submitRequest(draft: LeaveRequestDraft): void {
    requests.value.unshift({
      ...draft,
      id: createId('r'),
      status: 'pending',
      submittedAt: new Date().toISOString(),
    })
  }

  function findPending(id: RequestId): LeaveRequest | undefined {
    const request = requests.value.find((candidate) => candidate.id === id)
    return request?.status === 'pending' ? request : undefined
  }

  function approveRequest(id: RequestId): void {
    const request = findPending(id)
    if (!request) return
    request.status = 'approved'

    const relief = STRESS_RELIEF_ON_APPROVAL[request.type]
    if (relief > 0) dungeon.relieveStress(request.minionId, relief)
  }

  function rejectRequest(id: RequestId): void {
    const request = findPending(id)
    if (request) request.status = 'rejected'
  }

  return { requests, pendingCount, submitRequest, approveRequest, rejectRequest }
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useRequestsStore, import.meta.hot))
}
