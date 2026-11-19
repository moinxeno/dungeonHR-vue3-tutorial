<script setup lang="ts">
import type { AlertKind, DungeonAlert, Severity } from '@/types/dungeon'

const { alert } = defineProps<{
  alert: DungeonAlert
}>()

const KIND_PROFILES: Record<AlertKind, { icon: string; title: string }> = {
  'incompatible-species': { icon: '⚔️', title: 'Incompatible roommates' },
  'over-capacity': { icon: '👥', title: 'Over capacity' },
  'over-budget': { icon: '💸', title: 'Over budget' },
  'burnout-risk': { icon: '🔥', title: 'Burnout risk' },
}

const SEVERITY_CLASSES: Record<Severity, string> = {
  critical: 'border-blood-600/60 bg-blood-500/10',
  warning: 'border-gold-500/40 bg-gold-400/5',
  info: 'border-crypt-700 bg-crypt-900/60',
}
</script>

<template>
  <li class="flex gap-3 rounded-xl border p-3" :class="SEVERITY_CLASSES[alert.severity]">
    <span class="text-xl" aria-hidden="true">{{ KIND_PROFILES[alert.kind].icon }}</span>
    <div class="min-w-0 flex-1">
      <p class="text-sm font-semibold text-crypt-50">
        {{ KIND_PROFILES[alert.kind].title }}
        <span
          class="ml-1 text-xs font-medium uppercase"
          :class="alert.severity === 'critical' ? 'text-blood-300' : 'text-gold-300'"
        >
          {{ alert.severity }}
        </span>
      </p>
      <p class="mt-0.5 text-sm text-crypt-300">{{ alert.message }}</p>

      <!--
        `v-if` on the discriminant narrows the type inside the element: here TypeScript knows that
        `alert` is a BurnoutRiskAlert, so `alert.minionId` is available.
      -->
      <RouterLink
        v-if="alert.kind === 'burnout-risk'"
        :to="{ name: 'minion', params: { id: alert.minionId } }"
        class="mt-1 inline-block text-xs font-semibold text-ember-300 hover:underline"
      >
        Open profile
      </RouterLink>
    </div>
  </li>
</template>
