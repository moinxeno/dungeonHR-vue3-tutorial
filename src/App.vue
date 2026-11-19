<script setup lang="ts">
import MinionCard from '@/components/minions/MinionCard.vue'
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
    <header class="mb-10">
      <p class="text-sm font-medium tracking-[0.2em] text-ember-400 uppercase">
        Staff &amp; Resource Portal
      </p>
      <h1 class="mt-2 text-4xl font-bold text-crypt-50 sm:text-5xl">DungeonHR</h1>
      <p class="mt-3 max-w-2xl text-crypt-300">
        The Dark Lord is on sabbatical. Until further notice, all staffing questions go through this
        portal.
      </p>
    </header>

    <main>
      <h2 class="mb-6 text-2xl font-semibold text-crypt-100">Minion Roster</h2>

      <!-- Three cards, but they all show the same goblin. Chapter 2 fixes that with props. -->
      <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <MinionCard />
        <MinionCard />
        <MinionCard />
      </div>
    </main>
  </div>
</template>
