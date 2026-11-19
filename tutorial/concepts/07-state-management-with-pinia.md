# State Management with Pinia

> **Used in:** [Chapter 5: Pinia State Management](../build/05-pinia-state-management.md) and
> chapter 6.

"State management" sounds like a big architectural topic. In Vue it is mostly a small idea with good
tooling around it. This guide shows the small idea first, a store in ten lines of plain Vue, then
explains what Pinia adds on top, how its stores work inside, and how to decide what belongs in a store
and what does not.

---

## 1. The problem: state that several distant components need

Within one component, `ref` and `computed` are all you need. Between a parent and its children,
_props down, events up_ works well. It breaks down when components that are far apart in the tree need
the same data:

```text
App
├── AppHeader
│   └── AppNav ............... needs: alert count, pending requests
└── RouterView
    ├── RosterView ........... needs: minions (read + write)
    ├── MinionDetailView ..... needs: one minion, its assignment
    ├── SectorPlannerView
    │   ├── SectorColumn ×5 .. needs: crews, payroll, unassigned minions (read + write)
    │   └── AggroMonitor ..... needs: alerts
    └── RequestsView ......... needs: requests (read + write), minions
```

The only common ancestor of all these components is `App`. Lifting state there means passing it
through `RouterView` to every page, and through every page to every child that needs it, and passing
events back up the same way. Most components in between would carry data they never use (prop
drilling), and `App` would become a god component.

Vue offers a few ways out:

| Approach | How it works | Good for |
| --- | --- | --- |
| Lifting state | Common ancestor owns it, passes props down | Parent and a few children |
| `provide` / `inject` | An ancestor provides a value; any descendant injects it | Context for a subtree: a theme, a form, a widget library |
| Module-level reactive state | A `reactive` or `ref` exported from a module | Small apps, prototypes |
| A store library (Pinia) | Module-level reactive state, plus structure and tooling | Shared application state |

## 2. A store in ten lines

Here is the core idea, without any library:

```ts
// src/stores/counter.ts: a "store" in plain Vue
import { computed, ref } from 'vue'

const count = ref(0)
const doubled = computed(() => count.value * 2)

function increment(): void {
  count.value++
}

export function useCounter() {
  return { count, doubled, increment }
}
```

That really works. The `ref` is created once, when the module is first imported. Every component that
calls `useCounter()` gets the same `count`. Change it in one component, and every other component that
reads it re-renders, because it is ordinary reactive state, and reactivity does not care where a `ref`
was created.

So a store is not magic. It is **reactive state that lives in a module instead of a component**, which
gives it two properties components do not have:

- **One instance for the whole app**, shared by everyone who imports it.
- **A lifetime independent of components.** It exists before any component mounts and survives every
  unmount. (It does not survive a page reload; nothing in memory does.)

## 3. Why Pinia, then?

If ten lines work, why add a library? Because the ten-line version has gaps that bite as an app grows:

| Concern | Plain module state | Pinia |
| --- | --- | --- |
| Inspecting state | `console.log` | DevTools tab: state, getters, editable values |
| "What changed this?" | Search the code | DevTools timeline of every action and mutation |
| Hot reload during development | State lost or duplicated | `acceptHMRUpdate` keeps state, swaps code |
| Server-side rendering | One module instance shared by **all users** of the server | One store instance per request |
| Tests | State leaks from one test into the next | A fresh Pinia per test (`setActivePinia(createPinia())`) |
| Persistence, undo, logging | Write it yourself for every store | Plugins and `$subscribe` / `$onAction` hooks |
| Conventions | Each developer invents their own | One documented shape: state, getters, actions |

The SSR row is the serious one. On a server, a module is loaded once and then serves every visitor.
Module-level state would be shared between all of them: one user's data in another user's page. Pinia
avoids this by keeping all state inside the Pinia instance created by `createPinia()`, of which there
is one per app (and on a server, one per request), not one per module.

## 4. How a Pinia store works

### `defineStore` defines, `useStore` creates

```ts
export const useDungeonStore = defineStore('dungeon', () => {
  // setup function
})
```

`defineStore` does not run anything. It returns a function. The first call to `useDungeonStore()`
looks up the active Pinia instance (the one installed with `app.use(createPinia())`), sees that no
store with the ID `'dungeon'` exists yet, runs the setup function inside a dedicated effect scope, and
registers the result. Every later call returns the registered store.

Consequences:

- A store that no component ever uses is never created. Its setup function never runs.
- The setup function runs **once per app**, not once per component that uses the store.
- The ID must be unique across the app. It is how the DevTools and plugins identify the store.

### The store is a `reactive` object

Pinia wraps what your setup function returns in `reactive()`. Inside a `reactive` object, refs are
unwrapped automatically. That is why components write `dungeon.minions`, not `dungeon.minions.value`,
while inside the store you write `minions.value`.

It also explains `storeToRefs`. Destructuring a reactive object copies the current values, which
disconnects them:

```ts
const dungeon = useDungeonStore()

const { minions } = dungeon // a plain array, as it was at this moment
const { minions } = storeToRefs(dungeon) // a ref linked to the store's state
const { healMinion } = dungeon // fine: functions do not need to be reactive
```

`storeToRefs` loops over the raw store and creates a ref for every piece of state and every getter,
skipping actions. Use it whenever you destructure state or getters; call actions on the store or
destructure them directly.

### Setup stores and option stores

Pinia supports two syntaxes. DungeonHR uses **setup stores** throughout:

```ts
// Setup store
export const useCounterStore = defineStore('counter', () => {
  const count = ref(0)
  const doubled = computed(() => count.value * 2)
  function increment() {
    count.value++
  }
  return { count, doubled, increment }
})

// Option store: the same store in the options syntax
export const useCounterStore = defineStore('counter', {
  state: () => ({ count: 0 }),
  getters: { doubled: (state) => state.count * 2 },
  actions: {
    increment() {
      this.count++
    },
  },
})
```

| | Setup store | Option store |
| --- | --- | --- |
| Feels like | `<script setup>` | Vue's Options API |
| Private state and helpers | Anything not returned (helper functions, private getters) | Not possible |
| Using composables and other stores | Call them in the setup function | Possible, but awkward |
| `$reset()` | Not available: Pinia cannot know your initial values | Built in: re-runs `state()` |
| TypeScript | Inferred from plain code | Inferred, but `this` typing can be finicky |

One rule for setup stores: **return all state.** Pinia identifies state by looking at the returned refs.
A `ref` you keep private is invisible to the DevTools, to `$subscribe`, to plugins and to SSR
hydration. Private _getters_ and helper functions are fine; DungeonHR's `minionsById` is one.

## 5. State, getters and actions

### State

The raw data, and nothing that can be derived from it. DungeonHR's dungeon store has exactly three
pieces of state: `minions`, `sectors` and `assignments`. Payroll totals, crews, unassigned minions and
alerts are all computed from those three.

Storing derived data as state invites inconsistency: someone updates the minions and forgets the cached
payroll. Computing it makes inconsistency impossible.

### Getters

Getters are `computed` values: cached, lazy, and automatically updated. Two patterns from DungeonHR are
worth naming:

- **Lookup tables as private getters.** `minionsById` turns the array into a `Map` once per change, so
  `getMinion(id)` is a constant-time lookup instead of a search through the array on every call.
- **Getters with arguments are functions.** `computed` cannot take parameters, so `getCrew(sectorId,
  shift)` is a plain function. It is not cached, but it reads from a cached map. Inside a component's
  `computed` or template, its reactive reads are tracked like any other.

### Actions

Actions are functions that change state. Pinia does not technically force you to use them: any
component can write `dungeon.minions[0].hp = 0`, and it will work. Do not do it, for the same reasons a
child component should not mutate its props:

1. **Rules live in one place.** `restMinion` refuses knocked-out minions. A component that writes
   `stress -= 25` itself skips that rule.
2. **Changes are traceable.** The DevTools timeline lists every action call with its arguments.
   Anonymous mutations show up without any context.
3. **The store's API documents what is possible.** Reading the returned actions tells you every way the
   data can change.

Actions can be asynchronous (`async function loadMinions() { … }`), call other actions, and return
values. DungeonHR's `assignMinion` returns an `ActionResult`, so the UI can show why an assignment was
refused while the decision stays in the store.

## 6. Stores that use stores

```ts
export const useRequestsStore = defineStore('requests', () => {
  const dungeon = useDungeonStore()

  function approveRequest(id: RequestId): void {
    // …
    dungeon.relieveStress(request.minionId, relief)
  }

  return { /* … */ }
})
```

Call the other store's `use…` function in the setup function, then use it in getters and actions.

Two guidelines keep this healthy:

- **Ask, do not reach in.** The requests store calls `dungeon.relieveStress(…)` instead of assigning
  `minion.stress` itself. The dungeon store owns minions and keeps its rules ("never below zero").
- **Avoid cycles.** If store A uses store B, and B uses A, both setup functions would need the other to
  exist first. Pinia can cope if neither reads the other's state during setup (only inside getters and
  actions), but a cycle is usually a sign that some state belongs in a third store, or in one of the
  two.

## 7. What belongs in a store?

Not everything. A store is for state that is **shared** or that must **outlive the component** that
shows it. The rest is better kept local, where it is easier to follow and is cleaned up automatically.

| State | Shared? | Must outlive its component? | Where in DungeonHR |
| --- | --- | --- | --- |
| Minions, sectors, assignments | Yes, many pages | Yes | Dungeon store |
| Leave requests | Yes (nav counter, requests page) | Yes | Requests store |
| Alerts | Yes | Derived | Getter in the dungeon store |
| Roster filters | No | No (resetting on navigation is fine) | `RosterView` |
| Recruit form draft | No | No (cancel discards it) | `MinionForm` |
| "Really fire?" confirmation | No | No | `MinionCard` |
| Last assignment refusal | No | No | `SectorColumn` |

Two questions decide it: _Does another component, somewhere else in the tree, need this?_ and _Would
losing it on navigation be a bug?_ If both answers are no, keep it local.

## 8. Connected and presentational components

Once stores exist, every component can use them. That does not mean every component should.

- **Presentational components** get everything through props and report through events. They do not
  know where data comes from: `MinionCard`, `AssignmentPicker`, `StatBar`, `LeaveRequestForm`.
- **Connected components** read from stores and call actions: `SectorColumn`, `AggroMonitor`, `AppNav`,
  and all views.

A healthy app has both. Presentational components are reusable and trivial to test. Connected
components remove plumbing: without a store connection, `SectorPlannerView` would need to hand each
`SectorColumn` five props and handle two kinds of events from five columns.

A useful default: **views are connected; small, generic pieces are presentational; domain sections in
between are connected when the alternative is a long list of props.**

## 9. A store's lifetime, and what comes next

A store lives as long as its Pinia instance, which lives as long as the app. That is why chapter 5's
recruits survive navigation: `RosterView` is destroyed, but the state it displayed was never inside it.

A page reload, however, starts a new app, with a new Pinia instance and fresh stores. To survive that,
state has to be written somewhere outside JavaScript memory, such as `localStorage`, and read back on
startup. Pinia's `$subscribe` method (called on every state change) and its plugin API are made for
that. Chapter 6 takes a more explicit route: a small `useLocalStorage` composable that the stores use
for their state.

## Summary

| Concept | Key point |
| --- | --- |
| Store | Reactive state in a module: one instance per app, outside the component tree. |
| Why Pinia | DevTools, HMR, SSR safety, testability, plugins, and a shared convention. |
| `defineStore` / `use…Store` | Defining is lazy; the first `use…Store()` call runs the setup function once. |
| Store object | A `reactive` wrapper: refs are unwrapped. Use `storeToRefs` to destructure state and getters. |
| Setup stores | Written like `<script setup>`. Return all state; keep helpers and lookup getters private. |
| State vs getters | Store only raw data; derive everything else with `computed`. |
| Actions | The only place that changes state. Enforce rules there; return results when an action can refuse. |
| Store to store | Call the other store's action instead of mutating its state. Avoid cycles. |
| What goes in a store | Shared state, and state that must outlive its component. Everything else stays local. |
| Component roles | Presentational: props and events. Connected: stores. Use both. |

## Check your understanding

1. A colleague proposes moving the roster filters (`search`, `speciesFilter`, `unionOnly`) into the
   dungeon store "so all state is in one place". What would change for users, and would it be an
   improvement?
2. Why does `useDungeonStore()` return the same store in `AppNav`, `RosterView` and every
   `SectorColumn`, while `ref(0)` in `<script setup>` gives every component instance its own state?

<details>
<summary>Answers</summary>

1. The filters would survive navigation: leave the roster with "Union members only" checked, come back,
   and it would still be checked. Whether that is better is a product decision, but it has costs: the
   filters would be visible to every component, show up in the store's API and DevTools, and any future
   persistence would save them too. By default they are page-level UI state with a single user, so
   keeping them local is simpler. If users explicitly want sticky filters, a store (or the URL query)
   is the right place for them.
2. `<script setup>` runs once per component instance, so each instance creates its own `ref`. A store's
   setup function runs once per Pinia instance: the first `useDungeonStore()` call creates the store and
   registers it under its ID, and every later call, from any component, returns that registered
   instance.

</details>

## Further reading

- [Pinia docs: Introduction](https://pinia.vuejs.org/introduction.html)
- [Pinia docs: Defining a store (setup stores)](https://pinia.vuejs.org/core-concepts/#Setup-Stores)
- [Pinia docs: Using a store outside of components](https://pinia.vuejs.org/core-concepts/outside-component-usage.html)
- [Vue docs: State management](https://vuejs.org/guide/scaling-up/state-management.html)
