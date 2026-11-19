<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'

import BaseButton from '@/components/ui/BaseButton.vue'

const route = useRoute()
const router = useRouter()

// Vue Router records the previous location in the browser's history state. Without one (the user
// opened a broken link directly), "Go back" would leave the app, so we only offer it when it is safe.
const canGoBack = Boolean(router.options.history.state.back)
</script>

<template>
  <div class="py-16 text-center">
    <p class="text-6xl" aria-hidden="true">🕯️</p>
    <h1 class="mt-6 text-3xl font-bold text-crypt-50">This corridor leads nowhere</h1>
    <p class="mt-3 text-crypt-300">
      There is no page at <span class="font-mono text-crypt-100">{{ route.fullPath }}</span
      >. Perhaps a minotaur moved the door again.
    </p>

    <div class="mt-8 flex flex-wrap justify-center gap-3">
      <BaseButton v-if="canGoBack" @click="router.back()">Go back</BaseButton>
      <RouterLink
        :to="{ name: 'roster' }"
        class="rounded-lg bg-ember-600 px-4 py-2 text-sm font-semibold text-crypt-950 transition-colors hover:bg-ember-500"
      >
        To the roster
      </RouterLink>
    </div>
  </div>
</template>
