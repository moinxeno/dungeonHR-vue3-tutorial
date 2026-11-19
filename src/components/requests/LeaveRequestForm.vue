<script setup lang="ts">
import { computed, ref } from 'vue'

import BaseButton from '@/components/ui/BaseButton.vue'
import FormField from '@/components/ui/FormField.vue'
import { REQUEST_TYPE_PROFILES } from '@/data/requestTypes'
import { SPECIES_PROFILES } from '@/data/species'
import {
  REQUEST_TYPES,
  SHIFTS,
  type FieldErrors,
  type IsoDate,
  type LeaveRequestDraft,
  type Minion,
  type MinionId,
  type RequestType,
  type Shift,
} from '@/types/dungeon'
import { formatDate, toIsoDate } from '@/utils/date'
import { nextFullMoon } from '@/utils/moonPhase'
import { REQUEST_NOTE_MAX_LENGTH, validateLeaveRequest } from '@/utils/validation'

const { minions, preselectedMinionId } = defineProps<{
  /** Everyone who may file a request. */
  minions: readonly Minion[]
  /** Pre-selects the applicant, e.g. when arriving from a minion's profile page. */
  preselectedMinionId?: MinionId
}>()

const emit = defineEmits<{
  submit: [draft: LeaveRequestDraft]
}>()

/**
 * The form keeps one flat object with the fields of every request type, so switching the type
 * never throws away what the user already typed. `toDraft` turns it into a correctly shaped draft.
 */
interface FormState {
  type: RequestType
  minionId: MinionId
  note: string
  startDate: IsoDate
  endDate: IsoDate
  fullMoonDate: IsoDate
  date: IsoDate
  fromShift: Shift
  toShift: Shift
  swapPartnerId: MinionId | null
}

const today = toIsoDate(new Date())
const upcomingFullMoon = nextFullMoon(today)

function createInitialState(): FormState {
  return {
    type: 'vacation',
    minionId: preselectedMinionId ?? '',
    note: '',
    startDate: '',
    endDate: '',
    fullMoonDate: '',
    date: '',
    fromShift: 'dawn',
    toShift: 'dusk',
    swapPartnerId: null,
  }
}

/** Builds the draft for the selected type. Each branch returns exactly that type's fields. */
function toDraft(state: FormState): LeaveRequestDraft {
  const common = { minionId: state.minionId, note: state.note.trim() }
  switch (state.type) {
    case 'vacation':
      return { ...common, type: 'vacation', startDate: state.startDate, endDate: state.endDate }
    case 'full-moon-leave':
      return { ...common, type: 'full-moon-leave', fullMoonDate: state.fullMoonDate }
    case 'shift-swap':
      return {
        ...common,
        type: 'shift-swap',
        date: state.date,
        fromShift: state.fromShift,
        toShift: state.toShift,
        swapPartnerId: state.swapPartnerId,
      }
  }
}

const form = ref<FormState>(createInitialState())

const draft = computed(() => toDraft(form.value))
const applicant = computed(() => minions.find((minion) => minion.id === form.value.minionId))
const swapPartners = computed(() => minions.filter((minion) => minion.id !== form.value.minionId))

const hasAttemptedSubmit = ref(false)
const validation = computed(() =>
  validateLeaveRequest(draft.value, { applicant: applicant.value, today }),
)
const errors = computed<FieldErrors<LeaveRequestDraft>>(() =>
  hasAttemptedSubmit.value ? validation.value.errors : {},
)

function handleSubmit(): void {
  hasAttemptedSubmit.value = true
  if (!validation.value.valid) return

  emit('submit', draft.value)

  form.value = createInitialState()
  hasAttemptedSubmit.value = false
}
</script>

<template>
  <form
    class="rounded-2xl border border-ember-700/40 bg-crypt-900/80 p-5 shadow-lg shadow-black/40 sm:p-6"
    novalidate
    @submit.prevent="handleSubmit"
  >
    <h2 class="text-lg font-semibold text-crypt-50">File a request</h2>

    <fieldset class="mt-5">
      <legend class="text-sm font-medium text-crypt-200">Request type</legend>
      <div class="mt-2 grid gap-2">
        <label
          v-for="type in REQUEST_TYPES"
          :key="type"
          class="flex cursor-pointer items-start gap-3 rounded-xl border border-crypt-700 p-3 transition-colors has-checked:border-ember-500 has-checked:bg-ember-500/10"
        >
          <input v-model="form.type" type="radio" :value="type" class="mt-1 accent-ember-500" />
          <span>
            <span class="block text-sm font-semibold text-crypt-50">
              {{ REQUEST_TYPE_PROFILES[type].icon }} {{ REQUEST_TYPE_PROFILES[type].label }}
            </span>
            <span class="block text-xs text-crypt-400">
              {{ REQUEST_TYPE_PROFILES[type].description }}
            </span>
          </span>
        </label>
      </div>
    </fieldset>

    <div class="mt-5 grid gap-5 sm:grid-cols-2">
      <FormField
        v-slot="{ id, invalid, describedBy }"
        label="Minion"
        :error="errors.minionId"
        required
        class="sm:col-span-2"
      >
        <select
          :id="id"
          v-model="form.minionId"
          class="form-control"
          :aria-invalid="invalid"
          :aria-describedby="describedBy"
        >
          <option value="" disabled>Choose a minion…</option>
          <option v-for="minion in minions" :key="minion.id" :value="minion.id">
            {{ SPECIES_PROFILES[minion.species].icon }} {{ minion.name }}
          </option>
        </select>
      </FormField>

      <!-- Only the fields of the selected request type are rendered. -->
      <template v-if="form.type === 'vacation'">
        <FormField
          v-slot="{ id, invalid, describedBy }"
          label="First day"
          :error="errors.startDate"
          required
        >
          <input
            :id="id"
            v-model="form.startDate"
            type="date"
            :min="today"
            class="form-control"
            :aria-invalid="invalid"
            :aria-describedby="describedBy"
          />
        </FormField>
        <FormField
          v-slot="{ id, invalid, describedBy }"
          label="Last day"
          :error="errors.endDate"
          required
        >
          <input
            :id="id"
            v-model="form.endDate"
            type="date"
            :min="form.startDate || today"
            class="form-control"
            :aria-invalid="invalid"
            :aria-describedby="describedBy"
          />
        </FormField>
      </template>

      <template v-else-if="form.type === 'full-moon-leave'">
        <FormField
          v-slot="{ id, invalid, describedBy }"
          label="Night of the full moon"
          :hint="`The next full moon is on ${formatDate(upcomingFullMoon)}.`"
          :error="errors.fullMoonDate"
          required
        >
          <input
            :id="id"
            v-model="form.fullMoonDate"
            type="date"
            :min="today"
            class="form-control"
            :aria-invalid="invalid"
            :aria-describedby="describedBy"
          />
        </FormField>
        <div class="flex items-end pb-1">
          <BaseButton size="sm" @click="form.fullMoonDate = upcomingFullMoon">
            Use {{ formatDate(upcomingFullMoon) }}
          </BaseButton>
        </div>
      </template>

      <template v-else>
        <FormField
          v-slot="{ id, invalid, describedBy }"
          label="Date of the shift"
          :error="errors.date"
          required
        >
          <input
            :id="id"
            v-model="form.date"
            type="date"
            :min="today"
            class="form-control"
            :aria-invalid="invalid"
            :aria-describedby="describedBy"
          />
        </FormField>
        <FormField
          v-slot="{ id, invalid, describedBy }"
          label="Covering colleague"
          :error="errors.swapPartnerId"
        >
          <select
            :id="id"
            v-model="form.swapPartnerId"
            class="form-control"
            :aria-invalid="invalid"
            :aria-describedby="describedBy"
          >
            <option :value="null">Nobody yet</option>
            <option v-for="partner in swapPartners" :key="partner.id" :value="partner.id">
              {{ partner.name }}
            </option>
          </select>
        </FormField>
        <FormField
          v-slot="{ id, invalid, describedBy }"
          label="Current shift"
          :error="errors.fromShift"
          required
        >
          <select
            :id="id"
            v-model="form.fromShift"
            class="form-control capitalize"
            :aria-invalid="invalid"
            :aria-describedby="describedBy"
          >
            <option v-for="shift in SHIFTS" :key="shift" :value="shift">{{ shift }}</option>
          </select>
        </FormField>
        <FormField
          v-slot="{ id, invalid, describedBy }"
          label="Desired shift"
          :error="errors.toShift"
          required
        >
          <select
            :id="id"
            v-model="form.toShift"
            class="form-control capitalize"
            :aria-invalid="invalid"
            :aria-describedby="describedBy"
          >
            <option v-for="shift in SHIFTS" :key="shift" :value="shift">{{ shift }}</option>
          </select>
        </FormField>
      </template>

      <FormField
        v-slot="{ id, invalid, describedBy }"
        label="Note for HR"
        :hint="`Optional. Up to ${REQUEST_NOTE_MAX_LENGTH} characters.`"
        :error="errors.note"
        class="sm:col-span-2"
      >
        <textarea
          :id="id"
          v-model="form.note"
          rows="3"
          class="form-control resize-y"
          :aria-invalid="invalid"
          :aria-describedby="describedBy"
        ></textarea>
      </FormField>
    </div>

    <div class="mt-6 flex justify-end">
      <BaseButton type="submit" variant="primary">Submit request</BaseButton>
    </div>
  </form>
</template>
