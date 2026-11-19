<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed } from 'vue'

import AggroMonitor from '@/components/sectors/AggroMonitor.vue'
import SectorColumn from '@/components/sectors/SectorColumn.vue'
import { useDungeonStore } from '@/stores/dungeon'

const { sectors, unassignedMinions } = storeToRefs(useDungeonStore())

const waitingText = computed(() => {
  const count = unassignedMinions.value.length
  if (count === 0) return 'Everyone has a post.'
  return count === 1
    ? '1 minion is waiting for a post.'
    : `${count} minions are waiting for a post.`
})
</script>

<template>
  <div>
    <header class="mb-8">
      <h1 class="text-3xl font-bold text-crypt-50 sm:text-4xl">Sector Planner</h1>
      <p class="mt-2 max-w-2xl text-crypt-300">
        Post minions to sectors and shifts. Keep incompatible species apart, stay within budget, and
        watch the monitor. Each minion can hold one post at a time.
        <span class="text-crypt-100">{{ waitingText }}</span>
      </p>
    </header>

    <div class="grid items-start gap-8 xl:grid-cols-[1fr_22rem]">
      <ul class="grid gap-6 md:grid-cols-2" aria-label="Sectors">
        <li v-for="sector in sectors" :key="sector.id">
          <SectorColumn :sector="sector" class="h-full" />
        </li>
      </ul>

      <AggroMonitor class="xl:sticky xl:top-6" />
    </div>
  </div>
</template>
