<script setup lang="ts">
import { ref, useId } from 'vue'

import BaseButton from '@/components/ui/BaseButton.vue'
import { SPECIES_PROFILES } from '@/data/species'
import type { Minion, MinionId, ThreatLevel } from '@/types/dungeon'

// A presentational component: it knows nothing about stores. It gets candidates through props and
// reports the user's choice through an event, so it would work with any data source.
const { candidates, minThreatLevel, label } = defineProps<{
  candidates: readonly Minion[]
  /** Candidates below this level are listed but cannot be picked. */
  minThreatLevel: ThreatLevel
  /** Accessible name of the select, e.g. "Assign a minion to Gatehouse, dusk shift". */
  label: string
}>()

const emit = defineEmits<{
  assign: [minionId: MinionId]
}>()

const id = useId()
const selected = ref<MinionId>('')

function submit(): void {
  if (!selected.value) return
  emit('assign', selected.value)
  selected.value = ''
}
</script>

<template>
  <form class="flex gap-2" @submit.prevent="submit">
    <label :for="id" class="sr-only">{{ label }}</label>
    <select :id="id" v-model="selected" class="form-control py-1.5 text-xs">
      <option value="" disabled>Assign a minion…</option>
      <option
        v-for="candidate in candidates"
        :key="candidate.id"
        :value="candidate.id"
        :disabled="candidate.threatLevel < minThreatLevel"
      >
        {{ SPECIES_PROFILES[candidate.species].icon }} {{ candidate.name }}
        {{ candidate.threatLevel < minThreatLevel ? '(not scary enough)' : '' }}
      </option>
    </select>
    <BaseButton type="submit" size="sm" :disabled="!selected">Assign</BaseButton>
  </form>
</template>
