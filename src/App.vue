<script setup lang="ts">
import AppHeader from '@/components/layout/AppHeader.vue'
</script>

<template>
  <!-- Lets keyboard users jump past the navigation, which repeats on every page. -->
  <a
    href="#main"
    class="sr-only rounded-lg bg-ember-600 px-4 py-2 font-semibold text-crypt-950 focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
  >
    Skip to content
  </a>

  <AppHeader />

  <main id="main" class="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
    <!-- The component of the current route is rendered here. -->
    <RouterView />
  </main>
</template>
