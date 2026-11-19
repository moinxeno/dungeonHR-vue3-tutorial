<script setup lang="ts">
import { useRoute, type RouteLocationRaw, type RouteMeta } from 'vue-router'

type Section = NonNullable<RouteMeta['section']>

const NAV_ITEMS: { section: Section; label: string; to: RouteLocationRaw }[] = [
  { section: 'roster', label: 'Roster', to: { name: 'roster' } },
  { section: 'sectors', label: 'Sectors', to: { name: 'sectors' } },
  { section: 'requests', label: 'Requests', to: { name: 'requests' } },
]

// The current route, reactive: it updates on every navigation.
const route = useRoute()
</script>

<template>
  <nav aria-label="Main">
    <ul class="flex flex-wrap gap-1">
      <li v-for="item in NAV_ITEMS" :key="item.section">
        <!--
          We highlight by `meta.section` instead of RouterLink's built-in active classes, so that
          "Roster" stays highlighted on a minion's profile page (/minion/:id), which is not nested
          under /roster.
        -->
        <RouterLink
          :to="item.to"
          class="block rounded-lg px-3 py-2 text-sm font-semibold transition-colors"
          :class="
            route.meta.section === item.section
              ? 'bg-crypt-800 text-ember-300'
              : 'text-crypt-300 hover:bg-crypt-900 hover:text-crypt-100'
          "
        >
          {{ item.label }}
        </RouterLink>
      </li>
    </ul>
  </nav>
</template>
