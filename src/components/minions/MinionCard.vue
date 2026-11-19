<script setup lang="ts">
// For now, every value is hard-coded. In chapter 2 these constants become props,
// so that each card can show a different minion.
const name = 'Grizzle Snaggletooth'
const speciesLabel = 'Goblin'
const icon = '👺'
const hp = 18
const maxHp = 24
const threatLevel = 2
const salary = 120
const isUnionized = true

// Plain arithmetic, evaluated once when the component is created.
const hpPercent = Math.round((hp / maxHp) * 100)
</script>

<template>
  <article
    class="minion-card rounded-2xl border border-crypt-700 bg-crypt-900/80 p-5 shadow-lg shadow-black/40"
  >
    <header class="flex items-start gap-4">
      <span
        class="grid size-14 shrink-0 place-items-center rounded-xl bg-crypt-800 text-3xl"
        aria-hidden="true"
      >
        {{ icon }}
      </span>

      <div class="min-w-0 flex-1">
        <h3 class="text-lg leading-snug font-semibold text-crypt-50">{{ name }}</h3>
        <p class="text-sm text-crypt-400">{{ speciesLabel }}</p>
      </div>

      <span
        v-if="isUnionized"
        class="rounded-full border border-ichor-600/50 bg-ichor-500/10 px-2.5 py-0.5 text-xs font-medium text-ichor-300"
      >
        Union
      </span>
    </header>

    <dl class="mt-5 space-y-4 text-sm">
      <div>
        <div class="flex justify-between">
          <dt class="text-crypt-400">Hit points</dt>
          <dd class="font-medium text-crypt-100">{{ hp }} / {{ maxHp }}</dd>
        </div>
        <div
          class="mt-1.5 h-2 overflow-hidden rounded-full bg-crypt-800"
          role="meter"
          aria-label="Hit points"
          :aria-valuenow="hp"
          aria-valuemin="0"
          :aria-valuemax="maxHp"
        >
          <div class="h-full rounded-full bg-ichor-500" :style="{ width: `${hpPercent}%` }"></div>
        </div>
      </div>

      <div class="flex justify-between">
        <dt class="text-crypt-400">Threat level</dt>
        <dd class="font-medium text-blood-400">{{ threatLevel }} / 5</dd>
      </div>

      <div class="flex justify-between">
        <dt class="text-crypt-400">Salary</dt>
        <dd class="font-medium text-gold-400">{{ salary }} gp / month</dd>
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
    translate 200ms ease;
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
