<script setup lang="ts">
import { SPECIES_PROFILES } from '@/data/species'
import { SPECIES, type Species } from '@/types/dungeon'

// Each `defineModel` declares one two-way binding. The parent writes
// `v-model:search="…"`; here, `search` behaves like a ref: reading it returns the parent's value,
// assigning to it asks the parent to update.
const search = defineModel<string>('search', { required: true })
const species = defineModel<Species | 'all'>('species', { required: true })
const unionOnly = defineModel<boolean>('unionOnly', { required: true })
</script>

<template>
  <div
    class="flex flex-wrap items-end gap-4 rounded-xl border border-crypt-800 bg-crypt-900/60 p-4"
    role="search"
  >
    <label class="flex min-w-48 flex-1 flex-col gap-1.5 text-sm font-medium text-crypt-200">
      Search by name
      <input v-model="search" type="search" placeholder="e.g. Grizzle" class="form-control" />
    </label>

    <label class="flex min-w-40 flex-col gap-1.5 text-sm font-medium text-crypt-200">
      Species
      <select v-model="species" class="form-control">
        <option value="all">All species</option>
        <option v-for="option in SPECIES" :key="option" :value="option">
          {{ SPECIES_PROFILES[option].pluralLabel }}
        </option>
      </select>
    </label>

    <label class="flex items-center gap-2 pb-2 text-sm text-crypt-200">
      <input v-model="unionOnly" type="checkbox" class="size-4 accent-ember-500" />
      Union members only
    </label>
  </div>
</template>
