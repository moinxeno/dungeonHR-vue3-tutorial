<script setup lang="ts">
import { computed, onMounted, ref, useTemplateRef } from 'vue'

import BaseButton from '@/components/ui/BaseButton.vue'
import FormField from '@/components/ui/FormField.vue'
import { SPECIES_PROFILES } from '@/data/species'
import { SPECIES, THREAT_LEVELS, type FieldErrors, type MinionDraft } from '@/types/dungeon'
import {
  MAX_HP_LIMIT,
  MINION_BIO_MAX_LENGTH,
  SALARY_LIMIT,
  validateMinionDraft,
} from '@/utils/validation'

const { existingNames } = defineProps<{
  /** Names already on the roster, used to reject duplicates. */
  existingNames: readonly string[]
}>()

const emit = defineEmits<{
  /** The user submitted a valid draft. The parent decides what to do with it. */
  submit: [draft: MinionDraft]
  /** The user gave up. The parent decides whether to hide the form. */
  cancel: []
}>()

function createEmptyDraft(): MinionDraft {
  const { baseHp, baseSalary } = SPECIES_PROFILES.goblin
  return {
    name: '',
    species: 'goblin',
    maxHp: baseHp,
    threatLevel: 1,
    salary: baseSalary,
    isUnionized: false,
    bio: '',
  }
}

// The form edits its own private copy of the data. Nothing outside the form sees the half-typed
// draft; the parent only receives a finished, valid one through the `submit` event.
const draft = ref<MinionDraft>(createEmptyDraft())

// Validation runs continuously, but errors are only shown after the first submit attempt, so the
// user is not scolded for an empty name before typing a single letter.
const hasAttemptedSubmit = ref(false)
const validation = computed(() => validateMinionDraft(draft.value, existingNames))
const errors = computed<FieldErrors<MinionDraft>>(() =>
  hasAttemptedSubmit.value ? validation.value.errors : {},
)

/** Picking a species fills in its typical HP and salary. The user can still change both. */
function applySpeciesDefaults(): void {
  const profile = SPECIES_PROFILES[draft.value.species]
  draft.value.maxHp = profile.baseHp
  draft.value.salary = profile.baseSalary
}

function handleSubmit(): void {
  hasAttemptedSubmit.value = true
  if (!validation.value.valid) return

  // Emit a plain copy with tidy text fields. An empty bio is left out instead of stored as ''.
  const { bio, ...fields } = draft.value
  const recruit: MinionDraft = { ...fields, name: fields.name.trim() }
  const trimmedBio = bio?.trim()
  if (trimmedBio) recruit.bio = trimmedBio

  emit('submit', recruit)

  draft.value = createEmptyDraft()
  hasAttemptedSubmit.value = false
}

// A template ref: after mounting, `nameInput.value` is the <input ref="name-input"> element.
const nameInput = useTemplateRef<HTMLInputElement>('name-input')

// The form appears because the user clicked "Recruit a minion", so the obvious next step is typing
// a name. The element only exists in the DOM once the component is mounted, hence `onMounted`.
onMounted(() => {
  nameInput.value?.focus()
})
</script>

<template>
  <form
    class="rounded-2xl border border-ember-700/40 bg-crypt-900/80 p-5 shadow-lg shadow-black/40 sm:p-6"
    novalidate
    @submit.prevent="handleSubmit"
  >
    <h3 class="text-lg font-semibold text-crypt-50">Recruit a minion</h3>
    <p class="mt-1 text-sm text-crypt-400">Fields marked with * are required.</p>

    <div class="mt-5 grid gap-5 sm:grid-cols-2">
      <FormField
        v-slot="{ id, invalid, describedBy }"
        label="Name"
        :error="errors.name"
        required
        class="sm:col-span-2"
      >
        <input
          :id="id"
          ref="name-input"
          v-model="draft.name"
          type="text"
          autocomplete="off"
          class="form-control"
          :aria-invalid="invalid"
          :aria-describedby="describedBy"
        />
      </FormField>

      <FormField
        v-slot="{ id, invalid, describedBy }"
        label="Species"
        :error="errors.species"
        required
      >
        <select
          :id="id"
          v-model="draft.species"
          class="form-control"
          :aria-invalid="invalid"
          :aria-describedby="describedBy"
          @change="applySpeciesDefaults"
        >
          <option v-for="species in SPECIES" :key="species" :value="species">
            {{ SPECIES_PROFILES[species].icon }} {{ SPECIES_PROFILES[species].label }}
          </option>
        </select>
      </FormField>

      <FormField
        v-slot="{ id, invalid, describedBy }"
        label="Threat level"
        :error="errors.threatLevel"
        required
      >
        <select
          :id="id"
          v-model="draft.threatLevel"
          class="form-control"
          :aria-invalid="invalid"
          :aria-describedby="describedBy"
        >
          <option v-for="level in THREAT_LEVELS" :key="level" :value="level">{{ level }}</option>
        </select>
      </FormField>

      <FormField
        v-slot="{ id, invalid, describedBy }"
        label="Max HP"
        hint="Pre-filled for the species. Adjust it for veterans."
        :error="errors.maxHp"
        required
      >
        <input
          :id="id"
          v-model.number="draft.maxHp"
          type="number"
          min="1"
          :max="MAX_HP_LIMIT"
          step="1"
          class="form-control"
          :aria-invalid="invalid"
          :aria-describedby="describedBy"
        />
      </FormField>

      <FormField
        v-slot="{ id, invalid, describedBy }"
        label="Monthly salary (gp)"
        :error="errors.salary"
        required
      >
        <input
          :id="id"
          v-model.number="draft.salary"
          type="number"
          min="0"
          :max="SALARY_LIMIT"
          step="10"
          class="form-control"
          :aria-invalid="invalid"
          :aria-describedby="describedBy"
        />
      </FormField>

      <FormField
        v-slot="{ id, invalid, describedBy }"
        label="Bio"
        :hint="`Optional. Up to ${MINION_BIO_MAX_LENGTH} characters.`"
        :error="errors.bio"
        class="sm:col-span-2"
      >
        <textarea
          :id="id"
          v-model="draft.bio"
          rows="3"
          class="form-control resize-y"
          :aria-invalid="invalid"
          :aria-describedby="describedBy"
        ></textarea>
      </FormField>

      <label class="flex items-center gap-3 text-sm text-crypt-200 sm:col-span-2">
        <input v-model="draft.isUnionized" type="checkbox" class="size-4 accent-ember-500" />
        Member of the minion union
      </label>
    </div>

    <div class="mt-6 flex flex-wrap justify-end gap-3">
      <BaseButton variant="ghost" @click="emit('cancel')">Cancel</BaseButton>
      <BaseButton type="submit" variant="primary">Recruit</BaseButton>
    </div>
  </form>
</template>
