# Client-Side Routing

> **Used in:** [Chapter 4: Routing and Views](../build/04-routing-and-views.md)

DungeonHR has five "pages", but the browser only ever loaded one HTML file. This guide explains how
a single-page application fakes page loads, what happens between clicking a `RouterLink` and seeing
the new page, and why a few behaviors that look like bugs (a page that does not update, state that
disappears) are direct consequences of the design.

---

## 1. Two ways to build a website with several pages

**A multi-page application (MPA)** is how the web started. Every link is a request to the server,
which answers with a complete HTML document. The browser throws away the current page, JavaScript
state included, and renders the new one.

**A single-page application (SPA)** loads one HTML document and keeps it. When you click a link,
JavaScript intercepts the click, updates the address bar, and replaces part of the page itself.

| | Multi-page app | Single-page app |
| --- | --- | --- |
| Clicking a link | Full request, full page load | JavaScript swaps components |
| JavaScript state | Lost on every navigation | Survives, if it lives outside the swapped components |
| First load | Fast, small page | Larger: the app's code must load first |
| Later navigations | Each one a round trip | Instant, data permitting |
| Works without JavaScript | Yes | No (unless server-rendered) |

Vue works for both, and with server-side rendering (Nuxt) you can combine them. DungeonHR is a
classic SPA, so this guide focuses on that.

## 2. The History API: changing the URL without loading a page

For an SPA to feel like a website, it needs three things: URLs that reflect what you see, a working
back button, and links you can share. Browsers provide the
[History API](https://developer.mozilla.org/en-US/docs/Web/API/History_API) for exactly this:

```ts
// Change the address bar to /sectors and add a history entry. No request is made.
history.pushState(state, '', '/sectors')

// Same, but replace the current entry instead of adding one.
history.replaceState(state, '', '/sectors')

// Fired when the user presses back or forward.
window.addEventListener('popstate', (event) => {
  // The URL has already changed; the app must now render the matching page.
})
```

A router is, at its core, a thin layer around these three calls:

```text
Click on <RouterLink to="/sectors">
  └─▶ preventDefault() on the click (no page load)
  └─▶ router.push('/sectors')
        └─▶ resolve the URL to a route record
        └─▶ run navigation guards, load lazy components
        └─▶ history.pushState(…, '/sectors')
        └─▶ currentRoute.value = new route  ──▶  <RouterView> re-renders

Back button
  └─▶ browser fires popstate (URL already changed)
        └─▶ router resolves the new URL, runs guards
        └─▶ currentRoute.value = new route  ──▶  <RouterView> re-renders
```

### History mode needs the server's help

There is one catch. With `createWebHistory`, a URL such as `https://dungeon.example/minion/m-006` looks
like a real file path. Navigating there _inside_ the app is fine, because no request is made. But
reloading the page, or opening a bookmark, sends a real request for `/minion/m-006` to the server,
which has no such file and answers with a 404.

The fix is a **fallback**: the server answers every path that is not a real file with `index.html`.
The app then starts, the router reads the URL, and renders the profile. Vite's dev server and
`npm run preview` do this automatically. For production you configure it on the host: a rewrite rule
on Netlify or Vercel, `try_files $uri /index.html` on nginx, and so on.

`createWebHashHistory` avoids the problem by putting the route after a `#`:
`https://dungeon.example/#/minion/m-006`. Browsers never send the part after `#` to the server, so the
server always serves `index.html`. It works anywhere, at the cost of uglier URLs.

## 3. From URL to component

### Matching

When you call `createRouter({ routes })`, Vue Router compiles every route path into a matcher, a
regular expression plus a list of parameter names, and sorts the matchers by **specificity**. Static
segments score higher than parameters, and parameters higher than catch-alls:

| Path | Specificity | Matches `/minion/m-006`? |
| --- | --- | --- |
| `/minion/:id` | static + param | Yes, with `{ id: 'm-006' }` |
| `/:pathMatch(.*)*` | catch-all, lowest | Yes, but loses to the route above |

So the order in which you list routes rarely matters. The catch-all wins only when nothing more
specific matches. (We still list it last, for readers.)

### The current route is reactive state

The router keeps the current route in a `shallowRef`. `useRoute()` gives you a reactive view of it,
and `<RouterView>` reads it in its render function. That is why everything route-related "just
updates": it is the same reactivity system as everything else. When the router assigns a new
location, every component that read `route.meta.section` or `route.params` re-renders, and
`<RouterView>` swaps the component if the matched route record changed.

### Params, query and hash

A URL carries information in three places. Use each for what it is good at:

| Part | Example | Use for |
| --- | --- | --- |
| Path params | `/minion/m-006` | The **identity** of the page. Required, part of the route definition. |
| Query | `/requests?minion=m-006` | Optional **view state**: filters, sorting, pre-selections, search terms. |
| Hash | `/help#full-moon-leave` | A position **within** the page. |

Query values deserve a closer look. Because a URL can contain `?minion=a&minion=b` or a bare
`?minion`, Vue Router types `route.query.minion` as `string | null | (string | null)[]`. Always narrow
before use, as the `requests` route does with `typeof route.query.minion === 'string'`.

## 4. Keep views independent of the router

There are two ways for `MinionDetailView` to get its ID:

```ts
// 1. Ask the router
const route = useRoute()
const minion = computed(() => findMinion(route.params.id as string))

// 2. Receive it as a prop (what DungeonHR does, via `props: true` on the route)
const { id } = defineProps<{ id: string }>()
const minion = computed(() => findMinion(id))
```

Both work. The prop version is better for page components:

- **Testable.** Render `<MinionDetailView id="m-006" />` in a test. No router needed.
- **Typed.** `id: string` is declared once. `route.params.id` is `string | string[]` and needs a cast or
  a check.
- **Reusable.** The same view could be shown in a dialog, with an `id` from somewhere else.

`props: true` maps all params to props. A **props function** maps anything: query values, params with
conversion (`Number(route.params.page)`), or static values. Use `useRoute()` directly in components
that genuinely care about the route as such, like `AppNav`, which highlights the current section.

## 5. Component reuse: the classic routing bug

Navigate from `/minion/m-001` to `/minion/m-002`. Both URLs match the same route record, so they map to
the same component. Vue Router (or rather, Vue's renderer) sees "same component type, same position"
and **reuses the existing instance**, only updating its props. That is efficient: no unmount, no
re-mount, no flicker.

The consequence: **`<script setup>` does not run again.** Anything computed once during setup still
refers to the old minion.

```ts
const { id } = defineProps<{ id: string }>()

const staleMinion = seedMinions.find((m) => m.id === id) // ✗ evaluated once: stays m-001
const minion = computed(() => seedMinions.find((m) => m.id === id)) // ✓ re-evaluated when id changes
```

Three ways to handle it, from most to least preferred:

1. **Derive everything reactively** from props or the route (`computed`, as DungeonHR does). The view
   is correct by construction.
2. **React to the change explicitly** when you need side effects, such as loading data from a server:
   `watch(() => id, loadMinion, { immediate: true })` (chapter 6 covers `watch`), or the
   `onBeforeRouteUpdate` hook.
3. **Force a new instance** with `<RouterView :key="route.fullPath" />`. Every URL change then unmounts
   and re-creates the view. Simple, but it throws away all local state and DOM on every navigation,
   which is rarely what you want for a whole app.

## 6. The navigation pipeline and its hooks

A navigation is not instantaneous. Between `router.push()` and the new page, Vue Router runs a
pipeline, and you can hook into most of its steps:

```text
router.push(to)
  1. beforeRouteLeave        in the components being left        (e.g. "unsaved changes?")
  2. beforeEach              global guards                        (e.g. "logged in?")
  3. beforeRouteUpdate       in reused components                 (e.g. load new data)
  4. beforeEnter             in the target route record           (e.g. "does this ID exist?")
  5. resolve lazy components (download the view's chunk)
  6. beforeRouteEnter        in the components being entered
  7. beforeResolve           global, after everything is resolved
  8. ── navigation confirmed: URL and currentRoute updated ──
  9. afterEach               global hooks                         (e.g. document title, analytics)
 10. DOM re-renders          <RouterView> shows the new component
```

Any guard can return `false` to cancel the navigation or a route location to redirect. Guards may be
asynchronous; the navigation waits. DungeonHR uses only `afterEach`, for the tab title. Chapter 4's
"Try it yourself" adds a `beforeEnter` guard as an exercise.

**`router.push` returns a promise.** It resolves when the navigation is done, or with a failure if a
guard cancelled or redirected it. You rarely need it, but it explains why
`await router.push(…)` is a thing.

## 7. `RouterLink` or `router.push`?

`<RouterLink to="/sectors">` renders `<a href="/sectors">` and intercepts plain left clicks. Everything
that makes links useful keeps working: middle-click and Ctrl/Cmd-click open a new tab, right-click
offers "copy link", screen readers announce a link, and the URL shows on hover.

`router.push('/sectors')` is a function call. It has none of those properties.

**Rule:** if the user's action is "go there", render a `RouterLink`, even if it is styled as a button.
Use `router.push` (or `replace`) when navigation is the _result_ of something else: after saving a
form, after a successful login, when a guard redirects. `push` adds a history entry; `replace` does
not, which is right for redirects ("you meant this page").

## 8. Lazy loading and code splitting

```ts
component: () => import('@/views/SectorPlannerView.vue')
```

A static `import` at the top of a file is resolved at build time: the module becomes part of the same
bundle. A dynamic `import()` is a function that returns a promise. Vite sees it and moves the imported
module, and everything only it depends on, into a separate file (a _chunk_). The router calls the
function the first time the route is visited, waits for the download, and caches the result.

Trade-offs:

- **Smaller first load.** Visitors of the roster do not download the request form's code.
- **A short delay on first visit** of a lazy page, usually imperceptible on a fast connection.
- **Rule of thumb:** import the landing page eagerly, lazy-load the rest. For larger apps, lazy-load by
  feature area.

## 9. Accessibility in a single-page app

In an MPA, the browser handles three things on every navigation that an SPA must handle itself:

| On a full page load, the browser… | In DungeonHR |
| --- | --- |
| updates the tab title | `router.afterEach` sets `document.title` from `meta.title` |
| scrolls to the top (or restores the position on back) | `scrollBehavior` |
| moves focus to the top of the new document, so screen readers start reading the new page | **Not handled yet.** Focus stays on the clicked link. |

Focus management is the part most SPAs get wrong. Common approaches: move focus to the new page's
`<h1>` (with `tabindex="-1"`) after each navigation, or announce the new title in a live region. The
skip link in `App.vue` helps keyboard users either way. Libraries exist for this, and so does a small
`afterEach` hook; it is a good exercise.

## 10. Why the roster forgets

Chapter 4 ends with recruits that vanish when you visit another page. In terms of this guide:

1. Navigating from `/roster` to `/sectors` changes the matched route record.
2. `<RouterView>` renders a different component, so Vue **unmounts** `RosterView`.
3. Unmounting destroys the instance, including every `ref` created in its `<script setup>`.
4. Navigating back mounts a **new** `RosterView`, whose setup creates a fresh roster from the seed data.

Vue offers `<KeepAlive>`, which caches unmounted component instances instead of destroying them:

```html
<RouterView v-slot="{ Component }">
  <KeepAlive>
    <component :is="Component" />
  </KeepAlive>
</RouterView>
```

It would keep the roster alive between visits, which is useful for preserving scroll positions or
half-filled forms. But it does not solve the actual problem: the profile page and the requests page
still cannot _see_ the roster. The roster is shared application state, and shared state should not
live inside one page component at all. It needs a home outside the component tree that every page can
reach. That is a store, and it is the subject of [state management with Pinia](./07-state-management-with-pinia.md).

## Summary

| Concept | Key point |
| --- | --- |
| SPA navigation | JavaScript intercepts links, updates the URL with `history.pushState`, and swaps components. |
| History mode | Real-looking URLs; the production server must fall back to `index.html` for unknown paths. |
| Matching | Routes are ranked by specificity; the catch-all only wins when nothing else matches. |
| Current route | Reactive state. `useRoute()` and `<RouterView>` update automatically. |
| Params vs query | Params identify the page; query holds optional view state. Narrow query values before use. |
| Route props | Pass params and query to views as props; views stay testable and router-independent. |
| Component reuse | Same route record, new params: same instance, setup does not re-run. Derive with `computed`. |
| Guards | A pipeline of hooks around each navigation; return `false` or a location to cancel or redirect. |
| Links vs push | Links for "go there"; `push`/`replace` for navigation as a consequence of an action. |
| Lazy routes | `() => import(…)` creates a chunk that loads on first visit. |
| Lost state | Views are unmounted on navigation; shared state needs to live outside components. |

## Check your understanding

1. You deploy DungeonHR to a static file host and everything works, until someone reloads the page on
   `/sectors` and gets the host's 404 page. Why, and what are two ways to fix it?
2. A colleague changes the `minion` route from `props: true` to reading `useRoute().params.id` in
   `MinionDetailView`, and writes `const id = useRoute().params.id as string` at the top of the
   script. Profiles now break when clicking "next". Why, given that `useRoute()` is reactive?

<details>
<summary>Answers</summary>

1. Reloading sends a real request for `/sectors` to the host, which has no file at that path. The SPA
   never gets a chance to start. Fix it by configuring the host to serve `index.html` for all unknown
   paths (a rewrite or fallback rule), or by switching to `createWebHashHistory`, whose URLs
   (`/#/sectors`) always request the root document.
2. `useRoute()` returns a reactive object, but `useRoute().params.id` reads the value **once**, during
   setup, and stores a plain string in `id`. The component is reused on the next navigation, setup does
   not run again, and `id` keeps the old value. Keep the reactive reference and read through it where
   it is needed: `const route = useRoute()` and `computed(() => findMinion(route.params.id as string))`,
   or go back to route props.

</details>

## Further reading

- [Vue Router docs: Getting started](https://router.vuejs.org/guide/)
- [Vue Router docs: Passing props to route components](https://router.vuejs.org/guide/essentials/passing-props.html)
- [Vue Router docs: Navigation guards](https://router.vuejs.org/guide/advanced/navigation-guards.html)
- [Vue Router docs: Different history modes](https://router.vuejs.org/guide/essentials/history-mode.html)
- [MDN: History API](https://developer.mozilla.org/en-US/docs/Web/API/History_API)
