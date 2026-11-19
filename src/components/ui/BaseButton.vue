<script setup lang="ts">
type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'ghost-danger'
type ButtonSize = 'sm' | 'md'

const {
  variant = 'secondary',
  size = 'md',
  type = 'button',
} = defineProps<{
  variant?: ButtonVariant
  size?: ButtonSize
  /** Defaults to `button`, so a button inside a form never submits it by accident. */
  type?: 'button' | 'submit' | 'reset'
}>()

// `enabled:` limits the hover styles to buttons that are not disabled.
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-ember-600 text-crypt-950 enabled:hover:bg-ember-500',
  secondary:
    'border border-crypt-600 bg-crypt-800 text-crypt-100 enabled:hover:border-crypt-500 enabled:hover:bg-crypt-700',
  danger: 'bg-blood-600 text-crypt-50 enabled:hover:bg-blood-500',
  ghost: 'text-crypt-300 enabled:hover:bg-crypt-800 enabled:hover:text-crypt-100',
  'ghost-danger': 'text-blood-300 enabled:hover:bg-blood-500/10 enabled:hover:text-blood-200',
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
}
</script>

<template>
  <!--
    No click handling in here. A listener such as @click, written on <BaseButton>, is not a declared
    prop or emit, so Vue passes it through to this root <button>, together with attributes like
    `disabled`, `title` or extra classes.
  -->
  <button
    :type="type"
    class="inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40"
    :class="[VARIANT_CLASSES[variant], SIZE_CLASSES[size]]"
  >
    <slot />
  </button>
</template>
