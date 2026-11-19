# Chapter 6: Composables and Persistence

The dungeon finally has a single source of truth, but it has the memory of a goldfish: reload the
page and every recruit, assignment and approval is gone. And the most important rules in the app,
the ones that decide which alerts the monitor shows, are buried in the middle of a 330-line store.

In this chapter you extract reusable logic into **composables**: one that saves any ref to
`localStorage`, one that turns the alert rules into a reusable, testable unit, and one that runs a
live shift clock in the header. Along the way you meet the component lifecycle, template refs and
`watch`.

**You will:**

- understand what a composable is and how it differs from a utility function and a component,
- write `useLocalStorage`, a ref that persists itself and syncs across browser tabs,
- persist the Pinia stores by swapping `ref` for `useLocalStorage`,
- extract the alert rules into a pure function plus a reactive composable that accepts refs, getters
  or plain values,
- write `useShiftClock`, which starts a timer when a component mounts and stops it when it unmounts,
- focus an input on mount with a template ref,
- react to a changing prop with `watch`,
- add a "Reset demo data" button.

**Start from:** branch `step-05-pinia-state-management` · **Reference solution:** branch
`step-06-composables-and-persistence` · **Time:** about 90 minutes.

**Concept guide:** [Composables and lifecycle](../concepts/08-composables-and-lifecycle.md) covers
the conventions behind composables, the lifecycle of a component, effect scopes and cleanup, and when
to use `watch`, `watchEffect` or `computed`.

```bash
git switch -c my-step-06 step-05-pinia-state-management
```

```bash
npm run dev
```

---

## 1. What is a composable?

You have already used several composables without writing one: `useRoute()`, `useRouter()`,
`useId()`, and every Pinia store's `use…Store()`. A **composable** is a function that uses Vue's
Composition API (`ref`, `computed`, `watch`, lifecycle hooks) to encapsulate and reuse **stateful
logic**.

Three kinds of reuse, side by side:

| | Utility function | Composable | Component |
| --- | --- | --- | --- |
| Example | `formatGold(1500)` | `useShiftClock()` | `<StatBar>` |
| Contains | Pure logic | State, reactivity, lifecycle | Markup, styles, and logic |
| Returns | A value | Refs and functions | Rendered UI |
| Called from | Anywhere | `<script setup>`, stores, other composables | Templates |

The rule of thumb: if the logic needs **reactivity or lifecycle**, but no **markup**, it is a
composable. If it needs neither, it is a utility function. If it renders something, it is a component.

Conventions you will see in every composable:

- The name starts with `use`.
- It is called synchronously at the top of `<script setup>`, a setup store, or another composable.
- It returns a plain object of refs and functions, so callers can destructure what they need.
- It cleans up after itself: timers, listeners, subscriptions.

## 2. `useLocalStorage`: a ref that remembers

Create `src/composables/useLocalStorage.ts`:

```ts
import { onScopeDispose, ref, watch, type Ref } from 'vue'

/**
 * What we actually write to localStorage. The version lets us throw away data that was saved by an
 * older version of the app with a different shape, instead of loading it and crashing.
 */
interface StoredEnvelope<T> {
  version: number
  data: T
}

export interface UseLocalStorageOptions {
  /** Bump this when the shape of the stored data changes. Older data is then ignored. */
  version?: number
}

/**
 * A ref that is saved to `localStorage` whenever it changes, and restored from it on startup.
 *
 * - Works in components and in Pinia setup stores: it only needs an active effect scope.
 * - Keeps several open tabs in sync through the browser's `storage` event.
 * - Never throws. If storage is unavailable (private mode, blocked cookies, quota exceeded), the
 *   ref simply behaves like a normal, unsaved ref.
 *
 * @param key Where to save the value. Prefix it with the app's name to avoid collisions.
 * @param initialValue Used when nothing valid is stored yet.
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T,
  { version = 1 }: UseLocalStorageOptions = {},
): Ref<T> {
  function read(): T {
    try {
      const raw = localStorage.getItem(key)
      if (raw === null) return initialValue
      const stored = JSON.parse(raw) as Partial<StoredEnvelope<T>>
      return stored.version === version && 'data' in stored ? (stored.data as T) : initialValue
    } catch {
      // Unreadable storage or malformed JSON: start fresh rather than break the app.
      return initialValue
    }
  }

  function write(value: T): void {
    try {
      const envelope: StoredEnvelope<T> = { version, data: value }
      localStorage.setItem(key, JSON.stringify(envelope))
    } catch {
      // Storage full or unavailable. The app keeps working; changes just are not saved.
    }
  }

  // `ref` would type the value as `UnwrapRef<T>`, which differs from `T` for nested refs. Our data
  // is plain JSON, so the two are the same, and the cast keeps the signature simple.
  const state = ref(read()) as Ref<T>

  // `deep: true`: also save when something inside changes, e.g. `minions.value[0].hp = 3`.
  watch(state, write, { deep: true })

  // Another tab saved a new value for our key: load it, so all tabs show the same dungeon.
  function onStorage(event: StorageEvent): void {
    if (event.storageArea === localStorage && event.key === key) {
      state.value = read()
    }
  }
  window.addEventListener('storage', onStorage)

  // Remove the listener when whoever created this ref goes away: a component that unmounts, or
  // a store that is disposed. `onScopeDispose` works for both, unlike `onUnmounted`.
  onScopeDispose(() => window.removeEventListener('storage', onStorage))

  return state
}
```

How it works, top to bottom:

**Reading once, on creation.** `read()` loads the saved value for the key. If nothing is saved, the
JSON is broken, the version does not match, or storage is not accessible at all, it falls back to
`initialValue`. `localStorage` can throw: in some private-browsing modes and when the user blocks site
data, even `getItem` fails. A storage problem should never take the app down.

**The envelope.** Instead of the raw value, the composable saves `{ version, data }`. When a future
release changes the shape of the data (say, minions get a new required field), you bump `version`, and
old saved data is ignored instead of loaded into code that cannot handle it.

**Writing on every change.** `watch(state, write, { deep: true })` calls `write` whenever the value
changes. `deep: true` matters: the store does not only replace arrays (`minions.value = …`), it also
changes objects inside them (`minion.hp = 3`). A shallow watcher would only notice the replacements.

**Cross-tab sync.** When another tab writes to `localStorage`, the browser fires a `storage` event in
every _other_ tab of the same site. The listener reloads the value, so two open tabs always show the
same dungeon. (The event never fires in the tab that made the change, so there is no ping-pong.)

**Cleanup with `onScopeDispose`.** An event listener on `window` outlives everything unless someone
removes it. `onScopeDispose` registers a cleanup callback on the current **effect scope**: the scope of
the component or store that called `useLocalStorage`. When that component unmounts, or that store is
disposed, the listener is removed. `onUnmounted` would only work inside components; `onScopeDispose`
works anywhere reactivity does, which includes Pinia stores.

**Why not `JSON.stringify` the store directly?** You could subscribe to the whole store and save it in
one go. Making persistence a property of individual refs keeps the decision explicit, right where the
state is declared, and lets each piece choose its own key and version.

## 3. Persist the stores

In the dungeon store, replace the `ref`s for minions and assignments with `useLocalStorage`. Because
the composable returns an ordinary ref, nothing else in the store has to change. While you are there,
the alert logic moves out (section 4) and a `resetToSeed` action arrives. Replace
`src/stores/dungeon.ts`:

```ts
import { acceptHMRUpdate, defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { useAggroCalculator } from '@/composables/useAggroCalculator'
import { useLocalStorage } from '@/composables/useLocalStorage'
import { seedAssignments } from '@/data/seedAssignments'
import { seedMinions } from '@/data/seedMinions'
import { seedSectors } from '@/data/seedSectors'
import type {
  Assignment,
  DungeonSector,
  Gold,
  Minion,
  MinionDraft,
  MinionId,
  SectorId,
  Shift,
} from '@/types/dungeon'
import { toIsoDate } from '@/utils/date'
import { createId } from '@/utils/id'

/** How much stress a rest removes. */
export const REST_STRESS_RELIEF = 25

/** The outcome of an action that the store may refuse, with a reason the UI can show. */
export type ActionResult = { ok: true } | { ok: false; reason: string }

/** Key for one sector-and-shift slot, e.g. `"s-gatehouse:midnight"`. */
function slotKey(sectorId: SectorId, shift: Shift): string {
  return `${sectorId}:${shift}`
}

/** Random integer between `min` and `max`, both inclusive. */
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/**
 * The dungeon's single source of truth: who works here, where, and what is going wrong.
 *
 * This is a "setup store". The function body works exactly like `<script setup>`: `ref` is state,
 * `computed` is a getter, a function is an action. Whatever the function returns is the store's
 * public API. The function runs once per app, the first time any component calls
 * `useDungeonStore()`, and the store lives on until the app is closed.
 */
export const useDungeonStore = defineStore('dungeon', () => {
  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  // Minions and assignments change while the app runs, so they are saved in the browser and
  // restored on the next visit. `useLocalStorage` returns a ref, so the rest of the store does not
  // care whether a piece of state is persisted or not.
  const minions = useLocalStorage<Minion[]>('dungeonhr:minions', structuredClone(seedMinions))
  const assignments = useLocalStorage<Assignment[]>(
    'dungeonhr:assignments',
    structuredClone(seedAssignments),
  )
  // Sectors never change at runtime. Not persisting them means an update to the seed data reaches
  // every user immediately.
  const sectors = ref<DungeonSector[]>(structuredClone(seedSectors))

  // -------------------------------------------------------------------------
  // Getters
  // -------------------------------------------------------------------------

  // Lookup tables. They are not returned, so they are private to the store. Rebuilding them is
  // cheap, and `computed` only does it when the underlying arrays change.
  const minionsById = computed(() => new Map(minions.value.map((minion) => [minion.id, minion])))
  const sectorsById = computed(() => new Map(sectors.value.map((sector) => [sector.id, sector])))
  const assignmentsByMinion = computed(
    () => new Map(assignments.value.map((assignment) => [assignment.minionId, assignment])),
  )

  /** Who works where: one list of minions per sector-and-shift slot. */
  const crewsBySlot = computed(() => {
    const crews = new Map<string, Minion[]>()
    for (const assignment of assignments.value) {
      const minion = minionsById.value.get(assignment.minionId)
      if (!minion) continue
      const key = slotKey(assignment.sectorId, assignment.shift)
      crews.set(key, [...(crews.get(key) ?? []), minion])
    }
    return crews
  })

  const payrollBySector = computed(() => {
    const totals = new Map<SectorId, Gold>()
    for (const assignment of assignments.value) {
      const minion = minionsById.value.get(assignment.minionId)
      if (!minion) continue
      totals.set(assignment.sectorId, (totals.get(assignment.sectorId) ?? 0) + minion.salary)
    }
    return totals
  })

  const unassignedMinions = computed(() =>
    minions.value.filter((minion) => !assignmentsByMinion.value.has(minion.id)),
  )

  const totalPayroll = computed(() => minions.value.reduce((sum, minion) => sum + minion.salary, 0))
  const unionCount = computed(() => minions.value.filter((minion) => minion.isUnionized).length)
  const woundedCount = computed(
    () => minions.value.filter((minion) => minion.hp < minion.maxHp).length,
  )

  /** Everything the Aggro & Burnout Monitor warns about. The rules live in the composable. */
  const { alerts } = useAggroCalculator(minions, sectors, assignments)

  // Getters that take an argument are plain functions. They are not cached themselves, but they
  // read from the cached lookup tables above, so calling them is cheap.
  function getMinion(id: MinionId): Minion | undefined {
    return minionsById.value.get(id)
  }

  function getSector(id: SectorId): DungeonSector | undefined {
    return sectorsById.value.get(id)
  }

  function getAssignment(minionId: MinionId): Assignment | undefined {
    return assignmentsByMinion.value.get(minionId)
  }

  function getCrew(sectorId: SectorId, shift: Shift): readonly Minion[] {
    return crewsBySlot.value.get(slotKey(sectorId, shift)) ?? []
  }

  function getSectorPayroll(sectorId: SectorId): Gold {
    return payrollBySector.value.get(sectorId) ?? 0
  }

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  function recruitMinion(draft: MinionDraft): void {
    minions.value.unshift({
      ...draft,
      id: createId('m'),
      hp: draft.maxHp,
      stress: 0,
      hiredOn: toIsoDate(new Date()),
    })
  }

  function healMinion(id: MinionId): void {
    const minion = getMinion(id)
    if (minion) minion.hp = minion.maxHp
  }

  /** Lowers a minion's stress by `amount`, but never below zero. */
  function relieveStress(id: MinionId, amount: number): void {
    const minion = getMinion(id)
    if (minion) minion.stress = Math.max(0, minion.stress - amount)
  }

  function restMinion(id: MinionId): void {
    const minion = getMinion(id)
    // Knocked-out minions cannot rest; they need the healer first.
    if (!minion || minion.hp === 0) return
    relieveStress(id, REST_STRESS_RELIEF)
  }

  function fireMinion(id: MinionId): ActionResult {
    const minion = getMinion(id)
    if (!minion) return { ok: false, reason: 'HR has no file for this minion.' }
    if (minion.isUnionized) {
      return { ok: false, reason: `${minion.name} is a union member. Firing needs a hearing.` }
    }
    minions.value = minions.value.filter((other) => other.id !== id)
    // A fired minion also leaves their post.
    assignments.value = assignments.value.filter((assignment) => assignment.minionId !== id)
    return { ok: true }
  }

  /** Posts a minion to a sector and shift. A minion who already has a post is moved. */
  function assignMinion(minionId: MinionId, sectorId: SectorId, shift: Shift): ActionResult {
    const minion = getMinion(minionId)
    const sector = getSector(sectorId)
    if (!minion || !sector) return { ok: false, reason: 'Unknown minion or sector.' }

    // The minimum threat level is a hard rule. Capacity and budget are soft: they raise alerts.
    if (minion.threatLevel < sector.minThreatLevel) {
      return {
        ok: false,
        reason: `${minion.name} (threat level ${minion.threatLevel}) is not scary enough for ${sector.name}, which needs level ${sector.minThreatLevel}.`,
      }
    }

    assignments.value = [
      ...assignments.value.filter((assignment) => assignment.minionId !== minionId),
      { minionId, sectorId, shift },
    ]
    return { ok: true }
  }

  function unassignMinion(minionId: MinionId): void {
    assignments.value = assignments.value.filter((assignment) => assignment.minionId !== minionId)
  }

  /** Adventurers storm the dungeon: everyone still standing takes damage and gets more stressed. */
  function simulateRaid(): void {
    for (const minion of minions.value) {
      // Knocked-out minions are out of the fight: no further damage, no further stress.
      if (minion.hp === 0) continue

      const damage = randomInt(0, Math.ceil(minion.maxHp * 0.4))
      minion.hp = Math.max(0, minion.hp - damage)
      minion.stress = Math.min(100, minion.stress + randomInt(5, 15))
    }
  }

  /** The dungeon healer patches everyone up. Stress, sadly, is not covered. */
  function callHealer(): void {
    for (const minion of minions.value) {
      minion.hp = minion.maxHp
    }
  }

  /** Throws away all changes and restores the dungeon as the Dark Lord left it. */
  function resetToSeed(): void {
    minions.value = structuredClone(seedMinions)
    assignments.value = structuredClone(seedAssignments)
  }

  return {
    // State
    minions,
    sectors,
    assignments,
    // Getters
    unassignedMinions,
    totalPayroll,
    unionCount,
    woundedCount,
    alerts,
    getMinion,
    getSector,
    getAssignment,
    getCrew,
    getSectorPayroll,
    // Actions
    recruitMinion,
    healMinion,
    relieveStress,
    restMinion,
    fireMinion,
    assignMinion,
    unassignMinion,
    simulateRaid,
    callHealer,
    resetToSeed,
  }
})

// Keep the store's state when Vite hot-reloads this file during development.
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useDungeonStore, import.meta.hot))
}
```

What changed:

- `minions` and `assignments` are created with `useLocalStorage`. Their keys are prefixed with
  `dungeonhr:`, because `localStorage` is shared by everything running on the same origin.
- `sectors` stays a plain `ref`. Sectors never change at runtime, and not saving them means that an
  update to the seed data reaches every user.
- The 70 lines of alert rules are replaced by one line: `const { alerts } = useAggroCalculator(…)`.
- `resetToSeed` restores the seed data. Assigning new arrays triggers the watchers in
  `useLocalStorage`, which save the reset state.

The requests store gets the same treatment. Replace `src/stores/requests.ts`:

```ts
import { acceptHMRUpdate, defineStore } from 'pinia'
import { computed } from 'vue'

import { useLocalStorage } from '@/composables/useLocalStorage'
import { seedRequests } from '@/data/seedRequests'
import { useDungeonStore } from '@/stores/dungeon'
import type { LeaveRequest, LeaveRequestDraft, RequestId, RequestType } from '@/types/dungeon'
import { createId } from '@/utils/id'

/**
 * How much stress an approved request takes away. Stress never exceeds 100, so a vacation clears
 * it completely. Swapping a shift is a logistics matter, not a rest.
 */
export const STRESS_RELIEF_ON_APPROVAL: Record<RequestType, number> = {
  vacation: 100,
  'full-moon-leave': 40,
  'shift-swap': 0,
}

export const useRequestsStore = defineStore('requests', () => {
  // A store can use other stores. Approving leave changes a minion's stress, and the minions belong
  // to the dungeon store, so we ask the dungeon store to do it.
  const dungeon = useDungeonStore()

  // Saved in the browser, like the dungeon's minions and assignments.
  const requests = useLocalStorage<LeaveRequest[]>(
    'dungeonhr:requests',
    structuredClone(seedRequests),
  )

  const pendingCount = computed(
    () => requests.value.filter((request) => request.status === 'pending').length,
  )

  function submitRequest(draft: LeaveRequestDraft): void {
    requests.value.unshift({
      ...draft,
      id: createId('r'),
      status: 'pending',
      submittedAt: new Date().toISOString(),
    })
  }

  function findPending(id: RequestId): LeaveRequest | undefined {
    const request = requests.value.find((candidate) => candidate.id === id)
    return request?.status === 'pending' ? request : undefined
  }

  function approveRequest(id: RequestId): void {
    const request = findPending(id)
    if (!request) return
    request.status = 'approved'

    const relief = STRESS_RELIEF_ON_APPROVAL[request.type]
    if (relief > 0) dungeon.relieveStress(request.minionId, relief)
  }

  function rejectRequest(id: RequestId): void {
    const request = findPending(id)
    if (request) request.status = 'rejected'
  }

  function resetToSeed(): void {
    requests.value = structuredClone(seedRequests)
  }

  return { requests, pendingCount, submitRequest, approveRequest, rejectRequest, resetToSeed }
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useRequestsStore, import.meta.hot))
}
```

**Composables inside stores.** A setup store runs inside its own effect scope, just like a component's
`<script setup>`. That is why `watch` and `onScopeDispose` inside `useLocalStorage` work here. Lifecycle
hooks such as `onMounted` do **not** work in stores, because a store is not a component and is never
mounted. That is the reason `useLocalStorage` uses `onScopeDispose`.

## 4. `useAggroCalculator`: rules as a reusable unit

Create `src/composables/useAggroCalculator.ts`:

```ts
import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue'

import { INCOMPATIBILITY_RULES } from '@/data/incompatibilityRules'
import {
  SHIFTS,
  type Assignment,
  type DungeonAlert,
  type DungeonSector,
  type Gold,
  type Minion,
  type Severity,
  type Species,
} from '@/types/dungeon'
import { formatGold } from '@/utils/gold'

/** Stress at which the burnout monitor warns, and at which it gets loud. */
export const BURNOUT_WARNING_STRESS = 70
export const BURNOUT_CRITICAL_STRESS = 90
/** A payroll above this share of the budget is critical rather than just a warning. */
export const BUDGET_CRITICAL_RATIO = 1.25

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, warning: 1, info: 2 }

/** The rule that forbids these two species from working together, if any. Order does not matter. */
function findIncompatibility(first: Species, second: Species) {
  return INCOMPATIBILITY_RULES.find(
    ({ between: [a, b] }) => (a === first && b === second) || (a === second && b === first),
  )
}

/**
 * Finds everything the Aggro & Burnout Monitor should warn about, most severe first.
 *
 * A plain function: data in, data out, no Vue involved. That makes the dungeon's rules easy to
 * test and reusable anywhere, with or without reactivity.
 */
export function calculateAlerts(
  minions: readonly Minion[],
  sectors: readonly DungeonSector[],
  assignments: readonly Assignment[],
): DungeonAlert[] {
  const minionsById = new Map(minions.map((minion) => [minion.id, minion]))
  const found: DungeonAlert[] = []

  for (const sector of sectors) {
    const posted = assignments.filter((assignment) => assignment.sectorId === sector.id)

    for (const shift of SHIFTS) {
      const crew = posted
        .filter((assignment) => assignment.shift === shift)
        .map((assignment) => minionsById.get(assignment.minionId))
        .filter((minion): minion is Minion => minion !== undefined)

      if (crew.length > sector.capacity) {
        found.push({
          kind: 'over-capacity',
          id: `over-capacity:${sector.id}:${shift}`,
          severity: 'warning',
          message: `${sector.name} has ${crew.length} minions on the ${shift} shift, but only ${sector.capacity} posts.`,
          sectorId: sector.id,
          shift,
          capacity: sector.capacity,
          assigned: crew.length,
        })
      }

      // Check every pair in the crew exactly once.
      crew.forEach((first, index) => {
        for (const second of crew.slice(index + 1)) {
          const rule = findIncompatibility(first.species, second.species)
          if (!rule) continue
          // Sort the IDs so the alert ID does not depend on who was assigned first.
          const pair =
            first.id < second.id
              ? ([first.id, second.id] as const)
              : ([second.id, first.id] as const)
          found.push({
            kind: 'incompatible-species',
            id: `incompatible:${sector.id}:${shift}:${pair[0]}:${pair[1]}`,
            severity: rule.severity,
            message: `${first.name} and ${second.name} share the ${shift} shift at ${sector.name}. ${rule.reason}`,
            sectorId: sector.id,
            shift,
            minionIds: pair,
          })
        }
      })
    }

    const payroll: Gold = posted.reduce(
      (sum, assignment) => sum + (minionsById.get(assignment.minionId)?.salary ?? 0),
      0,
    )
    if (payroll > sector.payrollBudget) {
      found.push({
        kind: 'over-budget',
        id: `over-budget:${sector.id}`,
        severity: payroll > sector.payrollBudget * BUDGET_CRITICAL_RATIO ? 'critical' : 'warning',
        message: `${sector.name} pays ${formatGold(payroll)} a month on a budget of ${formatGold(sector.payrollBudget)}.`,
        sectorId: sector.id,
        budget: sector.payrollBudget,
        payroll,
      })
    }
  }

  for (const minion of minions) {
    if (minion.stress < BURNOUT_WARNING_STRESS) continue
    found.push({
      kind: 'burnout-risk',
      id: `burnout:${minion.id}`,
      severity: minion.stress >= BURNOUT_CRITICAL_STRESS ? 'critical' : 'warning',
      message: `${minion.name} is at ${minion.stress} stress. Time for a rest.`,
      minionId: minion.id,
      stress: minion.stress,
    })
  }

  return found.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
}

/**
 * The reactive version of `calculateAlerts`: alerts that update whenever the inputs change.
 *
 * Each input may be a plain value, a ref, a computed or a getter function (`MaybeRefOrGetter`).
 * `toValue` reads whichever it is. Because it reads inside `computed`, refs and getters are tracked.
 */
export function useAggroCalculator(
  minions: MaybeRefOrGetter<readonly Minion[]>,
  sectors: MaybeRefOrGetter<readonly DungeonSector[]>,
  assignments: MaybeRefOrGetter<readonly Assignment[]>,
): { alerts: ComputedRef<DungeonAlert[]> } {
  const alerts = computed(() =>
    calculateAlerts(toValue(minions), toValue(sectors), toValue(assignments)),
  )
  return { alerts }
}
```

The file has two layers, and the split is the most useful pattern in this chapter:

**`calculateAlerts` is a plain function.** Arrays in, alerts out. It does not import anything from Vue
except types. You can call it from a test with three hand-written arrays, from a Node script, or from
a web worker. It is now the single place that defines what counts as a problem in the dungeon.

It builds its own lookups from the raw arrays instead of using the store's `getCrew` and
`getSectorPayroll`, so it depends on nothing but its arguments. The store keeps its own lookup tables
for the UI; a few lines of overlap are a fair price for a function that stands alone.

**`useAggroCalculator` is the reactive wrapper.** It wraps the call in `computed`, so the alerts update
whenever the inputs change.

**`MaybeRefOrGetter` and `toValue`.** The composable accepts each input as a plain value, a ref, a
computed or a getter function:

```ts
useAggroCalculator(minions, sectors, assignments) // refs, as the store passes them
useAggroCalculator(() => props.minions, sectors, []) // a getter, a ref and a plain value
```

`toValue(x)` returns `x.value` for refs, calls `x()` for functions, and returns plain values as they
are. Called inside `computed`, it reads refs and getters in a tracked way, so the computed updates
when they change. This is the standard way to write composables that are flexible about their inputs.

**Pitfall: passing a value where a ref is needed.** `useAggroCalculator(minions.value, …)` compiles,
because a plain array is a valid `MaybeRefOrGetter`. But it passes the array as it is _now_. When the
store replaces `minions.value` with a new array (as `fireMinion` does), the composable still holds the
old one. Pass the ref, or a getter, whenever the input can change.

## 5. `useShiftClock`: a timer with a lifecycle

The header gets a live clock: the current time, which shift is on duty, how long until the next one,
and how many nights until the full moon (the werewolves keep asking). Create
`src/composables/useShiftClock.ts`:

```ts
import { computed, onMounted, onUnmounted, readonly, ref } from 'vue'

import type { Shift } from '@/types/dungeon'
import { daysBetween, toIsoDate } from '@/utils/date'
import { nextFullMoon } from '@/utils/moonPhase'

/** The local hour at which each shift starts. Midnight runs from 22:00 to 06:00. */
export const SHIFT_START_HOURS: Record<Shift, number> = { dawn: 6, dusk: 14, midnight: 22 }

const NEXT_SHIFT: Record<Shift, Shift> = { dawn: 'dusk', dusk: 'midnight', midnight: 'dawn' }

/** Which shift is on duty at a given moment. */
export function shiftAt(date: Date): Shift {
  const hour = date.getHours()
  if (hour >= SHIFT_START_HOURS.midnight || hour < SHIFT_START_HOURS.dawn) return 'midnight'
  if (hour >= SHIFT_START_HOURS.dusk) return 'dusk'
  return 'dawn'
}

/** Whole minutes from `date` until the next shift starts. */
export function minutesUntilShiftChange(date: Date): number {
  const next = new Date(date)
  next.setHours(SHIFT_START_HOURS[NEXT_SHIFT[shiftAt(date)]], 0, 0, 0)
  // The next start hour may already have passed today (e.g. dawn after midnight): then it is tomorrow.
  if (next <= date) next.setDate(next.getDate() + 1)
  return Math.ceil((next.getTime() - date.getTime()) / 60_000)
}

const timeFormat = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' })

/**
 * A live clock for the dungeon: the current time, the shift on duty, and the next full moon.
 *
 * It uses lifecycle hooks, so call it from a component's `<script setup>`. The timer starts when the
 * component is mounted and is stopped when it is unmounted. Without the cleanup, every component
 * instance that ever used the clock would leave a timer running forever.
 *
 * @param intervalMs How often the clock ticks.
 */
export function useShiftClock(intervalMs = 1000) {
  const now = ref(new Date())
  let timer: ReturnType<typeof setInterval> | undefined

  // Not started during setup: timers belong to a component that is actually on screen. (During
  // server-side rendering, `onMounted` never runs, so no timer leaks on the server either.)
  onMounted(() => {
    timer = setInterval(() => {
      now.value = new Date()
    }, intervalMs)
  })

  onUnmounted(() => {
    clearInterval(timer)
  })

  const currentShift = computed(() => shiftAt(now.value))
  const nextShift = computed(() => NEXT_SHIFT[currentShift.value])
  const minutesUntilNextShift = computed(() => minutesUntilShiftChange(now.value))
  const clockTime = computed(() => timeFormat.format(now.value))

  // `today` only changes once a day, so the moon arithmetic below runs once a day, not every second.
  const today = computed(() => toIsoDate(now.value))
  const daysUntilFullMoon = computed(() => daysBetween(today.value, nextFullMoon(today.value)))

  return {
    // `readonly`: callers may read the time, but setting it is the clock's job.
    now: readonly(now),
    clockTime,
    currentShift,
    nextShift,
    minutesUntilNextShift,
    daysUntilFullMoon,
  }
}
```

**Lifecycle hooks.** `onMounted` runs after the component's DOM has been created and inserted.
`onUnmounted` runs after it has been removed. The clock starts its timer in one and stops it in the
other. Without `clearInterval`, every component that ever used the clock would leave a timer ticking,
updating a ref that nobody displays: a classic memory leak.

**Why start in `onMounted` and not right away?** Code at the top level of a composable runs during
setup, before there is any DOM, and also during server-side rendering, where `onMounted` never runs.
Starting side effects such as timers in `onMounted` ties them to a component that is actually on screen.

Because it uses `onMounted` and `onUnmounted`, this composable only works in components. That is a
deliberate difference from `useLocalStorage`, which also works in stores.

**Pure helpers, exported.** `shiftAt` and `minutesUntilShiftChange` are plain functions of a `Date`.
The composable only adds "now, updated every second". In chapter 7 the helpers can be tested with
fixed dates, without waiting for real time to pass.

**`readonly(now)`** gives callers a read-only view of the ref. They can display the time, but cannot
set it; only the clock's own timer does.

**A cheap chain of computed values.** `now` changes every second, so everything that depends on it is
re-evaluated every second. `today` depends on `now`, but its _value_ only changes at midnight. Vue
compares computed values before notifying dependents, so `daysUntilFullMoon`, which depends on
`today`, recomputes once a day instead of once a second.

Create `src/components/layout/ShiftClock.vue` to display it:

```vue
<script setup lang="ts">
import { computed } from 'vue'

import { useShiftClock } from '@/composables/useShiftClock'

const { clockTime, currentShift, nextShift, minutesUntilNextShift, daysUntilFullMoon } =
  useShiftClock()

const shiftChangeLabel = computed(() => {
  const hours = Math.floor(minutesUntilNextShift.value / 60)
  const minutes = minutesUntilNextShift.value % 60
  return hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`
})

const fullMoonLabel = computed(() => {
  if (daysUntilFullMoon.value === 0) return 'Full moon tonight'
  if (daysUntilFullMoon.value === 1) return 'Full moon tomorrow'
  return `Full moon in ${daysUntilFullMoon.value} days`
})
</script>

<template>
  <!-- No aria-live here: announcing the time every second would be unbearable. -->
  <div class="text-xs leading-relaxed text-crypt-400">
    <p>
      <time class="font-semibold text-crypt-100 tabular-nums">{{ clockTime }}</time>
      · <span class="font-semibold text-ember-300 capitalize">{{ currentShift }}</span> shift on
      duty
    </p>
    <p>
      <span class="capitalize">{{ nextShift }}</span> in {{ shiftChangeLabel }} ·
      <span aria-hidden="true">🌕</span> {{ fullMoonLabel }}
    </p>
  </div>
</template>
```

And add it to `src/components/layout/AppHeader.vue`:

```vue
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
```

The clock is hidden on small screens (`hidden md:block`), where header space is precious.

## 6. Two lifecycle touches

### 6.1 Focus the name field when the recruit form opens

When you click "Recruit a minion", the first thing you will do is type a name. Let the form put the
cursor there. In `src/components/minions/MinionForm.vue`, import two more functions:

```ts
import { computed, onMounted, ref, useTemplateRef } from 'vue'
```

Add this at the end of the `<script setup>` block:

```ts
// A template ref: after mounting, `nameInput.value` is the <input ref="name-input"> element.
const nameInput = useTemplateRef<HTMLInputElement>('name-input')

// The form appears because the user clicked "Recruit a minion", so the obvious next step is typing
// a name. The element only exists in the DOM once the component is mounted, hence `onMounted`.
onMounted(() => {
  nameInput.value?.focus()
})
```

And give the name input a `ref` attribute:

```vue
        <input
          :id="id"
          ref="name-input"
          v-model="draft.name"
          type="text"
          autocomplete="off"
          class="form-control"
          :aria-invalid="invalid"
          :aria-describedby="describedBy"
        />
```

**Template refs** connect a ref in the script to an element in the template. `ref="name-input"` on the
element and `useTemplateRef('name-input')` in the script refer to the same name. The ref is `null` until
the component is mounted, because before that, the element does not exist. That is why the focus call
lives in `onMounted`, and why it uses `?.`.

The form is created with `v-if="isRecruiting"`, so it mounts every time you open it, and the name field
is focused every time.

### 6.2 Follow a changing query in the leave form

Chapter 4 noted a gap in `LeaveRequestForm`: it reads `preselectedMinionId` only when it is created. If
the URL changes from `?minion=m-006` to `?minion=m-012` while the page stays open, the router reuses
the component and the form keeps the old applicant. `watch` closes the gap. Import it in
`src/components/requests/LeaveRequestForm.vue`:

```ts
import { computed, ref, watch } from 'vue'
```

And add the watcher right after `const form = ref<FormState>(createInitialState())`:

```ts
// The route reuses this page when only the query changes, e.g. from `?minion=m-006` to
// `?minion=m-012`. The form state was created from the old value, so follow the prop explicitly.
// The getter `() => preselectedMinionId` is required: a destructured prop passed directly would
// be a one-time snapshot (and the compiler refuses it).
watch(
  () => preselectedMinionId,
  (minionId) => {
    if (minionId) form.value.minionId = minionId
  },
)
```

**`watch` vs `computed`.** `computed` derives a value; `watch` runs a side effect when something
changes. Here we want to _change_ the form state when the prop changes, which is a side effect, so it
is a `watch`. (A computed applicant would be wrong: the user must still be able to pick someone else.)

**The getter.** `watch(() => preselectedMinionId, …)` watches a function that reads the prop. Passing
`preselectedMinionId` directly would hand `watch` the current string, which never changes. Vue's
compiler actually refuses to compile that, as the
[reactivity guide](../concepts/02-reactivity-under-the-hood.md#passing-a-destructured-prop-out-of-the-component)
explains.

## 7. A way back to the beginning

With persistence, mistakes are permanent. HR needs a reset button. Create
`src/components/layout/AppFooter.vue`:

```vue
<script setup lang="ts">
import { ref } from 'vue'

import BaseButton from '@/components/ui/BaseButton.vue'
import { useDungeonStore } from '@/stores/dungeon'
import { useRequestsStore } from '@/stores/requests'

const dungeon = useDungeonStore()
const requests = useRequestsStore()

const isConfirmingReset = ref(false)

function resetDemoData(): void {
  dungeon.resetToSeed()
  requests.resetToSeed()
  isConfirmingReset.value = false
}
</script>

<template>
  <footer class="mt-16 border-t border-crypt-800">
    <div
      class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6 text-sm text-crypt-500 sm:px-6 lg:px-8"
    >
      <p>Changes are saved in this browser. DungeonHR is an open-source Vue 3 tutorial.</p>

      <div v-if="isConfirmingReset" class="flex flex-wrap items-center gap-2">
        <span class="text-blood-300">Restore the original roster, assignments and requests?</span>
        <BaseButton size="sm" variant="danger" @click="resetDemoData">Reset</BaseButton>
        <BaseButton size="sm" variant="ghost" @click="isConfirmingReset = false">Cancel</BaseButton>
      </div>
      <BaseButton v-else size="sm" variant="ghost" @click="isConfirmingReset = true">
        Reset demo data
      </BaseButton>
    </div>
  </footer>
</template>
```

Add the footer to `src/App.vue`:

```vue
<script setup lang="ts">
import AppFooter from '@/components/layout/AppFooter.vue'
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

  <AppFooter />
</template>
```

Reset uses the same two-step confirmation as firing a minion: an accidental click should not throw away
an afternoon of planning.

## 8. Checkpoint

- Recruit a minion and simulate a raid. **Reload the page.** The recruit is still first in the roster,
  and the HP bars still show the raid damage.
- Open the browser's DevTools, go to **Application → Local Storage**, and find three keys:
  `dungeonhr:minions`, `dungeonhr:assignments` and `dungeonhr:requests`. Each holds
  `{"version":1,"data":[…]}`.
- Open DungeonHR in **two tabs**, both on `/sectors`. Remove a minion from a shift in one tab. The other
  tab's planner and monitor update immediately, without a reload.
- The header shows the time, the shift on duty, the time until the next shift, and the days until the
  full moon. Leave it open across a minute boundary and watch it tick over.
- "Recruit a minion" puts the cursor into the name field.
- Click **Reset demo data** in the footer, confirm, and everything is back to the Dark Lord's original
  roster: 12 minions, 4 critical alerts and 5 warnings.
- The alerts are exactly the same as in chapter 5. The rules moved; their behavior did not.

## 9. What is still missing

That last checkpoint deserves a second look. In this chapter you moved 70 lines of business rules
from one file into another and rewired the store around them. How do you _know_ the rules still
behave the same? You clicked through the planner and compared numbers. That works once. It does not
work for every change, every rule and every edge case, in every future chapter.

What is missing is a safety net: tests that check the rules automatically, in seconds, whenever you
change something. The pure functions you extracted in this chapter (`calculateAlerts`, `shiftAt`,
`validateLeaveRequest`, `isFullMoon`) are exactly what makes that easy.
[Chapter 7: Testing and Polish](./07-testing-and-polish.md) adds the test suite.

## 10. Run the quality checks

```bash
npm run type-check
```

```bash
npm run lint
```

```bash
npm run format
```

```bash
npm run build
```

Commit your work:

```bash
git add -A
```

```bash
git commit -m "feat: add composables for persistence, alerts and the shift clock"
```

## 11. Try it yourself

1. **Off-duty recovery.** Minions without a post should recover a little at every shift change. Add a
   `restOffDuty(amount)` action to the dungeon store that relieves stress for every unassigned minion.
   Then, in `ShiftClock.vue`, `watch(currentShift, () => dungeon.restOffDuty(10))`. To test it without
   waiting eight hours, temporarily change `SHIFT_START_HOURS` so a shift starts a minute from now.
2. **Feel the version.** In the dungeon store, pass `{ version: 2 }` as the third argument of the
   `useLocalStorage` call for `dungeonhr:minions`, and reload. Your saved roster is ignored, and the
   seed data appears. This is what protects users when the shape of `Minion` changes. Remove the
   option again before you change anything: the old data is still in storage until the first write
   replaces it with a version 2 envelope.
3. **Leak a timer on purpose.** Remove the `onUnmounted` block from `useShiftClock` and put a
   `<ShiftClock />` into `RosterView`. Add `console.log('tick')` inside the interval. Navigate between
   pages a few times and count the ticks per second. Restore the cleanup.
4. **Write your own composable.** Create `useMediaQuery(query: string)` that returns a ref which is
   `true` while `window.matchMedia(query)` matches, using a `change` listener and `onScopeDispose` for
   cleanup. Use it to show the shift clock on small screens in a compact form.

## Recap

- A **composable** is a `use…` function that bundles reactive state, derived values, side effects and
  cleanup. It returns refs and functions.
- **`useLocalStorage`** shows the full pattern: read on creation, `watch` to write, an event listener
  for outside changes, and `onScopeDispose` for cleanup. Swapping `ref` for it persists any state.
- **Separate pure logic from reactivity:** a plain function holds the rules (`calculateAlerts`), a thin
  composable makes them reactive (`useAggroCalculator`).
- **`MaybeRefOrGetter` + `toValue`** let a composable accept refs, getters and plain values. Pass refs
  or getters for inputs that change.
- **Lifecycle hooks** tie side effects to a component's presence on screen: start in `onMounted`, stop
  in `onUnmounted`. They only work in components; `onScopeDispose` works in stores too.
- **Template refs** (`useTemplateRef`) give you DOM elements after mounting.
- **`watch`** runs side effects when a source changes; watch a destructured prop through a getter.

**Go deeper:** [Composables and lifecycle](../concepts/08-composables-and-lifecycle.md)
