<script setup lang="ts">
import BaseBadge from '@/components/ui/BaseBadge.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { REQUEST_TYPE_PROFILES } from '@/data/requestTypes'
import type { LeaveRequest, Minion, MinionId, RequestId, RequestStatus } from '@/types/dungeon'
import { daysBetween, formatDate } from '@/utils/date'

const { requests, minions } = defineProps<{
  requests: readonly LeaveRequest[]
  /** Used to show applicants' names instead of their IDs. */
  minions: readonly Minion[]
}>()

const emit = defineEmits<{
  approve: [id: RequestId]
  reject: [id: RequestId]
}>()

const STATUS_TONES = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
} as const satisfies Record<RequestStatus, string>

function minionName(id: MinionId): string {
  return minions.find((minion) => minion.id === id)?.name ?? 'Unknown minion'
}

/** A one-line summary of what was requested. TypeScript narrows `request` in each case. */
function describeRequest(request: LeaveRequest): string {
  switch (request.type) {
    case 'vacation': {
      const days = daysBetween(request.startDate, request.endDate) + 1
      return `${formatDate(request.startDate)} to ${formatDate(request.endDate)} (${days} days)`
    }
    case 'full-moon-leave':
      return `Night of ${formatDate(request.fullMoonDate)}`
    case 'shift-swap': {
      const partner = request.swapPartnerId ? minionName(request.swapPartnerId) : 'nobody yet'
      return `${formatDate(request.date)}: ${request.fromShift} to ${request.toShift}, covered by ${partner}`
    }
  }
}
</script>

<template>
  <section aria-labelledby="request-list-heading">
    <h2 id="request-list-heading" class="text-lg font-semibold text-crypt-50">
      Requests on HR's desk
    </h2>

    <p v-if="requests.length === 0" class="mt-4 text-crypt-400">No requests yet.</p>

    <ul v-else class="mt-4 space-y-4">
      <li
        v-for="request in requests"
        :key="request.id"
        class="rounded-2xl border border-crypt-700 bg-crypt-900/80 p-5"
      >
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class="text-sm font-semibold text-crypt-50">
              {{ REQUEST_TYPE_PROFILES[request.type].icon }}
              {{ REQUEST_TYPE_PROFILES[request.type].label }}
              <!--
                The link sits inside the span on purpose. Between two elements, Vue's compiler drops
                whitespace that contains a line break, which would glue "for" to the name. Between
                text and an element, the whitespace is kept as a single space.
              -->
              <span class="font-normal text-crypt-400">
                for
                <RouterLink
                  :to="{ name: 'minion', params: { id: request.minionId } }"
                  class="font-semibold text-ember-300 hover:underline"
                >
                  {{ minionName(request.minionId) }}
                </RouterLink>
              </span>
            </p>
            <p class="mt-1 text-sm text-crypt-300">{{ describeRequest(request) }}</p>
          </div>
          <BaseBadge :tone="STATUS_TONES[request.status]" class="capitalize">
            {{ request.status }}
          </BaseBadge>
        </div>

        <p v-if="request.note" class="mt-3 text-sm text-crypt-300 italic">“{{ request.note }}”</p>

        <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p class="text-xs text-crypt-500">
            Submitted {{ formatDate(request.submittedAt.slice(0, 10)) }}
          </p>
          <div v-if="request.status === 'pending'" class="flex gap-2">
            <BaseButton size="sm" variant="ghost-danger" @click="emit('reject', request.id)">
              Reject
            </BaseButton>
            <BaseButton size="sm" variant="primary" @click="emit('approve', request.id)">
              Approve
            </BaseButton>
          </div>
        </div>
      </li>
    </ul>
  </section>
</template>
