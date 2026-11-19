# Chapter 5: Pinia State Management

Chapter 4 ended with a dungeon full of cracks. Recruits vanished when you left the roster, the
profile page could not see raid damage, and approved requests were forgotten. Every page kept its own
copy of the world, and every copy died with its page.

In this chapter DungeonHR gets a single source of truth: two Pinia stores that live outside the
component tree, survive navigation, and can be used from any component. With shared state in place,
the sector planner finally becomes a planner, and the Aggro & Burnout Monitor starts watching over
the whole dungeon.

**You will:**

- install Pinia and create stores with the setup syntax,
- move state, derived data and business rules out of components into a store,
- read stores in components with `storeToRefs`, and call actions directly,
- let one store use another (approving leave lowers a minion's stress),
- compute a list of alerts as a discriminated union from the whole dungeon's state,
- tell connected components from presentational ones, and know when to build which,
- inspect stores in the Vue DevTools.

**Start from:** branch `step-04-routing-and-views` · **Reference solution:** branch
`step-05-pinia-state-management` · **Time:** about 2 hours.

**Concept guide:** [State management with Pinia](../concepts/07-state-management-with-pinia.md)
explains what a store really is (you could write one in ten lines), why Pinia is still worth it, and
how to decide what belongs in a store.

```bash
git switch -c my-step-05 step-04-routing-and-views
```

```bash
npm run dev
```

---

## 1. What a store is

A **store** is reactive state that lives in a JavaScript module instead of inside a component. Because
modules are loaded once, there is exactly one instance of it for the whole app, and every component
that imports it sees the same data.

```text
Before (chapter 4)                         After (chapter 5)

RosterView        MinionDetailView         RosterView   MinionDetailView   SectorPlannerView
 └─ minions        └─ seedMinions             │               │                  │
    (dies on          (never changes)         └───────┬───────┴──────────────────┘
     navigation)                                      ▼
                                            useDungeonStore()  ◀── useRequestsStore()
                                             minions, sectors,      requests
                                             assignments, alerts
```

Nothing about Vue's reactivity changes. A store holds `ref`s and `computed`s like a component does.
The difference is _where_ they live: outside any component, so no component's lifetime limits them.

The rule from [props down, events up](../concepts/04-props-down-events-up.md) still holds, one level
up: the store is the **owner** of the shared data, and its **actions** are the only place where that
data is changed. Components read from the store and ask it for changes.

## 2. Install Pinia

```bash
npm install pinia@4
```

Register it in `src/main.ts`:

```ts
import { createPinia } from 'pinia'
import { createApp } from 'vue'

import '@fontsource/cinzel/600.css'
import '@fontsource/cinzel/700.css'
import './assets/main.css'

import App from './App.vue'
import router from './router'

createApp(App).use(createPinia()).use(router).mount('#app')
```

`createPinia()` creates the container that holds every store's state. Installing it before the router
does not matter for this app, but it is a good habit: route guards that use stores need Pinia to be
installed first.

## 3. The last pieces of the domain model

The planner needs three more concepts: an assignment (which minion works where and when), a rule about
which species clash, and the alerts the monitor raises. With these, `src/types/dungeon.ts` reaches its
final form.

Add the severity type to the primitives section, after `RequestId`:

```ts

/** How loudly the Aggro Monitor shouts about something. */
```

Rename the `Sectors & shifts` section heading to `Sectors, shifts & assignments`, and add the
following after the `Shift` type. It ends with a new section for the monitor:

```ts
/**
 * A minion's posting to a sector and shift.
 * Invariant: each minion holds at most one assignment at a time.
 */
export interface Assignment {
  minionId: MinionId
  sectorId: SectorId
  shift: Shift
}

/**
 * Two species that must not share the same sector during the same shift.
 * The pair is unordered: `['orc', 'goblin']` also matches a goblin next to an orc.
 * Both entries may be the same species (two minotaurs fight over territory).
 */
export interface IncompatibilityRule {
  between: readonly [Species, Species]
  severity: Exclude<Severity, 'info'>
  reason: string
}

// ---------------------------------------------------------------------------
// Aggro & burnout monitor
// ---------------------------------------------------------------------------

interface AlertBase {
  /** Deterministic key derived from the alert's content; stable across recomputations. */
  id: string
  severity: Severity
  /** Human-readable summary, ready to render. */
  message: string
}

export interface IncompatibleSpeciesAlert extends AlertBase {
  kind: 'incompatible-species'
  sectorId: SectorId
  shift: Shift
  minionIds: readonly [MinionId, MinionId]
}

export interface OverCapacityAlert extends AlertBase {
  kind: 'over-capacity'
  sectorId: SectorId
  shift: Shift
  capacity: number
  assigned: number
}

export interface OverBudgetAlert extends AlertBase {
  kind: 'over-budget'
  sectorId: SectorId
  budget: Gold
  payroll: Gold
}

export interface BurnoutRiskAlert extends AlertBase {
  kind: 'burnout-risk'
  minionId: MinionId
  stress: number
}

/** Discriminated union: narrow on `kind` to access the specific fields. */
export type DungeonAlert =
  IncompatibleSpeciesAlert | OverCapacityAlert | OverBudgetAlert | BurnoutRiskAlert

export type AlertKind = DungeonAlert['kind']
```

`DungeonAlert` is another discriminated union, like `LeaveRequest`. Every alert has an `id`, a
`severity` and a ready-to-render `message`; the `kind` decides which extra fields it carries. A
burnout alert points to a minion, an over-budget alert to a sector with its numbers.

`IncompatibilityRule['severity']` uses `Exclude<Severity, 'info'>`: a clash between species is at
least a warning, never mere information.

<details>
<summary>The complete <code>src/types/dungeon.ts</code></summary>

```ts
/**
 * DungeonHR domain model.
 *
 * Every other module derives its types from this file.
 *
 * Conventions:
 * - Value lists (`SPECIES`, `SHIFTS`, ...) are runtime arrays declared `as const`.
 *   Their union types are derived from them, so the type checker and the UI
 *   (select options, filters, validation) share a single source of truth.
 * - Dates are ISO-8601 strings, never `Date` objects. The entire state tree
 *   therefore survives a `JSON.stringify` / `JSON.parse` round-trip, which
 *   matters once we persist it to localStorage (step 06).
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** Calendar date in `YYYY-MM-DD` format, e.g. `2026-11-24`. */
export type IsoDate = string

/** Full ISO-8601 timestamp, e.g. `2026-11-19T18:00:00.000Z`. */
export type IsoDateTime = string

/** An amount of gold coins. Always a non-negative integer. */
export type Gold = number

export type MinionId = string
export type SectorId = string
export type RequestId = string

/** How loudly the Aggro Monitor shouts about something. */
export type Severity = 'info' | 'warning' | 'critical'

// ---------------------------------------------------------------------------
// Species & minions
// ---------------------------------------------------------------------------

export const SPECIES = ['goblin', 'skeleton', 'orc', 'minotaur', 'beholder', 'werewolf'] as const
export type Species = (typeof SPECIES)[number]

/** 1 = mildly inconvenient, 5 = adventurers write ballads about it. */
export const THREAT_LEVELS = [1, 2, 3, 4, 5] as const
export type ThreatLevel = (typeof THREAT_LEVELS)[number]

/** Static facts about a species, used for display and form defaults. */
export interface SpeciesProfile {
  species: Species
  /** Singular display name, e.g. "Beholder". */
  label: string
  /** Plural display name, e.g. "Beholders". */
  pluralLabel: string
  /** Emoji used as a lightweight avatar. */
  icon: string
  /** Suggested `maxHp` when recruiting a new minion of this species. */
  baseHp: number
  /** Suggested monthly salary when recruiting a new minion of this species. */
  baseSalary: Gold
  /** One-line HR description shown in tooltips. */
  description: string
}

/** A dungeon employee. */
export interface Minion {
  id: MinionId
  name: string
  species: Species
  /** Current hit points. Invariant: `0 <= hp <= maxHp`. */
  hp: number
  maxHp: number
  threatLevel: ThreatLevel
  /** Monthly salary in gold coins. */
  salary: Gold
  /** Union members get extra vacation days and cannot be fired without a hearing. */
  isUnionized: boolean
  /** Accumulated stress from 0 (well rested) to 100 (burned out). */
  stress: number
  hiredOn: IsoDate
  /** Optional flavor text for the detail page. */
  bio?: string
}

/**
 * The fields a user fills in on the "Recruit a minion" form.
 * `id` and `hiredOn` are generated; a fresh recruit starts at full HP and zero stress.
 */
export type MinionDraft = Omit<Minion, 'id' | 'hiredOn' | 'hp' | 'stress'>

// ---------------------------------------------------------------------------
// Sectors, shifts & assignments
// ---------------------------------------------------------------------------

export const SECTOR_KINDS = [
  'treasury',
  'catacombs',
  'torture-chamber',
  'gatehouse',
  'lair',
] as const
export type SectorKind = (typeof SECTOR_KINDS)[number]

/** An area of the dungeon that needs staffing, e.g. "Torture Chamber 3". */
export interface DungeonSector {
  id: SectorId
  name: string
  kind: SectorKind
  /** Maximum number of minions per shift. Soft limit: exceeding it raises an alert. */
  capacity: number
  /** Minimum threat level required to be posted here. Hard limit: enforced on assignment. */
  minThreatLevel: ThreatLevel
  /** Monthly payroll budget for everyone posted to this sector. */
  payrollBudget: Gold
}

export const SHIFTS = ['dawn', 'dusk', 'midnight'] as const
export type Shift = (typeof SHIFTS)[number]

/**
 * A minion's posting to a sector and shift.
 * Invariant: each minion holds at most one assignment at a time.
 */
export interface Assignment {
  minionId: MinionId
  sectorId: SectorId
  shift: Shift
}

/**
 * Two species that must not share the same sector during the same shift.
 * The pair is unordered: `['orc', 'goblin']` also matches a goblin next to an orc.
 * Both entries may be the same species (two minotaurs fight over territory).
 */
export interface IncompatibilityRule {
  between: readonly [Species, Species]
  severity: Exclude<Severity, 'info'>
  reason: string
}

// ---------------------------------------------------------------------------
// Aggro & burnout monitor
// ---------------------------------------------------------------------------

interface AlertBase {
  /** Deterministic key derived from the alert's content; stable across recomputations. */
  id: string
  severity: Severity
  /** Human-readable summary, ready to render. */
  message: string
}

export interface IncompatibleSpeciesAlert extends AlertBase {
  kind: 'incompatible-species'
  sectorId: SectorId
  shift: Shift
  minionIds: readonly [MinionId, MinionId]
}

export interface OverCapacityAlert extends AlertBase {
  kind: 'over-capacity'
  sectorId: SectorId
  shift: Shift
  capacity: number
  assigned: number
}

export interface OverBudgetAlert extends AlertBase {
  kind: 'over-budget'
  sectorId: SectorId
  budget: Gold
  payroll: Gold
}

export interface BurnoutRiskAlert extends AlertBase {
  kind: 'burnout-risk'
  minionId: MinionId
  stress: number
}

/** Discriminated union: narrow on `kind` to access the specific fields. */
export type DungeonAlert =
  IncompatibleSpeciesAlert | OverCapacityAlert | OverBudgetAlert | BurnoutRiskAlert

export type AlertKind = DungeonAlert['kind']

// ---------------------------------------------------------------------------
// Leave & shift requests
// ---------------------------------------------------------------------------

export const REQUEST_TYPES = ['vacation', 'full-moon-leave', 'shift-swap'] as const
export type RequestType = (typeof REQUEST_TYPES)[number]

export const REQUEST_STATUSES = ['pending', 'approved', 'rejected'] as const
export type RequestStatus = (typeof REQUEST_STATUSES)[number]

interface RequestBase {
  id: RequestId
  minionId: MinionId
  status: RequestStatus
  submittedAt: IsoDateTime
  /** Free-text justification from the applicant. May be empty. */
  note: string
}

export interface VacationRequest extends RequestBase {
  type: 'vacation'
  startDate: IsoDate
  /** Inclusive. */
  endDate: IsoDate
}

/** Werewolves only. `fullMoonDate` must fall on a full moon. */
export interface FullMoonLeaveRequest extends RequestBase {
  type: 'full-moon-leave'
  fullMoonDate: IsoDate
}

export interface ShiftSwapRequest extends RequestBase {
  type: 'shift-swap'
  date: IsoDate
  fromShift: Shift
  toShift: Shift
  /** Colleague who covers the original shift, or `null` if nobody volunteered yet. */
  swapPartnerId: MinionId | null
}

/** Discriminated union: narrow on `type` to access the specific fields. */
export type LeaveRequest = VacationRequest | FullMoonLeaveRequest | ShiftSwapRequest

// ---------------------------------------------------------------------------
// Form helpers
// ---------------------------------------------------------------------------

/**
 * `Omit` that distributes over a union.
 * Plain `Omit<A | B, K>` collapses the union to its shared keys and loses the
 * discriminant-specific fields; this version applies `Omit` to each member.
 */
export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

/** Every key that appears in at least one member of a union. */
export type KeysOfUnion<T> = T extends unknown ? keyof T : never

/** What the request form edits: everything except the system-managed fields. */
export type LeaveRequestDraft = DistributiveOmit<LeaveRequest, 'id' | 'status' | 'submittedAt'>

/** One error message per invalid field. Missing key = field is valid. */
export type FieldErrors<T> = Partial<Record<KeysOfUnion<T> & string, string>>

export interface ValidationResult<T> {
  valid: boolean
  errors: FieldErrors<T>
}
```

</details>

## 4. Rules and the duty roster

Create `src/data/incompatibilityRules.ts`:

```ts
import type { IncompatibilityRule } from '@/types/dungeon'

/** Pairs of species that must not work the same shift in the same sector. */
export const INCOMPATIBILITY_RULES: readonly IncompatibilityRule[] = [
  {
    between: ['goblin', 'orc'],
    severity: 'warning',
    reason: 'Long-standing lunch-table dispute.',
  },
  {
    between: ['minotaur', 'minotaur'],
    severity: 'critical',
    reason: 'Minotaurs are fiercely territorial about corridors.',
  },
  {
    between: ['beholder', 'beholder'],
    severity: 'critical',
    reason: 'Each insists the other is a cheap knockoff.',
  },
  {
    between: ['skeleton', 'werewolf'],
    severity: 'warning',
    reason: 'Bones are not chew toys.',
  },
]
```

And `src/data/seedAssignments.ts`, the roster as the Dark Lord left it:

```ts
import type { Assignment } from '@/types/dungeon'

/**
 * The duty roster as the Dark Lord left it. It has problems: two beholders guard the treasury
 * together, both minotaurs share the midnight shift at the gatehouse, and the gatehouse is over
 * budget. Sorting this out is HR's first job.
 */
export const seedAssignments: Assignment[] = [
  { minionId: 'm-005', sectorId: 's-treasury', shift: 'dawn' },
  { minionId: 'm-010', sectorId: 's-treasury', shift: 'dawn' },
  { minionId: 'm-002', sectorId: 's-catacombs', shift: 'midnight' },
  { minionId: 'm-008', sectorId: 's-catacombs', shift: 'midnight' },
  { minionId: 'm-012', sectorId: 's-catacombs', shift: 'midnight' },
  { minionId: 'm-001', sectorId: 's-torture-3', shift: 'dawn' },
  { minionId: 'm-003', sectorId: 's-torture-3', shift: 'dawn' },
  { minionId: 'm-009', sectorId: 's-gatehouse', shift: 'dusk' },
  { minionId: 'm-006', sectorId: 's-gatehouse', shift: 'dusk' },
  { minionId: 'm-004', sectorId: 's-gatehouse', shift: 'midnight' },
  { minionId: 'm-011', sectorId: 's-gatehouse', shift: 'midnight' },
]
```

The seed data is deliberately messy, so the monitor has something to say from the start. Untangling it
is your first job as the new HR department.

## 5. The dungeon store

Create `src/stores/dungeon.ts`:

```ts
import { acceptHMRUpdate, defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { INCOMPATIBILITY_RULES } from '@/data/incompatibilityRules'
import { seedAssignments } from '@/data/seedAssignments'
import { seedMinions } from '@/data/seedMinions'
import { seedSectors } from '@/data/seedSectors'
import {
  SHIFTS,
  type Assignment,
  type DungeonAlert,
  type DungeonSector,
  type Gold,
  type Minion,
  type MinionDraft,
  type MinionId,
  type SectorId,
  type Severity,
  type Shift,
  type Species,
} from '@/types/dungeon'
import { toIsoDate } from '@/utils/date'
import { formatGold } from '@/utils/gold'
import { createId } from '@/utils/id'

/** How much stress a rest removes. */
export const REST_STRESS_RELIEF = 25
/** Stress at which the burnout monitor warns, and at which it gets loud. */
export const BURNOUT_WARNING_STRESS = 70
export const BURNOUT_CRITICAL_STRESS = 90
/** A payroll above this share of the budget is critical rather than just a warning. */
const BUDGET_CRITICAL_RATIO = 1.25

/** The outcome of an action that the store may refuse, with a reason the UI can show. */
export type ActionResult = { ok: true } | { ok: false; reason: string }

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, warning: 1, info: 2 }

/** Key for one sector-and-shift slot, e.g. `"s-gatehouse:midnight"`. */
function slotKey(sectorId: SectorId, shift: Shift): string {
  return `${sectorId}:${shift}`
}

/** The rule that forbids these two species from working together, if any. Order does not matter. */
function findIncompatibility(first: Species, second: Species) {
  return INCOMPATIBILITY_RULES.find(
    ({ between: [a, b] }) => (a === first && b === second) || (a === second && b === first),
  )
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

  const minions = ref<Minion[]>(structuredClone(seedMinions))
  const sectors = ref<DungeonSector[]>(structuredClone(seedSectors))
  const assignments = ref<Assignment[]>(structuredClone(seedAssignments))

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

  /** Everything the Aggro & Burnout Monitor warns about, most severe first. */
  const alerts = computed<DungeonAlert[]>(() => {
    const found: DungeonAlert[] = []

    for (const sector of sectors.value) {
      for (const shift of SHIFTS) {
        const crew = getCrew(sector.id, shift)

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

      const payroll = getSectorPayroll(sector.id)
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

    for (const minion of minions.value) {
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
  })

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
  }
})

// Keep the store's state when Vite hot-reloads this file during development.
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useDungeonStore, import.meta.hot))
}
```

It is long, because it now holds almost all of DungeonHR's logic. Let's take it apart.

### 5.1 Anatomy of a setup store

```ts
export const useDungeonStore = defineStore('dungeon', () => {
  const minions = ref<Minion[]>(…) // state
  const unassignedMinions = computed(() => …) // getter
  function healMinion(id: MinionId) { … } // action
  return { minions, unassignedMinions, healMinion }
})
```

`defineStore` takes a unique ID (`'dungeon'`, shown in the DevTools) and a setup function. The setup
function is written exactly like `<script setup>`: `ref` creates state, `computed` creates getters,
plain functions are actions. What it returns is the store's public API.

`defineStore` does not create the store yet. It returns a function, `useDungeonStore`. The first call
to that function, from any component, runs the setup function once. Every later call, from any
component on any page, returns the same store instance.

**Naming:** `use…Store` follows the convention for composables (more in chapter 6). Each store lives
in its own file in `src/stores/`.

### 5.2 State

```ts
const minions = ref<Minion[]>(structuredClone(seedMinions))
const sectors = ref<DungeonSector[]>(structuredClone(seedSectors))
const assignments = ref<Assignment[]>(structuredClone(seedAssignments))
```

Three arrays, initialized from the seed data. These are the only real state; everything else in the
store is derived from them. **Every piece of state must be returned** from the setup function. Pinia
discovers state by looking at what you return; state that is not returned is invisible to the
DevTools and to plugins such as persistence.

### 5.3 Getters, private getters and getters with arguments

- `unassignedMinions`, `totalPayroll`, `alerts` and friends are `computed` values: cached, and
  recalculated only when the state they read changes.
- `minionsById`, `crewsBySlot` and `payrollBySector` are `computed` too, but **not returned**. They are
  private implementation details: lookup tables that make the public getters fast.
- `getMinion(id)`, `getCrew(sectorId, shift)` and the other `get…` functions are **getters with
  arguments**. A `computed` cannot take arguments, so these are plain functions. They are not cached
  themselves, but they read from the cached lookup tables, so each call is a cheap `Map` lookup. When a
  component calls `dungeon.getCrew(…)` inside its own `computed` or template, Vue tracks the reactive
  reads inside, so the component still updates when the crew changes.

### 5.4 Actions and the rules they enforce

Actions are where the business rules live: a knocked-out minion cannot rest, a union member cannot be
fired, a minion who is not scary enough cannot guard the treasury.

Two actions can refuse, and they say why. They return an `ActionResult`:

```ts
export type ActionResult = { ok: true } | { ok: false; reason: string }
```

The caller checks `result.ok`, and TypeScript only allows `result.reason` after it has narrowed to the
failure case. The store decides; the UI decides how to show the decision.

`assignMinion` enforces the minimum threat level as a **hard rule** (the assignment is refused), but
lets capacity and budget be exceeded. Those are **soft rules**: the assignment goes through and the
monitor raises an alert. HR sometimes has to overbook a shift; it just should not happen silently.

`fireMinion` also removes the minion's assignment. Keeping related data consistent is exactly the kind
of rule that belongs in one central place.

### 5.5 The alerts getter

`alerts` walks over every sector and shift and collects problems:

- **over capacity:** more minions on a shift than the sector has posts,
- **incompatible species:** every pair in a crew is checked against the rules (`crew.forEach` plus
  `crew.slice(index + 1)` visits each pair exactly once),
- **over budget:** the sector's total salaries exceed its budget,
- **burnout risk:** any minion at 70 stress or more, critical from 90.

Every alert gets an `id` built from its content, such as `incompatible:s-gatehouse:midnight:m-004:m-011`.
The ID stays the same across recalculations, which makes it a perfect `:key` for `v-for`: Vue can tell
"the same alert as before" from "a new alert".

The whole function is one `computed`. Assign a minion, raid the dungeon or approve a vacation, and the
alerts update on their own, on every page that shows them.

### 5.6 Hot module replacement

```ts
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useDungeonStore, import.meta.hot))
}
```

When you edit a store file during development, Vite replaces the module. Without these lines, the
page reloads and the store starts over. With them, Pinia swaps in the new actions and getters and
keeps the current state. The block is removed from production builds, because `import.meta.hot` is
`undefined` there.

## 6. The requests store

Create `src/stores/requests.ts`:

```ts
import { acceptHMRUpdate, defineStore } from 'pinia'
import { computed, ref } from 'vue'

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

  const requests = ref<LeaveRequest[]>(structuredClone(seedRequests))

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

  return { requests, pendingCount, submitRequest, approveRequest, rejectRequest }
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useRequestsStore, import.meta.hot))
}
```

**A store can use another store.** `useDungeonStore()` is called at the top of the setup function, just
like in a component. When a vacation is approved, the requests store asks the dungeon store to relieve
the minion's stress. It does not reach into `dungeon.minions` and change the number itself: the
dungeon store owns the minions, so it gets an action, `relieveStress`, and keeps control over the rule
"stress never goes below zero".

**The rules are data.** `STRESS_RELIEF_ON_APPROVAL` maps each request type to an amount. A vacation
clears stress completely, full-moon leave takes off 40, a shift swap changes nothing. Changing HR
policy means changing a number, and `Record<RequestType, number>` makes sure every request type has
one.

## 7. Connecting the views

### 7.1 The roster

Replace `src/views/RosterView.vue`:

```vue
<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'

import MinionCard from '@/components/minions/MinionCard.vue'
import MinionFilters from '@/components/minions/MinionFilters.vue'
import MinionForm from '@/components/minions/MinionForm.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useDungeonStore } from '@/stores/dungeon'
import type { MinionDraft, Species } from '@/types/dungeon'
import { formatGold } from '@/utils/gold'

// The roster lives in the store now. This view only reads it and asks the store for changes, so
// navigating away and back no longer loses anything.
const dungeon = useDungeonStore()

// `storeToRefs` turns the store's state and getters into refs, so destructuring keeps them
// reactive. (Destructuring the store directly would copy the current values once.)
const { minions, totalPayroll, unionCount, woundedCount } = storeToRefs(dungeon)

// ---------------------------------------------------------------------------
// Filters: UI state that only this page cares about, so it stays local
// ---------------------------------------------------------------------------

const search = ref('')
const speciesFilter = ref<Species | 'all'>('all')
const unionOnly = ref(false)

const filteredMinions = computed(() => {
  const query = search.value.trim().toLowerCase()
  return minions.value.filter((minion) => {
    if (query && !minion.name.toLowerCase().includes(query)) return false
    if (speciesFilter.value !== 'all' && minion.species !== speciesFilter.value) return false
    if (unionOnly.value && !minion.isUnionized) return false
    return true
  })
})

function resetFilters(): void {
  search.value = ''
  speciesFilter.value = 'all'
  unionOnly.value = false
}

const rosterStats = computed(() => [
  { label: 'Headcount', value: String(minions.value.length) },
  { label: 'Monthly payroll', value: formatGold(totalPayroll.value) },
  { label: 'Union members', value: `${unionCount.value} / ${minions.value.length}` },
  { label: 'Wounded', value: String(woundedCount.value) },
])

// ---------------------------------------------------------------------------
// Recruiting
// ---------------------------------------------------------------------------

const isRecruiting = ref(false)
const minionNames = computed(() => minions.value.map((minion) => minion.name))

function recruitMinion(draft: MinionDraft): void {
  dungeon.recruitMinion(draft)
  isRecruiting.value = false
}
</script>

<template>
  <div>
    <header class="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-3xl font-bold text-crypt-50 sm:text-4xl">Minion Roster</h1>
        <p class="mt-2 max-w-2xl text-crypt-300">
          The Dark Lord is on sabbatical. Until further notice, all staffing questions go through
          this portal.
        </p>
      </div>

      <div class="flex flex-wrap gap-3">
        <BaseButton variant="primary" :disabled="isRecruiting" @click="isRecruiting = true">
          Recruit a minion
        </BaseButton>
        <BaseButton variant="danger" @click="dungeon.simulateRaid()">Simulate a raid</BaseButton>
        <BaseButton @click="dungeon.callHealer()">Call the healer</BaseButton>
      </div>
    </header>

    <MinionForm
      v-if="isRecruiting"
      class="mb-8"
      :existing-names="minionNames"
      @submit="recruitMinion"
      @cancel="isRecruiting = false"
    />

    <dl class="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
      <div
        v-for="stat in rosterStats"
        :key="stat.label"
        class="rounded-xl border border-crypt-800 bg-crypt-900/60 px-4 py-3"
      >
        <dt class="text-xs tracking-wider text-crypt-400 uppercase">{{ stat.label }}</dt>
        <dd class="mt-1 text-xl font-semibold text-crypt-50 tabular-nums">{{ stat.value }}</dd>
      </div>
    </dl>

    <MinionFilters
      v-model:search="search"
      v-model:species="speciesFilter"
      v-model:union-only="unionOnly"
      class="mb-4"
    />

    <p class="mb-4 text-sm text-crypt-400" aria-live="polite">
      Showing {{ filteredMinions.length }} of {{ minions.length }} minions
    </p>

    <div
      v-if="filteredMinions.length === 0"
      class="rounded-2xl border border-dashed border-crypt-700 px-6 py-12 text-center"
    >
      <p class="text-crypt-300">No minion matches these filters.</p>
      <BaseButton class="mt-4" size="sm" @click="resetFilters">Reset filters</BaseButton>
    </div>

    <div v-else class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      <MinionCard
        v-for="minion in filteredMinions"
        :key="minion.id"
        :minion="minion"
        @heal="dungeon.healMinion"
        @rest="dungeon.restMinion"
        @fire="dungeon.fireMinion"
      />
    </div>
  </div>
</template>
```

The script shrank from about 130 lines to 60: the roster, its statistics and all actions now live in
the store.

**Reading state with `storeToRefs`.** The store returned by `useDungeonStore()` is a reactive object.
You can use it directly (`dungeon.minions`, no `.value`), and that is perfectly fine in templates. But
destructuring it would break reactivity, for the same reason that destructuring any reactive object
does:

```ts
const { minions } = useDungeonStore() // ✗ a snapshot of the array; never updates
const { minions } = storeToRefs(useDungeonStore()) // ✓ a ref that stays connected to the store
```

`storeToRefs` turns every piece of state and every getter into a ref. It skips actions, because
functions do not need to be reactive.

**Calling actions.** Actions are called on the store: `@click="dungeon.simulateRaid()"`, or passed as
event handlers: `@heal="dungeon.healMinion"`. When `MinionCard` emits `heal` with an ID, Vue calls
`dungeon.healMinion(id)`.

**What stays local.** The filter values (`search`, `speciesFilter`, `unionOnly`) and `isRecruiting` are
still plain `ref`s in the view. No other page needs them, and losing them on navigation is fine. Not
everything belongs in a store; the concept guide has a decision table.

### 7.2 The minion profile

Update `src/views/MinionDetailView.vue`. The script now reads from the store instead of the seed data,
and the employment section shows where the minion is posted:

<details>
<summary>Full content of <code>src/views/MinionDetailView.vue</code></summary>

```vue
<script setup lang="ts">
import { computed } from 'vue'

import ThreatLevelIndicator from '@/components/minions/ThreatLevelIndicator.vue'
import BaseBadge from '@/components/ui/BaseBadge.vue'
import StatBar from '@/components/ui/StatBar.vue'
import { SPECIES_PROFILES } from '@/data/species'
import { useDungeonStore } from '@/stores/dungeon'
import { daysBetween, formatDate, toIsoDate } from '@/utils/date'
import { formatGold } from '@/utils/gold'

const { id } = defineProps<{
  /** The `:id` part of `/minion/:id`. The route passes it as a prop because it sets `props: true`. */
  id: string
}>()

const dungeon = useDungeonStore()

// Everything below is `computed` from `id`. That matters: going from one minion to the next only
// changes the URL parameter. Vue Router reuses this component instance instead of creating a new
// one, so `<script setup>` does not run again. Only computed values notice the new `id`.
//
// The minion comes from the store, so recruits have a profile and raid damage shows up here.
const minion = computed(() => dungeon.getMinion(id))
const profile = computed(() => (minion.value ? SPECIES_PROFILES[minion.value.species] : undefined))

const posting = computed(() => {
  const assignment = dungeon.getAssignment(id)
  const sector = assignment ? dungeon.getSector(assignment.sectorId) : undefined
  return assignment && sector ? `${sector.name}, ${assignment.shift} shift` : 'Not assigned'
})

const position = computed(() => dungeon.minions.findIndex((candidate) => candidate.id === id))
const previousMinion = computed(() =>
  position.value > 0 ? dungeon.minions[position.value - 1] : undefined,
)
const nextMinion = computed(() =>
  position.value >= 0 ? dungeon.minions[position.value + 1] : undefined,
)

const yearsOfService = computed(() => {
  if (!minion.value) return 0
  return Math.floor(daysBetween(minion.value.hiredOn, toIsoDate(new Date())) / 365.25)
})
</script>

<template>
  <div>
    <RouterLink
      :to="{ name: 'roster' }"
      class="text-sm font-medium text-crypt-400 transition-colors hover:text-ember-300"
    >
      ← Back to the roster
    </RouterLink>

    <article
      v-if="minion && profile"
      class="mt-6 rounded-2xl border border-crypt-700 bg-crypt-900/80 p-6 shadow-lg shadow-black/40 sm:p-8"
    >
      <header class="flex flex-col gap-5 sm:flex-row sm:items-start">
        <div class="flex min-w-0 flex-1 items-start gap-5">
          <span
            class="grid size-16 shrink-0 place-items-center rounded-2xl bg-crypt-800 text-4xl sm:size-20 sm:text-5xl"
            aria-hidden="true"
          >
            {{ profile.icon }}
          </span>

          <div class="min-w-0">
            <h1 class="text-2xl font-bold break-words text-crypt-50 sm:text-3xl">
              {{ minion.name }}
            </h1>
            <p class="mt-1 text-crypt-400">{{ profile.label }} · {{ profile.description }}</p>
            <div class="mt-3 flex flex-wrap gap-2">
              <BaseBadge v-if="minion.hp === 0" tone="danger">Knocked out</BaseBadge>
              <BaseBadge v-if="minion.isUnionized" tone="success">Union member</BaseBadge>
            </div>
          </div>
        </div>

        <!-- A link that looks like a button: it navigates, so it should be a link. -->
        <RouterLink
          :to="{ name: 'requests', query: { minion: minion.id } }"
          class="self-start rounded-lg bg-ember-600 px-4 py-2 text-sm font-semibold whitespace-nowrap text-crypt-950 transition-colors hover:bg-ember-500"
        >
          File a leave request
        </RouterLink>
      </header>

      <p v-if="minion.bio" class="mt-6 max-w-3xl text-crypt-200 italic">“{{ minion.bio }}”</p>

      <div class="mt-8 grid gap-8 md:grid-cols-2">
        <section aria-labelledby="condition-heading" class="space-y-4">
          <h2 id="condition-heading" class="text-lg font-semibold text-crypt-100">Condition</h2>
          <StatBar label="Hit points" :value="minion.hp" :max="minion.maxHp" variant="health" />
          <StatBar label="Stress" :value="minion.stress" :max="100" variant="stress" />
        </section>

        <section aria-labelledby="employment-heading">
          <h2 id="employment-heading" class="text-lg font-semibold text-crypt-100">Employment</h2>
          <dl class="mt-4 space-y-3 text-sm">
            <div class="flex items-center justify-between">
              <dt class="text-crypt-400">Threat level</dt>
              <dd><ThreatLevelIndicator :level="minion.threatLevel" /></dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-crypt-400">Salary</dt>
              <dd class="font-medium text-gold-400">{{ formatGold(minion.salary) }} / month</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-crypt-400">Hired on</dt>
              <dd class="text-crypt-100">
                {{ formatDate(minion.hiredOn) }}
                <span class="text-crypt-400">({{ yearsOfService }} years of service)</span>
              </dd>
            </div>
            <div class="flex justify-between gap-4">
              <dt class="text-crypt-400">Posted to</dt>
              <dd class="text-right text-crypt-100 capitalize">{{ posting }}</dd>
            </div>
            <div class="flex justify-between gap-4">
              <dt class="text-crypt-400">Employee ID</dt>
              <dd class="text-right font-mono break-all text-crypt-300">{{ minion.id }}</dd>
            </div>
          </dl>
        </section>
      </div>

      <nav
        aria-label="Other minions"
        class="mt-10 flex flex-wrap justify-between gap-4 border-t border-crypt-800 pt-6 text-sm"
      >
        <RouterLink
          v-if="previousMinion"
          :to="{ name: 'minion', params: { id: previousMinion.id } }"
          class="text-crypt-300 transition-colors hover:text-ember-300"
        >
          ← {{ previousMinion.name }}
        </RouterLink>
        <span v-else></span>
        <RouterLink
          v-if="nextMinion"
          :to="{ name: 'minion', params: { id: nextMinion.id } }"
          class="text-crypt-300 transition-colors hover:text-ember-300"
        >
          {{ nextMinion.name }} →
        </RouterLink>
      </nav>
    </article>

    <div
      v-else
      class="mt-6 rounded-2xl border border-dashed border-crypt-700 px-6 py-12 text-center"
    >
      <h1 class="text-2xl font-bold text-crypt-100">No such minion</h1>
      <p class="mt-2 text-crypt-300">
        HR has no file for <span class="font-mono">{{ id }}</span
        >. Perhaps they were fired, or the link is wrong.
      </p>
    </div>
  </div>
</template>
```

</details>

Because `minion` is `computed(() => dungeon.getMinion(id))`, the profile now shows the live minion:
recruits have profiles, raid damage shows up, and a fired minion's page says "No such minion".

### 7.3 The requests page

Replace `src/views/RequestsView.vue`:

```vue
<script setup lang="ts">
import { storeToRefs } from 'pinia'

import LeaveRequestForm from '@/components/requests/LeaveRequestForm.vue'
import RequestList from '@/components/requests/RequestList.vue'
import { useDungeonStore } from '@/stores/dungeon'
import { useRequestsStore } from '@/stores/requests'

const { preselectedMinionId } = defineProps<{
  /** From `?minion=…` in the URL. The route's `props` function maps the query to this prop. */
  preselectedMinionId?: string
}>()

// Both lists come from stores now: recruits can file requests, and decisions survive navigation.
const requestsStore = useRequestsStore()
const { requests } = storeToRefs(requestsStore)
const { minions } = storeToRefs(useDungeonStore())
</script>

<template>
  <div>
    <header class="mb-8">
      <h1 class="text-3xl font-bold text-crypt-50 sm:text-4xl">Leave Requests</h1>
      <p class="mt-2 max-w-2xl text-crypt-300">
        Vacations, shift swaps and full-moon leave. HR reads every request. Eventually. An approved
        vacation clears a minion's stress; full-moon leave takes off 40.
      </p>
    </header>

    <div class="grid items-start gap-8 lg:grid-cols-5">
      <LeaveRequestForm
        class="lg:col-span-2"
        :minions="minions"
        :preselected-minion-id="preselectedMinionId"
        @submit="requestsStore.submitRequest"
      />
      <RequestList
        class="lg:col-span-3"
        :requests="requests"
        :minions="minions"
        @approve="requestsStore.approveRequest"
        @reject="requestsStore.rejectRequest"
      />
    </div>
  </div>
</template>
```

Two stores, one view. `LeaveRequestForm` and `RequestList` did not change at all: they still receive
data through props and report through events. Only the view, which connects them to the rest of the
app, had to change.

### 7.4 Counters in the navigation

The header is visible on every page, which makes it a good place for a summary of the dungeon's state.
Replace `src/components/layout/AppNav.vue`:

```vue
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
```

`AppNav` uses two stores, and nothing passes it any props. That is the point of a store: a component
anywhere in the tree can read shared state without every component in between knowing about it.

The visual counter is just a number. For screen readers, a visually hidden label says what it counts:
"Sectors 9 open alerts".

## 8. The sector planner

### 8.1 A budget-aware `StatBar`

The planner shows each sector's payroll against its budget. `StatBar` almost fits, but neither of its
variants is right: with `stress`, a payroll at 71% of the budget would already be red. Add a `budget`
variant to `src/components/ui/StatBar.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'

type StatBarVariant = 'health' | 'stress' | 'budget'

const {
  label,
  value,
  max,
  variant = 'health',
} = defineProps<{
  label: string
  value: number
  max: number
  /**
   * Controls the bar color. `health`: a full bar is good. `stress`: a full bar is bad.
   * `budget`: fine until nearly full, bad only when the value exceeds the maximum.
   */
  variant?: StatBarVariant
}>()

/** Fill level of the bar, clamped to 0–100. */
const percent = computed(() => {
  if (max <= 0) return 0
  return Math.min(100, Math.max(0, Math.round((value / max) * 100)))
})

/** How good the current value is, from 0 (terrible) to 100 (perfect), for health and stress. */
const wellbeing = computed(() => (variant === 'health' ? percent.value : 100 - percent.value))

const barClass = computed(() => {
  if (variant === 'budget') {
    // Use the unclamped ratio: a budget can be exceeded, a bar cannot be more than full.
    const ratio = max > 0 ? value / max : 0
    if (ratio > 1) return 'bg-blood-500'
    if (ratio > 0.9) return 'bg-gold-400'
    return 'bg-ichor-500'
  }
  if (wellbeing.value > 60) return 'bg-ichor-500'
  if (wellbeing.value > 30) return 'bg-gold-400'
  return 'bg-blood-500'
})
</script>

<template>
  <div>
    <div class="flex justify-between text-sm">
      <span class="text-crypt-400">{{ label }}</span>
      <span class="font-medium text-crypt-100 tabular-nums">{{ value }} / {{ max }}</span>
    </div>
    <div
      class="mt-1.5 h-2 overflow-hidden rounded-full bg-crypt-800"
      role="meter"
      :aria-label="label"
      :aria-valuenow="value"
      aria-valuemin="0"
      :aria-valuemax="max"
    >
      <div
        class="h-full rounded-full transition-[width,background-color] duration-500 motion-reduce:transition-none"
        :class="barClass"
        :style="{ width: `${percent}%` }"
      ></div>
    </div>
  </div>
</template>
```

The budget variant uses the **unclamped** ratio. The bar cannot be more than 100% full, but the color
must still show that 2,020 gp on a 1,600 gp budget is over.

### 8.2 A presentational component: `AssignmentPicker`

Create `src/components/sectors/AssignmentPicker.vue`:

```vue
<script setup lang="ts">
import { ref, useId } from 'vue'

import BaseButton from '@/components/ui/BaseButton.vue'
import { SPECIES_PROFILES } from '@/data/species'
import type { Minion, MinionId, ThreatLevel } from '@/types/dungeon'

// A presentational component: it knows nothing about stores. It gets candidates through props and
// reports the user's choice through an event, so it would work with any data source.
const { candidates, minThreatLevel, label } = defineProps<{
  candidates: readonly Minion[]
  /** Candidates below this level are listed but cannot be picked. */
  minThreatLevel: ThreatLevel
  /** Accessible name of the select, e.g. "Assign a minion to Gatehouse, dusk shift". */
  label: string
}>()

const emit = defineEmits<{
  assign: [minionId: MinionId]
}>()

const id = useId()
const selected = ref<MinionId>('')

function submit(): void {
  if (!selected.value) return
  emit('assign', selected.value)
  selected.value = ''
}
</script>

<template>
  <form class="flex gap-2" @submit.prevent="submit">
    <label :for="id" class="sr-only">{{ label }}</label>
    <select :id="id" v-model="selected" class="form-control py-1.5 text-xs">
      <option value="" disabled>Assign a minion…</option>
      <option
        v-for="candidate in candidates"
        :key="candidate.id"
        :value="candidate.id"
        :disabled="candidate.threatLevel < minThreatLevel"
      >
        {{ SPECIES_PROFILES[candidate.species].icon }} {{ candidate.name }}
        {{ candidate.threatLevel < minThreatLevel ? '(not scary enough)' : '' }}
      </option>
    </select>
    <BaseButton type="submit" size="sm" :disabled="!selected">Assign</BaseButton>
  </form>
</template>
```

This component does not import any store. It receives the candidates as a prop and emits `assign`
with the chosen ID. Candidates below the sector's minimum threat level are listed but disabled, so the
user sees why they cannot be picked. (The store enforces the same rule anyway.)

### 8.3 A connected component: `SectorColumn`

Create `src/components/sectors/SectorColumn.vue`:

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'

import ThreatLevelIndicator from '@/components/minions/ThreatLevelIndicator.vue'
import AssignmentPicker from '@/components/sectors/AssignmentPicker.vue'
import StatBar from '@/components/ui/StatBar.vue'
import { SECTOR_KIND_PROFILES } from '@/data/sectorKinds'
import { SPECIES_PROFILES } from '@/data/species'
import { useDungeonStore } from '@/stores/dungeon'
import { SHIFTS, type DungeonSector, type MinionId, type Shift } from '@/types/dungeon'
import { formatGold } from '@/utils/gold'

const { sector } = defineProps<{
  sector: DungeonSector
}>()

// A connected component: it reads and changes shared data through the store directly, instead of
// receiving everything as props from the view and sending events back up.
const dungeon = useDungeonStore()

const payroll = computed(() => dungeon.getSectorPayroll(sector.id))
const shifts = computed(() =>
  SHIFTS.map((shift) => ({ shift, crew: dungeon.getCrew(sector.id, shift) })),
)

/** Why the store refused the last assignment, if it did. */
const refusal = ref<string | null>(null)

function assign(minionId: MinionId, shift: Shift): void {
  const result = dungeon.assignMinion(minionId, sector.id, shift)
  refusal.value = result.ok ? null : result.reason
}
</script>

<template>
  <article
    class="flex flex-col rounded-2xl border border-crypt-700 bg-crypt-900/80 p-5 shadow-lg shadow-black/40"
  >
    <header class="flex items-center gap-4">
      <span
        class="grid size-12 shrink-0 place-items-center rounded-xl bg-crypt-800 text-2xl"
        aria-hidden="true"
      >
        {{ SECTOR_KIND_PROFILES[sector.kind].icon }}
      </span>
      <div class="min-w-0 flex-1">
        <h2 class="text-lg font-semibold text-crypt-50">{{ sector.name }}</h2>
        <p class="text-sm text-crypt-400">
          {{ sector.capacity }} posts per shift · budget {{ formatGold(sector.payrollBudget) }}
        </p>
      </div>
    </header>

    <div class="mt-4 space-y-3">
      <!-- StatBar again, with the `budget` variant: it only turns red when the budget is exceeded. -->
      <StatBar label="Payroll (gp)" :value="payroll" :max="sector.payrollBudget" variant="budget" />
      <div class="flex items-center justify-between text-sm">
        <span class="text-crypt-400">Minimum threat level</span>
        <ThreatLevelIndicator :level="sector.minThreatLevel" />
      </div>
    </div>

    <section
      v-for="{ shift, crew } in shifts"
      :key="shift"
      class="mt-4 border-t border-crypt-800 pt-4"
      :aria-label="`${shift} shift`"
    >
      <div class="flex items-baseline justify-between">
        <h3 class="text-sm font-semibold text-crypt-200 capitalize">{{ shift }}</h3>
        <span
          class="text-xs tabular-nums"
          :class="crew.length > sector.capacity ? 'text-blood-300' : 'text-crypt-400'"
        >
          {{ crew.length }} / {{ sector.capacity }}
        </span>
      </div>

      <ul v-if="crew.length > 0" class="mt-2 space-y-1.5">
        <li
          v-for="minion in crew"
          :key="minion.id"
          class="flex items-center gap-2 rounded-lg bg-crypt-800/60 px-2.5 py-1.5 text-sm"
        >
          <span aria-hidden="true">{{ SPECIES_PROFILES[minion.species].icon }}</span>
          <RouterLink
            :to="{ name: 'minion', params: { id: minion.id } }"
            class="min-w-0 flex-1 truncate text-crypt-100 hover:text-ember-300"
          >
            {{ minion.name }}
          </RouterLink>
          <button
            type="button"
            class="rounded px-1.5 text-crypt-400 transition-colors hover:bg-crypt-700 hover:text-crypt-50"
            :aria-label="`Remove ${minion.name} from the ${shift} shift`"
            @click="dungeon.unassignMinion(minion.id)"
          >
            ✕
          </button>
        </li>
      </ul>
      <p v-else class="mt-2 text-xs text-crypt-500 italic">Nobody on duty.</p>

      <AssignmentPicker
        class="mt-2"
        :candidates="dungeon.unassignedMinions"
        :min-threat-level="sector.minThreatLevel"
        :label="`Assign a minion to ${sector.name}, ${shift} shift`"
        @assign="assign($event, shift)"
      />
    </section>

    <p v-if="refusal" class="mt-4 text-xs text-blood-300" role="alert">{{ refusal }}</p>
  </article>
</template>
```

`SectorColumn` takes one prop, the sector, and gets everything else from the store: the crew per
shift, the payroll, the list of unassigned minions. It calls actions directly and shows the store's
refusal reason when an assignment is rejected.

**Connected or presentational?** Both styles are valid, and DungeonHR uses both on purpose:

| | Presentational (`AssignmentPicker`, `MinionCard`) | Connected (`SectorColumn`, `AggroMonitor`) |
| --- | --- | --- |
| Gets data from | Props | Stores (plus a few props) |
| Reports changes by | Emitting events | Calling store actions |
| Reusable elsewhere | Easily, with any data | Only where that store exists |
| Testing | Mount with props, check events | Needs a Pinia instance in the test |
| Good for | Generic UI pieces, form controls, cards | Domain sections that would otherwise need many props |

Without the store connection, `SectorPlannerView` would have to pass every column its crews, payroll
and candidates, and handle `assign` and `unassign` events from five columns. Connecting the column
removes that plumbing without making `AssignmentPicker` any less reusable.

**`v-for` with destructuring.** `v-for="{ shift, crew } in shifts"` destructures each item, exactly
like a `for…of` loop would.

### 8.4 `AlertItem`: narrowing in the template

Create `src/components/sectors/AlertItem.vue`:

```vue
<script setup lang="ts">
import type { AlertKind, DungeonAlert, Severity } from '@/types/dungeon'

const { alert } = defineProps<{
  alert: DungeonAlert
}>()

const KIND_PROFILES: Record<AlertKind, { icon: string; title: string }> = {
  'incompatible-species': { icon: '⚔️', title: 'Incompatible roommates' },
  'over-capacity': { icon: '👥', title: 'Over capacity' },
  'over-budget': { icon: '💸', title: 'Over budget' },
  'burnout-risk': { icon: '🔥', title: 'Burnout risk' },
}

const SEVERITY_CLASSES: Record<Severity, string> = {
  critical: 'border-blood-600/60 bg-blood-500/10',
  warning: 'border-gold-500/40 bg-gold-400/5',
  info: 'border-crypt-700 bg-crypt-900/60',
}
</script>

<template>
  <li class="flex gap-3 rounded-xl border p-3" :class="SEVERITY_CLASSES[alert.severity]">
    <span class="text-xl" aria-hidden="true">{{ KIND_PROFILES[alert.kind].icon }}</span>
    <div class="min-w-0 flex-1">
      <p class="text-sm font-semibold text-crypt-50">
        {{ KIND_PROFILES[alert.kind].title }}
        <span
          class="ml-1 text-xs font-medium uppercase"
          :class="alert.severity === 'critical' ? 'text-blood-300' : 'text-gold-300'"
        >
          {{ alert.severity }}
        </span>
      </p>
      <p class="mt-0.5 text-sm text-crypt-300">{{ alert.message }}</p>

      <!--
        `v-if` on the discriminant narrows the type inside the element: here TypeScript knows that
        `alert` is a BurnoutRiskAlert, so `alert.minionId` is available.
      -->
      <RouterLink
        v-if="alert.kind === 'burnout-risk'"
        :to="{ name: 'minion', params: { id: alert.minionId } }"
        class="mt-1 inline-block text-xs font-semibold text-ember-300 hover:underline"
      >
        Open profile
      </RouterLink>
    </div>
  </li>
</template>
```

`v-if="alert.kind === 'burnout-risk'"` narrows the alert's type _inside the element_, just like an `if`
in TypeScript. Within that `RouterLink`, `alert.minionId` is available. Use `alert.sectorId` there
instead, and `vue-tsc` reports an error, because burnout alerts have no sector.

### 8.5 The monitor

Create `src/components/sectors/AggroMonitor.vue`:

```vue
<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed } from 'vue'

import AlertItem from '@/components/sectors/AlertItem.vue'
import { useDungeonStore } from '@/stores/dungeon'

// The alerts are computed in the store from minions, sectors and assignments. This component only
// displays them, and it updates whenever any of those change, on any page.
const { alerts } = storeToRefs(useDungeonStore())

const criticalCount = computed(
  () => alerts.value.filter((alert) => alert.severity === 'critical').length,
)
const warningCount = computed(
  () => alerts.value.filter((alert) => alert.severity === 'warning').length,
)
</script>

<template>
  <section
    aria-labelledby="aggro-monitor-heading"
    class="rounded-2xl border border-crypt-700 bg-crypt-900/80 p-5 shadow-lg shadow-black/40"
  >
    <h2 id="aggro-monitor-heading" class="text-lg font-semibold text-crypt-50">
      Aggro &amp; Burnout Monitor
    </h2>
    <p class="mt-1 text-sm text-crypt-400" aria-live="polite">
      <template v-if="alerts.length === 0">All quiet in the dungeon. Suspiciously quiet.</template>
      <template v-else>
        <span class="font-semibold text-blood-300">{{ criticalCount }} critical</span>,
        <span class="font-semibold text-gold-300">{{ warningCount }} warnings</span>
      </template>
    </p>

    <ul v-if="alerts.length > 0" class="mt-4 space-y-2">
      <AlertItem v-for="alert in alerts" :key="alert.id" :alert="alert" />
    </ul>
  </section>
</template>
```

The monitor computes nothing about the dungeon. It reads `alerts` from the store and counts them by
severity. The summary line has `aria-live="polite"`, so screen readers announce changes, such as
"2 critical, 5 warnings" after a minion is moved.

### 8.6 The planner page

Replace `src/views/SectorPlannerView.vue`:

```vue
<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed } from 'vue'

import AggroMonitor from '@/components/sectors/AggroMonitor.vue'
import SectorColumn from '@/components/sectors/SectorColumn.vue'
import { useDungeonStore } from '@/stores/dungeon'

const { sectors, unassignedMinions } = storeToRefs(useDungeonStore())

const waitingText = computed(() => {
  const count = unassignedMinions.value.length
  if (count === 0) return 'Everyone has a post.'
  return count === 1
    ? '1 minion is waiting for a post.'
    : `${count} minions are waiting for a post.`
})
</script>

<template>
  <div>
    <header class="mb-8">
      <h1 class="text-3xl font-bold text-crypt-50 sm:text-4xl">Sector Planner</h1>
      <p class="mt-2 max-w-2xl text-crypt-300">
        Post minions to sectors and shifts. Keep incompatible species apart, stay within budget, and
        watch the monitor. Each minion can hold one post at a time.
        <span class="text-crypt-100">{{ waitingText }}</span>
      </p>
    </header>

    <div class="grid items-start gap-8 xl:grid-cols-[1fr_22rem]">
      <ul class="grid gap-6 md:grid-cols-2" aria-label="Sectors">
        <li v-for="sector in sectors" :key="sector.id">
          <SectorColumn :sector="sector" class="h-full" />
        </li>
      </ul>

      <AggroMonitor class="xl:sticky xl:top-6" />
    </div>
  </div>
</template>
```

On wide screens, the monitor sits in a sticky column next to the sectors, so it stays in view while you
scroll through the shifts. The grid template `xl:grid-cols-[1fr_22rem]` uses Tailwind's arbitrary
values: one flexible column and one of exactly 22rem.

## 9. Checkpoint

- The navigation shows **9** open alerts next to "Sectors" and **2** pending requests next to
  "Requests".
- `/sectors` lists five sectors with their crews per shift. The monitor shows 4 critical alerts and 5
  warnings: two beholders in the treasury, two minotaurs at the gatehouse, the gatehouse's budget,
  Moira's burnout, and more.
- Remove Hrothgar Halfhorn from the gatehouse's midnight shift (✕). Both the minotaur alert and the
  gatehouse's budget alert disappear, the payroll bar turns green, and the navigation counter drops to
  7. Hrothgar now appears in every "Assign a minion…" list.
- In the treasury's list, Snikkit Two-Knives is marked "(not scary enough)" and cannot be selected.
- Recruit a minion on the roster, visit another page and come back: the recruit is still there, has a
  profile page, and shows up as waiting for a post in the planner.
- Simulate a raid, then open a wounded minion's profile: the HP matches the roster.
- File a vacation for Moira Blinkwell (stress 91) and approve it. Her profile shows 0 stress, and her
  burnout alert is gone from the monitor. The approval is still there after switching pages.

## 10. Stores in the DevTools

Open the Vue DevTools and switch to the **Pinia** tab:

- Select `dungeon` to see its state (`minions`, `sectors`, `assignments`) and getters (`alerts`,
  `totalPayroll`, …). You can edit state right there: set someone's `stress` to 95 and watch a burnout
  alert appear in the monitor.
- The **Timeline** tab records every action call with its arguments, and every state change. Approve a
  vacation and you see `approveRequest` in the `requests` store followed by `relieveStress` in the
  `dungeon` store.

Being able to answer "what changed, when, and through which action?" is the main reason to keep all
changes inside actions.

## 11. What is still missing

Two problems remain, and you will feel both soon:

1. **Reload the page.** Everything resets: the recruits, the assignments, the approvals. The store lives
   as long as the JavaScript app, and a reload starts a new app. HR would like the dungeon to remember
   its state.
2. **Look at the `alerts` getter.** About 70 lines of rules sit in the middle of the store, tangled up
   with Pinia. They cannot be reused elsewhere, and testing them means setting up a whole store.

[Chapter 6: Composables and Persistence](./06-composables-and-persistence.md) solves both: it extracts
the alert rules into a composable, saves the stores to `localStorage`, and adds a live shift clock to
the header along the way.

## 12. Run the quality checks

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
git commit -m "feat: add Pinia stores, the sector planner and the aggro monitor"
```

## 13. Try it yourself

1. **Feel why `storeToRefs` exists.** In `SectorPlannerView.vue`, replace
   `storeToRefs(useDungeonStore())` with just `useDungeonStore()`, and in `waitingText` change
   `unassignedMinions.value.length` to `unassignedMinions.length`. The page renders, and the text is
   right. Now assign the waiting minion on this page: the column updates, but the "waiting for a post"
   text does not. The destructured `unassignedMinions` is the array the getter returned at setup time;
   when the getter recomputes, it returns a new array, and your copy never hears about it. Undo.
2. **Make shift swaps real.** When a shift-swap request is approved, move the applicant's assignment to
   the requested shift, if they are assigned to the current one. Which store gets the new action, and
   which store calls it?
3. **Reset the dungeon.** Add a `resetDungeon` action that restores the three arrays from the seed data,
   and a button for it on the roster. (Setup stores have no built-in `$reset()`; the concept guide
   explains why.)
4. **Add a rule.** Orcs and werewolves argue about the thermostat. Add the rule to
   `INCOMPATIBILITY_RULES`, assign Urzula next to Fenric, and watch the alert appear. No other code
   changes.

## Recap

- A **store** is reactive state in a module: one instance per app, outside the component tree,
  available to every component, alive across navigation.
- **Setup stores** are written like `<script setup>`: `ref` is state, `computed` is a getter, functions
  are actions. Return all state.
- **Getters** can be private (not returned) or take arguments (plain functions over cached lookups).
- **Actions** own the business rules. Return a result when an action can refuse.
- **`storeToRefs`** keeps destructured state and getters reactive. Call actions on the store.
- **Stores can use stores.** Ask the owning store to change its own data through an action.
- **Connected components** use stores directly; **presentational components** use props and events.
  Pick per component.
- **Local UI state** (filters, open forms, drafts) stays in components.

**Go deeper:** [State management with Pinia](../concepts/07-state-management-with-pinia.md)
