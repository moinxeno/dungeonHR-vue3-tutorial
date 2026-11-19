<script setup lang="ts">
import { computed, ref } from 'vue'

import ThreatLevelIndicator from '@/components/minions/ThreatLevelIndicator.vue'
import AssignmentPicker from '@/components/sectors/AssignmentPicker.vue'
import StatBar from '@/components/ui/StatBar.vue'
import { SECTOR_KIND_PROFILES } from '@/data/sectorKinds'
import { SPECIES_PROFILES } from '@/data/species'
import { useDungeonStore } from '@/stores/dungeon'
import { SHIFTS, type DungeonSector, type MinionId, type Shift } from '@/types/dungeon'
import { formatGold } from '@/utils/gold'

const { sector } = defineProps<{
  sector: DungeonSector
}>()

// A connected component: it reads and changes shared data through the store directly, instead of
// receiving everything as props from the view and sending events back up.
const dungeon = useDungeonStore()

const payroll = computed(() => dungeon.getSectorPayroll(sector.id))
const shifts = computed(() =>
  SHIFTS.map((shift) => ({ shift, crew: dungeon.getCrew(sector.id, shift) })),
)

/** Why the store refused the last assignment, if it did. */
const refusal = ref<string | null>(null)

function assign(minionId: MinionId, shift: Shift): void {
  const result = dungeon.assignMinion(minionId, sector.id, shift)
  refusal.value = result.ok ? null : result.reason
}
</script>

<template>
  <article
    class="flex flex-col rounded-2xl border border-crypt-700 bg-crypt-900/80 p-5 shadow-lg shadow-black/40"
  >
    <header class="flex items-center gap-4">
      <span
        class="grid size-12 shrink-0 place-items-center rounded-xl bg-crypt-800 text-2xl"
        aria-hidden="true"
      >
        {{ SECTOR_KIND_PROFILES[sector.kind].icon }}
      </span>
      <div class="min-w-0 flex-1">
        <h2 class="text-lg font-semibold text-crypt-50">{{ sector.name }}</h2>
        <p class="text-sm text-crypt-400">
          {{ sector.capacity }} posts per shift · budget {{ formatGold(sector.payrollBudget) }}
        </p>
      </div>
    </header>

    <div class="mt-4 space-y-3">
      <!-- StatBar again, with the `budget` variant: it only turns red when the budget is exceeded. -->
      <StatBar label="Payroll (gp)" :value="payroll" :max="sector.payrollBudget" variant="budget" />
      <div class="flex items-center justify-between text-sm">
        <span class="text-crypt-400">Minimum threat level</span>
        <ThreatLevelIndicator :level="sector.minThreatLevel" />
      </div>
    </div>

    <section
      v-for="{ shift, crew } in shifts"
      :key="shift"
      class="mt-4 border-t border-crypt-800 pt-4"
      :aria-label="`${shift} shift`"
    >
      <div class="flex items-baseline justify-between">
        <h3 class="text-sm font-semibold text-crypt-200 capitalize">{{ shift }}</h3>
        <span
          class="text-xs tabular-nums"
          :class="crew.length > sector.capacity ? 'text-blood-300' : 'text-crypt-400'"
        >
          {{ crew.length }} / {{ sector.capacity }}
        </span>
      </div>

      <ul v-if="crew.length > 0" class="mt-2 space-y-1.5">
        <li
          v-for="minion in crew"
          :key="minion.id"
          class="flex items-center gap-2 rounded-lg bg-crypt-800/60 px-2.5 py-1.5 text-sm"
        >
          <span aria-hidden="true">{{ SPECIES_PROFILES[minion.species].icon }}</span>
          <RouterLink
            :to="{ name: 'minion', params: { id: minion.id } }"
            class="min-w-0 flex-1 truncate text-crypt-100 hover:text-ember-300"
          >
            {{ minion.name }}
          </RouterLink>
          <button
            type="button"
            class="rounded px-1.5 text-crypt-400 transition-colors hover:bg-crypt-700 hover:text-crypt-50"
            :aria-label="`Remove ${minion.name} from the ${shift} shift`"
            @click="dungeon.unassignMinion(minion.id)"
          >
            ✕
          </button>
        </li>
      </ul>
      <p v-else class="mt-2 text-xs text-crypt-500 italic">Nobody on duty.</p>

      <AssignmentPicker
        class="mt-2"
        :candidates="dungeon.unassignedMinions"
        :min-threat-level="sector.minThreatLevel"
        :label="`Assign a minion to ${sector.name}, ${shift} shift`"
        @assign="assign($event, shift)"
      />
    </section>

    <p v-if="refusal" class="mt-4 text-xs text-blood-300" role="alert">{{ refusal }}</p>
  </article>
</template>
