<script setup lang="ts">
import { THREAT_LEVELS, type ThreatLevel } from '@/types/dungeon'

const { level } = defineProps<{
  level: ThreatLevel
}>()
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5"
    role="img"
    :aria-label="`Threat level ${level} of ${THREAT_LEVELS.length}`"
  >
    <!-- One rune per possible level; the first `level` runes are lit. -->
    <span
      v-for="step in THREAT_LEVELS"
      :key="step"
      class="size-2.5 rotate-45 rounded-[2px]"
      :class="step <= level ? 'bg-blood-500 shadow-[0_0_6px] shadow-blood-500/70' : 'bg-crypt-700'"
    ></span>
  </span>
</template>
