<script setup lang="ts">
import { computed, useId } from 'vue'

const {
  label,
  error,
  hint,
  required = false,
} = defineProps<{
  label: string
  /** Validation message. When set, the field is marked invalid and the hint is hidden. */
  error?: string
  /** Help text shown below the control while there is no error. */
  hint?: string
  required?: boolean
}>()

// A unique, stable ID per FormField instance, used to connect the label, the control and the
// messages for assistive technology.
const id = useId()
const hintId = `${id}-hint`
const errorId = `${id}-error`

/** The ID of whichever message is currently visible, for the control's `aria-describedby`. */
const describedBy = computed(() => {
  if (error) return errorId
  if (hint) return hintId
  return undefined
})
</script>

<template>
  <div>
    <label :for="id" class="block text-sm font-medium text-crypt-200">
      {{ label }}
      <template v-if="required">
        <span class="text-blood-400" aria-hidden="true">*</span>
        <span class="sr-only">(required)</span>
      </template>
    </label>

    <div class="mt-1.5">
      <!--
        A scoped slot: the parent renders the actual control and receives these values from us,
        so the input can use the same ID as the label above.
      -->
      <slot :id="id" :invalid="Boolean(error)" :described-by="describedBy" />
    </div>

    <p v-if="error" :id="errorId" class="mt-1.5 text-xs text-blood-300">{{ error }}</p>
    <p v-else-if="hint" :id="hintId" class="mt-1.5 text-xs text-crypt-400">{{ hint }}</p>
  </div>
</template>
