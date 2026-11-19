<script setup lang="ts">
import AppNav from '@/components/layout/AppNav.vue'
import ShiftClock from '@/components/layout/ShiftClock.vue'
</script>

<template>
  <header class="border-b border-crypt-800 bg-crypt-950/80 backdrop-blur">
    <div
      class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-8 gap-y-3 px-4 py-4 sm:px-6 lg:px-8"
    >
      <RouterLink :to="{ name: 'roster' }" class="group flex items-center gap-3">
        <img src="/favicon.svg" alt="" class="size-9" />
        <span>
          <span
            class="block font-display text-xl font-bold tracking-wide text-crypt-50 group-hover:text-ember-300"
          >
            DungeonHR
          </span>
          <span class="block text-xs tracking-[0.2em] text-ember-400 uppercase">
            Staff &amp; Resource Portal
          </span>
        </span>
      </RouterLink>

      <ShiftClock class="hidden md:block lg:mr-auto" />

      <AppNav />
    </div>
  </header>
</template>
