<script setup lang="ts">
type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'accent'

// `tone` is optional. The default value in the destructuring pattern applies whenever the parent
// does not pass the prop.
const { tone = 'neutral' } = defineProps<{
  tone?: BadgeTone
}>()

// Complete class names only: Tailwind scans source files as text and cannot see class names that
// are assembled at runtime (such as `bg-${color}-500`).
const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'border-crypt-600 bg-crypt-800 text-crypt-200',
  success: 'border-ichor-600/50 bg-ichor-500/10 text-ichor-300',
  warning: 'border-gold-500/50 bg-gold-400/10 text-gold-300',
  danger: 'border-blood-600/60 bg-blood-500/10 text-blood-300',
  accent: 'border-ember-600/60 bg-ember-500/10 text-ember-300',
}
</script>

<template>
  <span
    class="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap"
    :class="TONE_CLASSES[tone]"
  >
    <!-- Whatever the parent writes between <BaseBadge> and </BaseBadge> is rendered here. -->
    <slot />
  </span>
</template>
