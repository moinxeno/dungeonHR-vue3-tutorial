<script setup lang="ts">
import { computed } from 'vue'

type StatBarVariant = 'health' | 'stress'

const {
  label,
  value,
  max,
  variant = 'health',
} = defineProps<{
  label: string
  value: number
  max: number
  /** `health`: a full bar is good. `stress`: a full bar is bad. Controls the bar color. */
  variant?: StatBarVariant
}>()

/** Fill level of the bar, clamped to 0–100. */
const percent = computed(() => {
  if (max <= 0) return 0
  return Math.min(100, Math.max(0, Math.round((value / max) * 100)))
})

/** How good the current value is, from 0 (terrible) to 100 (perfect), regardless of variant. */
const wellbeing = computed(() => (variant === 'health' ? percent.value : 100 - percent.value))

const barClass = computed(() => {
  if (wellbeing.value > 60) return 'bg-ichor-500'
  if (wellbeing.value > 30) return 'bg-gold-400'
  return 'bg-blood-500'
})
</script>

<template>
  <div>
    <div class="flex justify-between text-sm">
      <span class="text-crypt-400">{{ label }}</span>
      <span class="font-medium text-crypt-100 tabular-nums">{{ value }} / {{ max }}</span>
    </div>
    <div
      class="mt-1.5 h-2 overflow-hidden rounded-full bg-crypt-800"
      role="meter"
      :aria-label="label"
      :aria-valuenow="value"
      aria-valuemin="0"
      :aria-valuemax="max"
    >
      <div
        class="h-full rounded-full transition-[width,background-color] duration-500 motion-reduce:transition-none"
        :class="barClass"
        :style="{ width: `${percent}%` }"
      ></div>
    </div>
  </div>
</template>
