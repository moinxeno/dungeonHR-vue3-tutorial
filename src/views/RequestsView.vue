<script setup lang="ts">
import { storeToRefs } from 'pinia'

import LeaveRequestForm from '@/components/requests/LeaveRequestForm.vue'
import RequestList from '@/components/requests/RequestList.vue'
import { useDungeonStore } from '@/stores/dungeon'
import { useRequestsStore } from '@/stores/requests'

const { preselectedMinionId } = defineProps<{
  /** From `?minion=…` in the URL. The route's `props` function maps the query to this prop. */
  preselectedMinionId?: string
}>()

// Both lists come from stores now: recruits can file requests, and decisions survive navigation.
const requestsStore = useRequestsStore()
const { requests } = storeToRefs(requestsStore)
const { minions } = storeToRefs(useDungeonStore())
</script>

<template>
  <div>
    <header class="mb-8">
      <h1 class="text-3xl font-bold text-crypt-50 sm:text-4xl">Leave Requests</h1>
      <p class="mt-2 max-w-2xl text-crypt-300">
        Vacations, shift swaps and full-moon leave. HR reads every request. Eventually. An approved
        vacation clears a minion's stress; full-moon leave takes off 40.
      </p>
    </header>

    <div class="grid items-start gap-8 lg:grid-cols-5">
      <LeaveRequestForm
        class="lg:col-span-2"
        :minions="minions"
        :preselected-minion-id="preselectedMinionId"
        @submit="requestsStore.submitRequest"
      />
      <RequestList
        class="lg:col-span-3"
        :requests="requests"
        :minions="minions"
        @approve="requestsStore.approveRequest"
        @reject="requestsStore.rejectRequest"
      />
    </div>
  </div>
</template>
