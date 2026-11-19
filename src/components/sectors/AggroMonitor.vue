<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed } from 'vue'

import AlertItem from '@/components/sectors/AlertItem.vue'
import { useDungeonStore } from '@/stores/dungeon'

// The alerts are computed in the store from minions, sectors and assignments. This component only
// displays them, and it updates whenever any of those change, on any page.
const { alerts } = storeToRefs(useDungeonStore())

const criticalCount = computed(
  () => alerts.value.filter((alert) => alert.severity === 'critical').length,
)
const warningCount = computed(
  () => alerts.value.filter((alert) => alert.severity === 'warning').length,
)
</script>

<template>
  <section
    aria-labelledby="aggro-monitor-heading"
    class="rounded-2xl border border-crypt-700 bg-crypt-900/80 p-5 shadow-lg shadow-black/40"
  >
    <h2 id="aggro-monitor-heading" class="text-lg font-semibold text-crypt-50">
      Aggro &amp; Burnout Monitor
    </h2>
    <p class="mt-1 text-sm text-crypt-400" aria-live="polite">
      <template v-if="alerts.length === 0">All quiet in the dungeon. Suspiciously quiet.</template>
      <template v-else>
        <span class="font-semibold text-blood-300">{{ criticalCount }} critical</span>,
        <span class="font-semibold text-gold-300">{{ warningCount }} warnings</span>
      </template>
    </p>

    <ul v-if="alerts.length > 0" class="mt-4 space-y-2">
      <AlertItem v-for="alert in alerts" :key="alert.id" :alert="alert" />
    </ul>
  </section>
</template>
