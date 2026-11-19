<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'

import MinionCard from '@/components/minions/MinionCard.vue'
import MinionFilters from '@/components/minions/MinionFilters.vue'
import MinionForm from '@/components/minions/MinionForm.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useDungeonStore } from '@/stores/dungeon'
import type { MinionDraft, Species } from '@/types/dungeon'
import { formatGold } from '@/utils/gold'

// The roster lives in the store now. This view only reads it and asks the store for changes, so
// navigating away and back no longer loses anything.
const dungeon = useDungeonStore()

// `storeToRefs` turns the store's state and getters into refs, so destructuring keeps them
// reactive. (Destructuring the store directly would copy the current values once.)
const { minions, totalPayroll, unionCount, woundedCount } = storeToRefs(dungeon)

// ---------------------------------------------------------------------------
// Filters: UI state that only this page cares about, so it stays local
// ---------------------------------------------------------------------------

const search = ref('')
const speciesFilter = ref<Species | 'all'>('all')
const unionOnly = ref(false)

const filteredMinions = computed(() => {
  const query = search.value.trim().toLowerCase()
  return minions.value.filter((minion) => {
    if (query && !minion.name.toLowerCase().includes(query)) return false
    if (speciesFilter.value !== 'all' && minion.species !== speciesFilter.value) return false
    if (unionOnly.value && !minion.isUnionized) return false
    return true
  })
})

function resetFilters(): void {
  search.value = ''
  speciesFilter.value = 'all'
  unionOnly.value = false
}

const rosterStats = computed(() => [
  { label: 'Headcount', value: String(minions.value.length) },
  { label: 'Monthly payroll', value: formatGold(totalPayroll.value) },
  { label: 'Union members', value: `${unionCount.value} / ${minions.value.length}` },
  { label: 'Wounded', value: String(woundedCount.value) },
])

// ---------------------------------------------------------------------------
// Recruiting
// ---------------------------------------------------------------------------

const isRecruiting = ref(false)
const minionNames = computed(() => minions.value.map((minion) => minion.name))

function recruitMinion(draft: MinionDraft): void {
  dungeon.recruitMinion(draft)
  isRecruiting.value = false
}
</script>

<template>
  <div>
    <header class="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-3xl font-bold text-crypt-50 sm:text-4xl">Minion Roster</h1>
        <p class="mt-2 max-w-2xl text-crypt-300">
          The Dark Lord is on sabbatical. Until further notice, all staffing questions go through
          this portal.
        </p>
      </div>

      <div class="flex flex-wrap gap-3">
        <BaseButton variant="primary" :disabled="isRecruiting" @click="isRecruiting = true">
          Recruit a minion
        </BaseButton>
        <BaseButton variant="danger" @click="dungeon.simulateRaid()">Simulate a raid</BaseButton>
        <BaseButton @click="dungeon.callHealer()">Call the healer</BaseButton>
      </div>
    </header>

    <MinionForm
      v-if="isRecruiting"
      class="mb-8"
      :existing-names="minionNames"
      @submit="recruitMinion"
      @cancel="isRecruiting = false"
    />

    <dl class="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
      <div
        v-for="stat in rosterStats"
        :key="stat.label"
        class="rounded-xl border border-crypt-800 bg-crypt-900/60 px-4 py-3"
      >
        <dt class="text-xs tracking-wider text-crypt-400 uppercase">{{ stat.label }}</dt>
        <dd class="mt-1 text-xl font-semibold text-crypt-50 tabular-nums">{{ stat.value }}</dd>
      </div>
    </dl>

    <MinionFilters
      v-model:search="search"
      v-model:species="speciesFilter"
      v-model:union-only="unionOnly"
      class="mb-4"
    />

    <p class="mb-4 text-sm text-crypt-400" aria-live="polite">
      Showing {{ filteredMinions.length }} of {{ minions.length }} minions
    </p>

    <div
      v-if="filteredMinions.length === 0"
      class="rounded-2xl border border-dashed border-crypt-700 px-6 py-12 text-center"
    >
      <p class="text-crypt-300">No minion matches these filters.</p>
      <BaseButton class="mt-4" size="sm" @click="resetFilters">Reset filters</BaseButton>
    </div>

    <div v-else class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      <MinionCard
        v-for="minion in filteredMinions"
        :key="minion.id"
        :minion="minion"
        @heal="dungeon.healMinion"
        @rest="dungeon.restMinion"
        @fire="dungeon.fireMinion"
      />
    </div>
  </div>
</template>
