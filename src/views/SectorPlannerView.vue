<script setup lang="ts">
import ThreatLevelIndicator from '@/components/minions/ThreatLevelIndicator.vue'
import { SECTOR_KIND_PROFILES } from '@/data/sectorKinds'
import { seedSectors } from '@/data/seedSectors'
import { SHIFTS } from '@/types/dungeon'
import { formatGold } from '@/utils/gold'

// Read-only for now: the sector data never changes, so there is no reactive state on this page.
// Assigning minions to sectors needs the roster, and the roster lives on another page. Chapter 5
// moves it into a store, and this page becomes the planner.
const sectors = seedSectors
</script>

<template>
  <div>
    <header class="mb-8">
      <h1 class="text-3xl font-bold text-crypt-50 sm:text-4xl">Sector Planner</h1>
      <p class="mt-2 max-w-2xl text-crypt-300">
        Every sector is staffed around the clock in three shifts:
        <span class="text-crypt-100 capitalize">{{ SHIFTS.join(', ') }}</span
        >. Shift assignments are closed until HR finishes its negotiations with the union.
      </p>
    </header>

    <ul class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      <li
        v-for="sector in sectors"
        :key="sector.id"
        class="rounded-2xl border border-crypt-700 bg-crypt-900/80 p-5 shadow-lg shadow-black/40"
      >
        <div class="flex items-center gap-4">
          <span
            class="grid size-12 shrink-0 place-items-center rounded-xl bg-crypt-800 text-2xl"
            aria-hidden="true"
          >
            {{ SECTOR_KIND_PROFILES[sector.kind].icon }}
          </span>
          <div>
            <h2 class="text-lg font-semibold text-crypt-50">{{ sector.name }}</h2>
            <p class="text-sm text-crypt-400">{{ SECTOR_KIND_PROFILES[sector.kind].label }}</p>
          </div>
        </div>

        <dl class="mt-5 space-y-3 text-sm">
          <div class="flex justify-between">
            <dt class="text-crypt-400">Capacity</dt>
            <dd class="text-crypt-100">{{ sector.capacity }} minions per shift</dd>
          </div>
          <div class="flex items-center justify-between">
            <dt class="text-crypt-400">Minimum threat level</dt>
            <dd><ThreatLevelIndicator :level="sector.minThreatLevel" /></dd>
          </div>
          <div class="flex justify-between">
            <dt class="text-crypt-400">Payroll budget</dt>
            <dd class="font-medium text-gold-400">
              {{ formatGold(sector.payrollBudget) }} / month
            </dd>
          </div>
        </dl>
      </li>
    </ul>
  </div>
</template>
