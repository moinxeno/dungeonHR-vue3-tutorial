<script setup lang="ts">
import { computed } from 'vue'

import BaseBadge from '@/components/ui/BaseBadge.vue'
import StatBar from '@/components/ui/StatBar.vue'
import ThreatLevelIndicator from '@/components/minions/ThreatLevelIndicator.vue'
import { SPECIES_PROFILES } from '@/data/species'
import type { Minion } from '@/types/dungeon'
import { formatGold } from '@/utils/gold'

const { minion } = defineProps<{
  minion: Minion
}>()

// Both values are derived from the prop. `computed` re-evaluates them when the minion changes
// and caches the result in between.
const profile = computed(() => SPECIES_PROFILES[minion.species])
const isKnockedOut = computed(() => minion.hp === 0)
</script>

<template>
  <article
    class="minion-card rounded-2xl border border-crypt-700 bg-crypt-900/80 p-5 shadow-lg shadow-black/40"
    :class="{ 'opacity-60 grayscale': isKnockedOut }"
  >
    <header class="flex items-start gap-4">
      <span
        class="grid size-14 shrink-0 place-items-center rounded-xl bg-crypt-800 text-3xl"
        aria-hidden="true"
        :title="profile.description"
      >
        {{ profile.icon }}
      </span>

      <div class="min-w-0 flex-1">
        <h3 class="text-lg leading-snug font-semibold text-crypt-50">{{ minion.name }}</h3>
        <p class="text-sm text-crypt-400">{{ profile.label }}</p>
      </div>

      <div class="flex flex-col items-end gap-1.5">
        <BaseBadge v-if="isKnockedOut" tone="danger">Knocked out</BaseBadge>
        <BaseBadge v-if="minion.isUnionized" tone="success">Union</BaseBadge>
      </div>
    </header>

    <div class="mt-5 space-y-3">
      <StatBar label="Hit points" :value="minion.hp" :max="minion.maxHp" variant="health" />
      <StatBar label="Stress" :value="minion.stress" :max="100" variant="stress" />
    </div>

    <dl class="mt-4 space-y-3 text-sm">
      <div class="flex items-center justify-between">
        <dt class="text-crypt-400">Threat level</dt>
        <dd><ThreatLevelIndicator :level="minion.threatLevel" /></dd>
      </div>

      <div class="flex justify-between">
        <dt class="text-crypt-400">Salary</dt>
        <dd class="font-medium text-gold-400">{{ formatGold(minion.salary) }} / month</dd>
      </div>
    </dl>
  </article>
</template>

<style scoped>
/*
 * Scoped styles only apply to this component's elements.
 * Tailwind covers almost everything; a hover glow with a transition is easier to read as plain CSS.
 */
.minion-card {
  transition:
    border-color 200ms ease,
    box-shadow 200ms ease,
    translate 200ms ease,
    opacity 300ms ease,
    filter 300ms ease;
}

.minion-card:hover {
  border-color: var(--color-ember-600);
  box-shadow: 0 0 24px -6px color-mix(in oklab, var(--color-ember-500) 60%, transparent);
  translate: 0 -2px;
}

@media (prefers-reduced-motion: reduce) {
  .minion-card {
    transition: none;
  }

  .minion-card:hover {
    translate: none;
  }
}
</style>
