<script setup lang="ts">
import { ref } from 'vue'

import LeaveRequestForm from '@/components/requests/LeaveRequestForm.vue'
import RequestList from '@/components/requests/RequestList.vue'
import { seedMinions } from '@/data/seedMinions'
import { seedRequests } from '@/data/seedRequests'
import type { LeaveRequest, LeaveRequestDraft, RequestId } from '@/types/dungeon'
import { createId } from '@/utils/id'

const { preselectedMinionId } = defineProps<{
  /** From `?minion=…` in the URL. The route's `props` function maps the query to this prop. */
  preselectedMinionId?: string
}>()

// Like the roster, the requests are local to this page for now: navigate away, and new requests
// and decisions are gone. The applicants come from the seed data, so recruits cannot file requests.
const requests = ref<LeaveRequest[]>(structuredClone(seedRequests))
const minions = seedMinions

function submitRequest(draft: LeaveRequestDraft): void {
  requests.value.unshift({
    ...draft,
    id: createId('r'),
    status: 'pending',
    submittedAt: new Date().toISOString(),
  })
}

function decide(id: RequestId, status: 'approved' | 'rejected'): void {
  const request = requests.value.find((candidate) => candidate.id === id)
  if (request?.status === 'pending') request.status = status
}
</script>

<template>
  <div>
    <header class="mb-8">
      <h1 class="text-3xl font-bold text-crypt-50 sm:text-4xl">Leave Requests</h1>
      <p class="mt-2 max-w-2xl text-crypt-300">
        Vacations, shift swaps and full-moon leave. HR reads every request. Eventually.
      </p>
    </header>

    <div class="grid items-start gap-8 lg:grid-cols-5">
      <LeaveRequestForm
        class="lg:col-span-2"
        :minions="minions"
        :preselected-minion-id="preselectedMinionId"
        @submit="submitRequest"
      />
      <RequestList
        class="lg:col-span-3"
        :requests="requests"
        :minions="minions"
        @approve="decide($event, 'approved')"
        @reject="decide($event, 'rejected')"
      />
    </div>
  </div>
</template>
