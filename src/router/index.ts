import { nextTick } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'

import RosterView from '@/views/RosterView.vue'

// Teach TypeScript which fields our routes put into `meta`. This merges into the router's own
// `RouteMeta` interface ("module augmentation"), so `route.meta.section` is typed everywhere.
declare module 'vue-router' {
  interface RouteMeta {
    /** Shown in the browser tab, followed by "· DungeonHR". */
    title?: string
    /** Which entry of the main navigation to highlight. */
    section?: 'roster' | 'sectors' | 'requests'
  }
}

const router = createRouter({
  // HTML5 history mode: real URLs like /minion/m-001 instead of /#/minion/m-001.
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: { name: 'roster' },
    },
    {
      path: '/roster',
      name: 'roster',
      // The landing page is imported normally, so it is part of the main bundle.
      component: RosterView,
      meta: { title: 'Minion Roster', section: 'roster' },
    },
    {
      path: '/minion/:id',
      name: 'minion',
      // All other pages are loaded on demand: Vite puts each into its own file.
      component: () => import('@/views/MinionDetailView.vue'),
      // Pass the `:id` route parameter to the view as a prop.
      props: true,
      meta: { title: 'Minion Profile', section: 'roster' },
    },
    {
      path: '/sectors',
      name: 'sectors',
      component: () => import('@/views/SectorPlannerView.vue'),
      meta: { title: 'Sector Planner', section: 'sectors' },
    },
    {
      path: '/requests',
      name: 'requests',
      component: () => import('@/views/RequestsView.vue'),
      // Map `?minion=m-006` to a typed prop. Query values can be strings, arrays or null.
      props: (route) => ({
        preselectedMinionId:
          typeof route.query.minion === 'string' ? route.query.minion : undefined,
      }),
      meta: { title: 'Leave Requests', section: 'requests' },
    },
    {
      // Matches everything the routes above did not. Must stay last.
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/views/NotFoundView.vue'),
      meta: { title: 'Page Not Found' },
    },
  ],
  scrollBehavior(_to, _from, savedPosition) {
    // Back and forward restore the previous scroll position; every other navigation starts at the top.
    return savedPosition ?? { top: 0 }
  },
})

router.afterEach((to, from) => {
  document.title = to.meta.title ? `${to.meta.title} · DungeonHR` : 'DungeonHR'

  // Accessibility: a full page load starts reading at the top of the new page. In a single-page app,
  // focus would stay on the link that was clicked, so screen reader users would not notice that the
  // page changed. Move focus to the main content instead, once the new page has rendered.
  // Skipped on the first load (nothing to move from) and when only the query string changes.
  if (from.matched.length === 0 || to.path === from.path) return
  void nextTick(() => document.getElementById('main')?.focus({ preventScroll: true }))
})

export default router
