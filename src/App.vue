<script setup lang="ts">
import { computed, ref } from 'vue'

import MinionCard from '@/components/minions/MinionCard.vue'
import MinionFilters from '@/components/minions/MinionFilters.vue'
import MinionForm from '@/components/minions/MinionForm.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { seedMinions } from '@/data/seedMinions'
import type { Minion, MinionDraft, MinionId, Species } from '@/types/dungeon'
import { toIsoDate } from '@/utils/date'
import { formatGold } from '@/utils/gold'
import { createId } from '@/utils/id'

/** How much stress a rest removes. */
const REST_STRESS_RELIEF = 25

// The roster is reactive state. `structuredClone` gives us our own deep copy, so changes made
// here never leak back into the seed module.
const minions = ref<Minion[]>(structuredClone(seedMinions))

// ---------------------------------------------------------------------------
// Filters: owned here, edited by <MinionFilters> through v-model
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

// ---------------------------------------------------------------------------
// Roster statistics (always for the whole roster, not just the filtered view)
// ---------------------------------------------------------------------------

const totalPayroll = computed(() => minions.value.reduce((sum, minion) => sum + minion.salary, 0))
const unionCount = computed(() => minions.value.filter((minion) => minion.isUnionized).length)
const woundedCount = computed(
  () => minions.value.filter((minion) => minion.hp < minion.maxHp).length,
)

const rosterStats = computed(() => [
  { label: 'Headcount', value: String(minions.value.length) },
  { label: 'Monthly payroll', value: formatGold(totalPayroll.value) },
  { label: 'Union members', value: `${unionCount.value} / ${minions.value.length}` },
  { label: 'Wounded', value: String(woundedCount.value) },
])

// ---------------------------------------------------------------------------
// Recruiting: <MinionForm> emits a finished draft, we turn it into a minion
// ---------------------------------------------------------------------------

const isRecruiting = ref(false)
const minionNames = computed(() => minions.value.map((minion) => minion.name))

function recruitMinion(draft: MinionDraft): void {
  minions.value.unshift({
    ...draft,
    id: createId('m'),
    hp: draft.maxHp,
    stress: 0,
    hiredOn: toIsoDate(new Date()),
  })
  isRecruiting.value = false
}

// ---------------------------------------------------------------------------
// Actions on a single minion, requested by <MinionCard> through events
// ---------------------------------------------------------------------------

function findMinion(id: MinionId): Minion | undefined {
  return minions.value.find((minion) => minion.id === id)
}

function healMinion(id: MinionId): void {
  const minion = findMinion(id)
  if (minion) minion.hp = minion.maxHp
}

function restMinion(id: MinionId): void {
  const minion = findMinion(id)
  // Knocked-out minions cannot rest; they need the healer first.
  if (!minion || minion.hp === 0) return
  minion.stress = Math.max(0, minion.stress - REST_STRESS_RELIEF)
}

function fireMinion(id: MinionId): void {
  const minion = findMinion(id)
  // The card hides the button for union members, but the owner of the data enforces the rule.
  if (!minion || minion.isUnionized) return
  minions.value = minions.value.filter((other) => other.id !== id)
}

// ---------------------------------------------------------------------------
// Actions on the whole roster
// ---------------------------------------------------------------------------

/** Random integer between `min` and `max`, both inclusive. */
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/** Adventurers storm the dungeon: everyone still standing takes damage and gets more stressed. */
function simulateRaid(): void {
  for (const minion of minions.value) {
    // Knocked-out minions are out of the fight: no further damage, no further stress.
    if (minion.hp === 0) continue

    const damage = randomInt(0, Math.ceil(minion.maxHp * 0.4))
    minion.hp = Math.max(0, minion.hp - damage)
    minion.stress = Math.min(100, minion.stress + randomInt(5, 15))
  }
}

/** The dungeon healer patches everyone up. Stress, sadly, is not covered. */
function callHealer(): void {
  for (const minion of minions.value) {
    minion.hp = minion.maxHp
  }
}
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
    <header class="mb-10">
      <p class="text-sm font-medium tracking-[0.2em] text-ember-400 uppercase">
        Staff &amp; Resource Portal
      </p>
      <h1 class="mt-2 text-4xl font-bold text-crypt-50 sm:text-5xl">DungeonHR</h1>
      <p class="mt-3 max-w-2xl text-crypt-300">
        The Dark Lord is on sabbatical. Until further notice, all staffing questions go through this
        portal.
      </p>
    </header>

    <main>
      <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
        <h2 class="text-2xl font-semibold text-crypt-100">Minion Roster</h2>

        <div class="flex flex-wrap gap-3">
          <BaseButton variant="primary" :disabled="isRecruiting" @click="isRecruiting = true">
            Recruit a minion
          </BaseButton>
          <BaseButton variant="danger" @click="simulateRaid">Simulate a raid</BaseButton>
          <BaseButton @click="callHealer">Call the healer</BaseButton>
        </div>
      </div>

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
          @heal="healMinion"
          @rest="restMinion"
          @fire="fireMinion"
        />
      </div>
    </main>
  </div>
</template>
