<script setup lang="ts">
import { computed } from 'vue'

import { useShiftClock } from '@/composables/useShiftClock'

const { clockTime, currentShift, nextShift, minutesUntilNextShift, daysUntilFullMoon } =
  useShiftClock()

const shiftChangeLabel = computed(() => {
  const hours = Math.floor(minutesUntilNextShift.value / 60)
  const minutes = minutesUntilNextShift.value % 60
  return hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`
})

const fullMoonLabel = computed(() => {
  if (daysUntilFullMoon.value === 0) return 'Full moon tonight'
  if (daysUntilFullMoon.value === 1) return 'Full moon tomorrow'
  return `Full moon in ${daysUntilFullMoon.value} days`
})
</script>

<template>
  <!-- No aria-live here: announcing the time every second would be unbearable. -->
  <div class="text-xs leading-relaxed text-crypt-400">
    <p>
      <time class="font-semibold text-crypt-100 tabular-nums">{{ clockTime }}</time>
      · <span class="font-semibold text-ember-300 capitalize">{{ currentShift }}</span> shift on
      duty
    </p>
    <p>
      <span class="capitalize">{{ nextShift }}</span> in {{ shiftChangeLabel }} ·
      <span aria-hidden="true">🌕</span> {{ fullMoonLabel }}
    </p>
  </div>
</template>
