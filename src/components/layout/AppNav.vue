<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, type RouteLocationRaw, type RouteMeta } from 'vue-router'

import { useDungeonStore } from '@/stores/dungeon'
import { useRequestsStore } from '@/stores/requests'

type Section = NonNullable<RouteMeta['section']>

interface NavItem {
  section: Section
  label: string
  to: RouteLocationRaw
  /** A number shown next to the label, e.g. open alerts. Hidden when 0. */
  count: number
  /** What the number means, for screen readers. */
  countLabel: string
}

// The current route, reactive: it updates on every navigation.
const route = useRoute()

// The header is on every page, and so are these counters: any component can read any store.
const dungeon = useDungeonStore()
const requests = useRequestsStore()

const navItems = computed<NavItem[]>(() => [
  { section: 'roster', label: 'Roster', to: { name: 'roster' }, count: 0, countLabel: '' },
  {
    section: 'sectors',
    label: 'Sectors',
    to: { name: 'sectors' },
    count: dungeon.alerts.length,
    countLabel: 'open alerts',
  },
  {
    section: 'requests',
    label: 'Requests',
    to: { name: 'requests' },
    count: requests.pendingCount,
    countLabel: 'pending requests',
  },
])
</script>

<template>
  <nav aria-label="Main">
    <ul class="flex flex-wrap gap-1">
      <li v-for="item in navItems" :key="item.section">
        <!--
          We highlight by `meta.section` instead of RouterLink's built-in active classes, so that
          "Roster" stays highlighted on a minion's profile page (/minion/:id), which is not nested
          under /roster.
        -->
        <RouterLink
          :to="item.to"
          class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors"
          :class="
            route.meta.section === item.section
              ? 'bg-crypt-800 text-ember-300'
              : 'text-crypt-300 hover:bg-crypt-900 hover:text-crypt-100'
          "
        >
          {{ item.label }}
          <span
            v-if="item.count > 0"
            class="rounded-full bg-blood-600 px-1.5 py-0.5 text-xs leading-none text-crypt-50 tabular-nums"
          >
            {{ item.count }}
            <span class="sr-only">{{ item.countLabel }}</span>
          </span>
        </RouterLink>
      </li>
    </ul>
  </nav>
</template>
