<script setup lang="ts">
import { computed, ref } from 'vue'

import MinionCard from '@/components/minions/MinionCard.vue'
import { seedMinions } from '@/data/seedMinions'
import type { Minion } from '@/types/dungeon'
import { formatGold } from '@/utils/gold'

// The roster is reactive state. `structuredClone` gives us our own deep copy, so changes made
// here never leak back into the seed module.
const minions = ref<Minion[]>(structuredClone(seedMinions))

// Derived state: recalculated automatically whenever a minion is added, removed or changed.
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

/** Random integer between `min` and `max`, both inclusive. */
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/** Adventurers storm the dungeon: everyone takes some damage and gets more stressed. */
function simulateRaid(): void {
  for (const minion of minions.value) {
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
          <button
            type="button"
            class="rounded-lg bg-ember-600 px-4 py-2 text-sm font-semibold text-crypt-950 transition-colors hover:bg-ember-500"
            @click="simulateRaid"
          >
            Simulate a raid
          </button>
          <button
            type="button"
            class="rounded-lg border border-ichor-600/60 px-4 py-2 text-sm font-semibold text-ichor-300 transition-colors hover:bg-ichor-500/10"
            @click="callHealer"
          >
            Call the healer
          </button>
        </div>
      </div>

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

      <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <MinionCard v-for="minion in minions" :key="minion.id" :minion="minion" />
      </div>
    </main>
  </div>
</template>
