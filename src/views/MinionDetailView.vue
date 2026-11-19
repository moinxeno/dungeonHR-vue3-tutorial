<script setup lang="ts">
import { computed } from 'vue'

import ThreatLevelIndicator from '@/components/minions/ThreatLevelIndicator.vue'
import BaseBadge from '@/components/ui/BaseBadge.vue'
import StatBar from '@/components/ui/StatBar.vue'
import { SPECIES_PROFILES } from '@/data/species'
import { useDungeonStore } from '@/stores/dungeon'
import { daysBetween, formatDate, toIsoDate } from '@/utils/date'
import { formatGold } from '@/utils/gold'

const { id } = defineProps<{
  /** The `:id` part of `/minion/:id`. The route passes it as a prop because it sets `props: true`. */
  id: string
}>()

const dungeon = useDungeonStore()

// Everything below is `computed` from `id`. That matters: going from one minion to the next only
// changes the URL parameter. Vue Router reuses this component instance instead of creating a new
// one, so `<script setup>` does not run again. Only computed values notice the new `id`.
//
// The minion comes from the store, so recruits have a profile and raid damage shows up here.
const minion = computed(() => dungeon.getMinion(id))
const profile = computed(() => (minion.value ? SPECIES_PROFILES[minion.value.species] : undefined))

const posting = computed(() => {
  const assignment = dungeon.getAssignment(id)
  const sector = assignment ? dungeon.getSector(assignment.sectorId) : undefined
  return assignment && sector ? `${sector.name}, ${assignment.shift} shift` : 'Not assigned'
})

const position = computed(() => dungeon.minions.findIndex((candidate) => candidate.id === id))
const previousMinion = computed(() =>
  position.value > 0 ? dungeon.minions[position.value - 1] : undefined,
)
const nextMinion = computed(() =>
  position.value >= 0 ? dungeon.minions[position.value + 1] : undefined,
)

const yearsOfService = computed(() => {
  if (!minion.value) return 0
  return Math.floor(daysBetween(minion.value.hiredOn, toIsoDate(new Date())) / 365.25)
})
</script>

<template>
  <div>
    <RouterLink
      :to="{ name: 'roster' }"
      class="text-sm font-medium text-crypt-400 transition-colors hover:text-ember-300"
    >
      ← Back to the roster
    </RouterLink>

    <article
      v-if="minion && profile"
      class="mt-6 rounded-2xl border border-crypt-700 bg-crypt-900/80 p-6 shadow-lg shadow-black/40 sm:p-8"
    >
      <header class="flex flex-col gap-5 sm:flex-row sm:items-start">
        <div class="flex min-w-0 flex-1 items-start gap-5">
          <span
            class="grid size-16 shrink-0 place-items-center rounded-2xl bg-crypt-800 text-4xl sm:size-20 sm:text-5xl"
            aria-hidden="true"
          >
            {{ profile.icon }}
          </span>

          <div class="min-w-0">
            <h1 class="text-2xl font-bold break-words text-crypt-50 sm:text-3xl">
              {{ minion.name }}
            </h1>
            <p class="mt-1 text-crypt-400">{{ profile.label }} · {{ profile.description }}</p>
            <div class="mt-3 flex flex-wrap gap-2">
              <BaseBadge v-if="minion.hp === 0" tone="danger">Knocked out</BaseBadge>
              <BaseBadge v-if="minion.isUnionized" tone="success">Union member</BaseBadge>
            </div>
          </div>
        </div>

        <!-- A link that looks like a button: it navigates, so it should be a link. -->
        <RouterLink
          :to="{ name: 'requests', query: { minion: minion.id } }"
          class="self-start rounded-lg bg-ember-600 px-4 py-2 text-sm font-semibold whitespace-nowrap text-crypt-950 transition-colors hover:bg-ember-500"
        >
          File a leave request
        </RouterLink>
      </header>

      <p v-if="minion.bio" class="mt-6 max-w-3xl text-crypt-200 italic">“{{ minion.bio }}”</p>

      <div class="mt-8 grid gap-8 md:grid-cols-2">
        <section aria-labelledby="condition-heading" class="space-y-4">
          <h2 id="condition-heading" class="text-lg font-semibold text-crypt-100">Condition</h2>
          <StatBar label="Hit points" :value="minion.hp" :max="minion.maxHp" variant="health" />
          <StatBar label="Stress" :value="minion.stress" :max="100" variant="stress" />
        </section>

        <section aria-labelledby="employment-heading">
          <h2 id="employment-heading" class="text-lg font-semibold text-crypt-100">Employment</h2>
          <dl class="mt-4 space-y-3 text-sm">
            <div class="flex items-center justify-between">
              <dt class="text-crypt-400">Threat level</dt>
              <dd><ThreatLevelIndicator :level="minion.threatLevel" /></dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-crypt-400">Salary</dt>
              <dd class="font-medium text-gold-400">{{ formatGold(minion.salary) }} / month</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-crypt-400">Hired on</dt>
              <dd class="text-crypt-100">
                {{ formatDate(minion.hiredOn) }}
                <span class="text-crypt-400">({{ yearsOfService }} years of service)</span>
              </dd>
            </div>
            <div class="flex justify-between gap-4">
              <dt class="text-crypt-400">Posted to</dt>
              <dd class="text-right text-crypt-100 capitalize">{{ posting }}</dd>
            </div>
            <div class="flex justify-between gap-4">
              <dt class="text-crypt-400">Employee ID</dt>
              <dd class="text-right font-mono break-all text-crypt-300">{{ minion.id }}</dd>
            </div>
          </dl>
        </section>
      </div>

      <nav
        aria-label="Other minions"
        class="mt-10 flex flex-wrap justify-between gap-4 border-t border-crypt-800 pt-6 text-sm"
      >
        <RouterLink
          v-if="previousMinion"
          :to="{ name: 'minion', params: { id: previousMinion.id } }"
          class="text-crypt-300 transition-colors hover:text-ember-300"
        >
          ← {{ previousMinion.name }}
        </RouterLink>
        <span v-else></span>
        <RouterLink
          v-if="nextMinion"
          :to="{ name: 'minion', params: { id: nextMinion.id } }"
          class="text-crypt-300 transition-colors hover:text-ember-300"
        >
          {{ nextMinion.name }} →
        </RouterLink>
      </nav>
    </article>

    <div
      v-else
      class="mt-6 rounded-2xl border border-dashed border-crypt-700 px-6 py-12 text-center"
    >
      <h1 class="text-2xl font-bold text-crypt-100">No such minion</h1>
      <p class="mt-2 text-crypt-300">
        HR has no file for <span class="font-mono">{{ id }}</span
        >. Perhaps they were fired, or the link is wrong.
      </p>
    </div>
  </div>
</template>
