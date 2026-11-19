# Chapter 4: Routing and Views

`App.vue` has grown into a 200-line component that holds the roster, the filters, the recruit form,
five actions and the statistics. HR also wants a profile page for every minion, a sector overview
and a place to file leave requests. Putting all of that on one page is not an option.

In this chapter DungeonHR becomes a multi-page application with real URLs. You can bookmark a
minion's profile, share a link to the leave form, and use the browser's back button, all without a
single full page reload.

**You will:**

- add Vue Router and define routes, including a dynamic one (`/minion/:id`) and a catch-all 404,
- split the app into an app shell and page-level views,
- navigate with `RouterLink` and programmatically with `useRouter`,
- read the current route with `useRoute` and type its `meta` fields,
- pass route parameters and query strings to views as props,
- load pages lazily, so each one becomes its own JavaScript file,
- model leave requests as a discriminated union and build a form whose fields depend on the
  request type,
- discover the limits of component state when pages come and go.

**Start from:** branch `step-03-events-and-forms` · **Reference solution:** branch
`step-04-routing-and-views` · **Time:** about 2 hours.

**Concept guide:** [Client-side routing](../concepts/06-client-side-routing.md) explains how a
single-page app fakes page loads with the History API, what happens during a navigation, and why
components are reused when only a parameter changes.

```bash
git switch -c my-step-04 step-03-events-and-forms
```

```bash
npm run dev
```

---

## 1. Why a router?

Right now, DungeonHR lives at one URL. Whatever you do, the address bar says `/`. That has
consequences:

- You cannot bookmark or share "Fenric's profile".
- The back button leaves the app instead of going to the previous view.
- Everything must be loaded and rendered at once.

A **client-side router** maps URLs to components. When you click a link, it updates the address bar
through the browser's History API and swaps the component on screen. No request to the server, no
page reload, and the back button works as expected.

The plan for this chapter:

| URL | View | Content |
| --- | --- | --- |
| `/` | (redirect) | Sends you to `/roster` |
| `/roster` | `RosterView` | Everything that is in `App.vue` today |
| `/minion/:id` | `MinionDetailView` | One minion's profile, e.g. `/minion/m-006` |
| `/sectors` | `SectorPlannerView` | The dungeon's sectors (read-only for now) |
| `/requests` | `RequestsView` | Leave request form and list; `?minion=m-006` pre-selects the applicant |
| anything else | `NotFoundView` | A friendly 404 |

## 2. Install Vue Router

```bash
npm install vue-router@5
```

Vue Router 5 keeps the API of version 4, which is what you will find in most tutorials and answers
online. Its main addition is optional file-based routing, which we do not use: writing the routes by
hand is the best way to understand what file-based routing would generate for you.

## 3. Grow the domain model

The new pages need sectors, shifts and leave requests. Replace `src/types/dungeon.ts`:

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
// Sectors & shifts
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

What is new:

- **Primitives:** `IsoDateTime` for timestamps, and ID aliases for sectors and requests.
- **Sectors and shifts.** A sector has a capacity, a minimum threat level and a payroll budget.
  The planner shows them read-only in this chapter; assignments arrive in chapter 5.
- **Leave requests** are a **discriminated union**. All three request types share the fields in
  `RequestBase`, and each adds its own. The `type` field (the _discriminant_) tells them apart.
  When code checks `request.type === 'vacation'`, TypeScript knows that `startDate` and `endDate`
  exist, and that `fullMoonDate` does not.
- **`RequestBase` is not exported.** Nobody outside this file should create a "request of no
  particular type".

The form helpers changed too, because the leave form edits a union:

- **`LeaveRequestDraft`** is a request without the system-managed fields. Plain
  `Omit<LeaveRequest, 'id'>` would not work: on a union, `keyof` only sees the keys that _all_
  members share, so `Omit` would throw away `startDate`, `fullMoonDate` and friends.
  `DistributiveOmit` applies `Omit` to each member separately. (A conditional type such as
  `T extends unknown ? … : never` distributes over unions: it is evaluated once per member, and the
  results are joined again.)
- **`FieldErrors<T>`** now uses `KeysOfUnion<T>` for the same reason. `FieldErrors<LeaveRequestDraft>`
  needs an error slot for `startDate` even though only vacations have one. For a non-union type like
  `MinionDraft`, nothing changes.

The concept guide on [typing components](../concepts/03-typing-components-with-typescript.md#a-preview-exhaustive-checks-with-never)
previewed discriminated unions; this is where they start paying off.

## 4. Dates and the moon

Leave requests need date arithmetic ("how many days is this vacation?") and one very specific rule:
full-moon leave must actually fall on a full moon. Replace `src/utils/date.ts`:

```ts
import type { IsoDate } from '@/types/dungeon'

const MS_PER_DAY = 86_400_000
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Formats a date as `YYYY-MM-DD` in the user's local time zone.
 *
 * `date.toISOString().slice(0, 10)` looks equivalent but uses UTC, so shortly after midnight it
 * returns yesterday's date for everyone east of Greenwich.
 */
export function toIsoDate(date: Date): IsoDate {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** True for a real calendar date in `YYYY-MM-DD` format. Rejects `''` and `2026-02-30`. */
export function isIsoDate(value: string): boolean {
  const match = ISO_DATE_PATTERN.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  )
}

/**
 * Midnight UTC of a calendar date, in milliseconds since the epoch.
 *
 * Calendar arithmetic is done in UTC on purpose: UTC has no daylight-saving time, so every day is
 * exactly 24 hours long.
 */
export function isoDateToUtcMs(date: IsoDate): number {
  if (!isIsoDate(date)) throw new Error(`Not a valid ISO date: "${date}"`)
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  return Date.UTC(year, month - 1, day)
}

/** The calendar date (in UTC) that contains the given instant. */
export function utcMsToIsoDate(ms: number): IsoDate {
  return new Date(ms).toISOString().slice(0, 10)
}

/** Whole days from `from` to `to`. Negative if `to` is earlier. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((isoDateToUtcMs(to) - isoDateToUtcMs(from)) / MS_PER_DAY)
}

const displayFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

/** Formats a date for display: `formatDate('2026-11-24')` returns `"24 Nov 2026"`. */
export function formatDate(date: IsoDate): string {
  return displayFormat.format(isoDateToUtcMs(date))
}
```

The new functions all work on `IsoDate` strings, the format the whole app uses:

- `isIsoDate` validates user input. An empty date field yields `''`, which must not crash anything.
- `isoDateToUtcMs` and `daysBetween` do calendar arithmetic in **UTC**. In local time, a day can be
  23 or 25 hours long when daylight saving time starts or ends, and "days between two dates" would
  occasionally be off by one.
- `formatDate` turns `2026-11-24` into "24 Nov 2026" for display.

Now create `src/utils/moonPhase.ts`:

```ts
import type { IsoDate } from '@/types/dungeon'
import { isoDateToUtcMs, utcMsToIsoDate } from '@/utils/date'

/**
 * Moon phase arithmetic for full-moon leave.
 *
 * We use the average length of a lunar cycle. Real cycles vary by several hours, so results can be
 * off by up to about a day. That is fine for HR purposes (requests accept a day either side), but do
 * not plan an eclipse expedition with it.
 */

/** Average length of a lunar cycle, from new moon to new moon, in days. */
export const SYNODIC_MONTH_DAYS = 29.530588853

const MS_PER_DAY = 86_400_000
const HALF_CYCLE_DAYS = SYNODIC_MONTH_DAYS / 2

/** A known new moon to count from: 6 January 2000, 18:14 UTC. */
const REFERENCE_NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14)

/** Noon UTC on the given date. Measuring at noon keeps us half a day away from both date edges. */
function noonUtcMs(date: IsoDate): number {
  return isoDateToUtcMs(date) + MS_PER_DAY / 2
}

/** Age of the moon in days at noon UTC: 0 is a new moon, about 14.77 is a full moon. */
export function moonAge(date: IsoDate): number {
  const daysSinceReference = (noonUtcMs(date) - REFERENCE_NEW_MOON_MS) / MS_PER_DAY
  // `%` keeps the sign of the left operand; adding a cycle and taking `%` again keeps it positive.
  return ((daysSinceReference % SYNODIC_MONTH_DAYS) + SYNODIC_MONTH_DAYS) % SYNODIC_MONTH_DAYS
}

/**
 * True if the date is the night of a full moon, or up to `toleranceDays` days before or after it.
 *
 * The extra half day accounts for measuring at noon: the full moon itself can happen at any time on
 * its calendar day, so that day's noon is up to half a day away from it.
 */
export function isFullMoon(date: IsoDate, toleranceDays = 1): boolean {
  return Math.abs(moonAge(date) - HALF_CYCLE_DAYS) <= toleranceDays + 0.5
}

/** The date of the next full moon on or after `from`. */
export function nextFullMoon(from: IsoDate): IsoDate {
  let daysUntil = HALF_CYCLE_DAYS - moonAge(from)
  // More than half a day in the past means this cycle's full moon was on an earlier date.
  if (daysUntil < -0.5) daysUntil += SYNODIC_MONTH_DAYS
  return utcMsToIsoDate(noonUtcMs(from) + daysUntil * MS_PER_DAY)
}
```

The idea is simple: the moon goes through its phases in a cycle of about 29.53 days. Count the days
since a known new moon, take the remainder of a cycle, and you know the moon's "age". Half a cycle
(about 14.77 days) is a full moon.

The approximation is good enough for HR. Checked against the real full moons of 2026, `nextFullMoon`
hits 11 of 13 exactly and is one day late for the other two. That is why `isFullMoon` accepts a day
either side.

**Why are these plain functions and not Vue code?** They have nothing to do with rendering. Plain
TypeScript modules are easy to test and to reuse, and they keep the components focused on the UI.

## 5. Reference data

The new pages need some static data. These four files contain nothing new conceptually, so copy them
from the reference branch:

```bash
git show step-04-routing-and-views:src/data/sectorKinds.ts > src/data/sectorKinds.ts
```

```bash
git show step-04-routing-and-views:src/data/seedSectors.ts > src/data/seedSectors.ts
```

```bash
git show step-04-routing-and-views:src/data/requestTypes.ts > src/data/requestTypes.ts
```

```bash
git show step-04-routing-and-views:src/data/seedRequests.ts > src/data/seedRequests.ts
```

<details>
<summary><code>src/data/sectorKinds.ts</code>: display information per sector kind</summary>

```ts
import type { SectorKind } from '@/types/dungeon'

/** Display information per kind of sector, the sector counterpart to `SPECIES_PROFILES`. */
export const SECTOR_KIND_PROFILES: Record<SectorKind, { label: string; icon: string }> = {
  treasury: { label: 'Treasury', icon: '💰' },
  catacombs: { label: 'Catacombs', icon: '⚰️' },
  'torture-chamber': { label: 'Torture chamber', icon: '⛓️' },
  gatehouse: { label: 'Gatehouse', icon: '🏰' },
  lair: { label: 'Lair', icon: '🕳️' },
}
```

</details>

<details>
<summary><code>src/data/seedSectors.ts</code>: the five sectors of the dungeon</summary>

```ts
import type { DungeonSector } from '@/types/dungeon'

/** The parts of the dungeon that need staff, around the clock. */
export const seedSectors: DungeonSector[] = [
  {
    id: 's-treasury',
    name: 'Treasury Guard',
    kind: 'treasury',
    capacity: 3,
    minThreatLevel: 4,
    payrollBudget: 4000,
  },
  {
    id: 's-catacombs',
    name: 'Catacombs',
    kind: 'catacombs',
    capacity: 4,
    minThreatLevel: 1,
    payrollBudget: 900,
  },
  {
    id: 's-torture-3',
    name: 'Torture Chamber 3',
    kind: 'torture-chamber',
    capacity: 2,
    minThreatLevel: 2,
    payrollBudget: 700,
  },
  {
    id: 's-gatehouse',
    name: 'Gatehouse',
    kind: 'gatehouse',
    capacity: 4,
    minThreatLevel: 3,
    payrollBudget: 1600,
  },
  {
    id: 's-lair',
    name: 'Beholder Lair',
    kind: 'lair',
    capacity: 2,
    minThreatLevel: 5,
    payrollBudget: 2600,
  },
]
```

</details>

<details>
<summary><code>src/data/requestTypes.ts</code>: labels and descriptions per request type</summary>

```ts
import type { RequestType } from '@/types/dungeon'
import { VACATION_MAX_DAYS, VACATION_MAX_DAYS_UNIONIZED } from '@/utils/validation'

/** Display information per request type. */
export const REQUEST_TYPE_PROFILES: Record<
  RequestType,
  { label: string; icon: string; description: string }
> = {
  vacation: {
    label: 'Vacation',
    icon: '🏖️',
    description: `Up to ${VACATION_MAX_DAYS} days in a row, ${VACATION_MAX_DAYS_UNIONIZED} for union members.`,
  },
  'full-moon-leave': {
    label: 'Full-moon leave',
    icon: '🌕',
    description: 'The night of a full moon off. Werewolves only.',
  },
  'shift-swap': {
    label: 'Shift swap',
    icon: '🔄',
    description: 'Trade one shift for another on a given day.',
  },
}
```

</details>

<details>
<summary><code>src/data/seedRequests.ts</code>: three requests already waiting for HR</summary>

```ts
import type { LeaveRequest } from '@/types/dungeon'

/** Requests that were already on HR's desk when the Dark Lord left. */
export const seedRequests: LeaveRequest[] = [
  {
    id: 'r-001',
    type: 'vacation',
    minionId: 'm-003',
    status: 'pending',
    submittedAt: '2026-11-12T09:30:00.000Z',
    note: 'Visiting my mother in the Ashen Wastes. She insists.',
    startDate: '2026-12-21',
    endDate: '2026-12-28',
  },
  {
    id: 'r-002',
    type: 'full-moon-leave',
    minionId: 'm-006',
    status: 'approved',
    submittedAt: '2025-11-20T22:15:00.000Z',
    note: 'Annual tradition. Biscuits will be provided the following Monday.',
    fullMoonDate: '2026-11-24',
  },
  {
    id: 'r-003',
    type: 'shift-swap',
    minionId: 'm-012',
    status: 'pending',
    submittedAt: '2026-11-18T03:05:00.000Z',
    note: 'Rattlebones agreed to cover dusk if I stop complaining about the rattling.',
    date: '2026-11-28',
    fromShift: 'dusk',
    toShift: 'midnight',
    swapPartnerId: 'm-002',
  },
]
```

</details>

Note how `seedRequests` is typed `LeaveRequest[]`: each entry is checked against the union member
its `type` selects. Give the vacation a `fullMoonDate` and TypeScript complains.

## 6. Rules for leave requests

Add the leave rules to `src/utils/validation.ts`. The minion rules stay as they are; the new
imports, constants and `validateLeaveRequest` are added. The complete file:

```ts
import {
  SPECIES,
  THREAT_LEVELS,
  type FieldErrors,
  type IsoDate,
  type LeaveRequestDraft,
  type Minion,
  type MinionDraft,
  type ValidationResult,
} from '@/types/dungeon'
import { daysBetween, formatDate, isIsoDate } from '@/utils/date'
import { isFullMoon, nextFullMoon } from '@/utils/moonPhase'

export const MINION_NAME_MIN_LENGTH = 2
export const MINION_NAME_MAX_LENGTH = 40
export const MINION_BIO_MAX_LENGTH = 280
export const MAX_HP_LIMIT = 999
export const SALARY_LIMIT = 10_000

/**
 * Checks a "Recruit a minion" draft.
 *
 * This is a pure function: no Vue, no side effects. It takes data and returns data, which makes it
 * easy to reuse and to test. `existingNames` lets the caller enforce unique names without this
 * module knowing where the roster lives.
 */
export function validateMinionDraft(
  draft: MinionDraft,
  existingNames: readonly string[] = [],
): ValidationResult<MinionDraft> {
  const errors: FieldErrors<MinionDraft> = {}

  const name = draft.name.trim()
  if (name.length === 0) {
    errors.name = 'Every minion needs a name.'
  } else if (name.length < MINION_NAME_MIN_LENGTH) {
    errors.name = `Names need at least ${MINION_NAME_MIN_LENGTH} characters.`
  } else if (name.length > MINION_NAME_MAX_LENGTH) {
    errors.name = `Names can have at most ${MINION_NAME_MAX_LENGTH} characters.`
  } else if (existingNames.some((existing) => existing.toLowerCase() === name.toLowerCase())) {
    errors.name = 'A minion with this name already works here.'
  }

  if (!SPECIES.includes(draft.species)) {
    errors.species = 'Pick a species.'
  }

  if (!isIntegerInRange(draft.maxHp, 1, MAX_HP_LIMIT)) {
    errors.maxHp = `Max HP must be a whole number from 1 to ${MAX_HP_LIMIT}.`
  }

  if (!THREAT_LEVELS.includes(draft.threatLevel)) {
    errors.threatLevel = 'Pick a threat level from 1 to 5.'
  }

  if (!isIntegerInRange(draft.salary, 0, SALARY_LIMIT)) {
    errors.salary = `Salary must be a whole number from 0 to ${SALARY_LIMIT.toLocaleString('en-US')} gp.`
  }

  if (draft.bio !== undefined && draft.bio.trim().length > MINION_BIO_MAX_LENGTH) {
    errors.bio = `Keep the bio to ${MINION_BIO_MAX_LENGTH} characters or fewer.`
  }

  return { valid: Object.keys(errors).length === 0, errors }
}

export const REQUEST_NOTE_MAX_LENGTH = 500
export const VACATION_MAX_DAYS = 10
export const VACATION_MAX_DAYS_UNIONIZED = 14

/** Everything besides the draft that the leave-request rules depend on. */
export interface LeaveRequestContext {
  /** The minion the request is for, or `undefined` if nobody is selected. */
  applicant: Minion | undefined
  /** Today's date. Passed in, rather than read from the clock, so the function stays pure. */
  today: IsoDate
}

/**
 * Checks a leave or shift request.
 *
 * The draft is a discriminated union: inside each `case`, TypeScript knows which fields exist.
 * ISO dates (`YYYY-MM-DD`) compare correctly as plain strings, so `<` works for "earlier than".
 */
export function validateLeaveRequest(
  draft: LeaveRequestDraft,
  { applicant, today }: LeaveRequestContext,
): ValidationResult<LeaveRequestDraft> {
  const errors: FieldErrors<LeaveRequestDraft> = {}

  if (!applicant) {
    errors.minionId = 'Pick the minion this request is for.'
  }

  if (draft.note.trim().length > REQUEST_NOTE_MAX_LENGTH) {
    errors.note = `Keep the note to ${REQUEST_NOTE_MAX_LENGTH} characters or fewer.`
  }

  switch (draft.type) {
    case 'vacation': {
      const hasStart = isIsoDate(draft.startDate)
      if (!hasStart) {
        errors.startDate = 'Pick the first day of the vacation.'
      } else if (draft.startDate < today) {
        errors.startDate = 'Vacations cannot start in the past.'
      }

      if (!isIsoDate(draft.endDate)) {
        errors.endDate = 'Pick the last day of the vacation.'
      } else if (hasStart && draft.endDate < draft.startDate) {
        errors.endDate = 'The vacation must end on or after its first day.'
      } else if (hasStart && applicant) {
        const days = daysBetween(draft.startDate, draft.endDate) + 1
        const maxDays = applicant.isUnionized ? VACATION_MAX_DAYS_UNIONIZED : VACATION_MAX_DAYS
        if (days > maxDays) {
          const who = applicant.isUnionized ? 'Union members' : 'Non-union staff'
          errors.endDate = `${who} can take at most ${maxDays} days in a row. This request covers ${days}.`
        }
      }
      break
    }

    case 'full-moon-leave': {
      if (applicant && applicant.species !== 'werewolf') {
        errors.minionId = 'Only werewolves can request full-moon leave.'
      }

      if (!isIsoDate(draft.fullMoonDate)) {
        errors.fullMoonDate = 'Pick the night of the full moon.'
      } else if (draft.fullMoonDate < today) {
        errors.fullMoonDate = 'That full moon has already passed.'
      } else if (!isFullMoon(draft.fullMoonDate)) {
        errors.fullMoonDate = `That is not a full moon. The next one is on ${formatDate(nextFullMoon(today))}.`
      }
      break
    }

    case 'shift-swap': {
      if (!isIsoDate(draft.date)) {
        errors.date = 'Pick the date of the shift.'
      } else if (draft.date < today) {
        errors.date = 'Shifts in the past cannot be swapped.'
      }

      if (draft.fromShift === draft.toShift) {
        errors.toShift = 'Pick a different shift than the current one.'
      }

      if (draft.swapPartnerId !== null && draft.swapPartnerId === draft.minionId) {
        errors.swapPartnerId = 'Minions cannot swap shifts with themselves.'
      }
      break
    }

    default: {
      // If a new request type is added to the union and not handled above, `draft` is no longer
      // `never` here, and this line fails to compile. The compiler finds the missing case for us.
      const unhandled: never = draft
      throw new Error(`Unhandled request type: ${JSON.stringify(unhandled)}`)
    }
  }

  return { valid: Object.keys(errors).length === 0, errors }
}

/**
 * Number inputs can produce `''` when they are empty, even though the draft's type says `number`.
 * Checking `typeof` at runtime protects us from that gap between the type and reality.
 */
function isIntegerInRange(value: unknown, min: number, max: number): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
}
```

Three things to notice in `validateLeaveRequest`:

- **`today` is a parameter.** The function never reads the clock itself. That keeps it pure: the
  same input always gives the same output, which is what makes it testable in chapter 7. A test can
  pretend that today is 19 November 2026.
- **`switch (draft.type)` narrows the union.** Inside `case 'vacation'`, `draft.startDate` is
  available; in `case 'full-moon-leave'` it is a compile error.
- **The `default` branch is an exhaustiveness check.** After the three cases, TypeScript has
  eliminated every member of the union, so `draft` has the type `never`. Add a fourth request type
  and forget its case, and `const unhandled: never = draft` stops compiling. The compiler finds the
  gap for you.

ISO dates have one more convenience: they sort correctly as strings. `'2026-11-19' < '2026-11-24'`
is `true`, so "is this date in the past?" is a plain string comparison.

## 7. The router

Create `src/router/index.ts`:

```ts
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

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · DungeonHR` : 'DungeonHR'
})

export default router
```

Walk through it from the top.

**`declare module 'vue-router'`** is _module augmentation_: it adds our fields to the router's own
`RouteMeta` interface. From now on, `route.meta.section` is typed as
`'roster' | 'sectors' | 'requests' | undefined` everywhere in the app, and a typo in a route's `meta`
is a compile error.

**`createWebHistory`** chooses HTML5 history mode: URLs look like `/minion/m-006`. The alternative,
`createWebHashHistory`, produces `/#/minion/m-006`. Hash URLs work on any static file server without
configuration, but they look dated and are worse for sharing. History mode needs one thing from the
server: every unknown path must return `index.html`. Vite's dev server and `npm run preview` do this
automatically; the concept guide covers production.

**Route records.** Each entry maps a `path` to a `component`. A few features are in use:

- **`name`.** Every route has a name, and the rest of the app links by name
  (`{ name: 'minion', params: { id } }`) rather than by path. If a path changes later, only this file
  changes.
- **`redirect`.** `/` sends visitors to the roster.
- **Dynamic segments.** `:id` in `/minion/:id` matches any value in that position and makes it
  available as a route parameter.
- **`props: true`** passes route parameters to the component as props. `MinionDetailView` declares an
  `id` prop and never has to know about the router.
- **`props` as a function** maps anything from the route to props. `/requests?minion=m-006` becomes
  the prop `preselectedMinionId: 'm-006'`. The `typeof … === 'string'` check is necessary because a
  query value can also be `null` (`?minion`) or an array (`?minion=a&minion=b`).
- **The catch-all route** `/:pathMatch(.*)*` matches every path. Routes are ranked by how specific
  they are, so it only wins when nothing else matches.
- **`meta`** attaches arbitrary data to a route: here, a page title and the navigation section.

**Lazy loading.** `RosterView` is imported at the top of the file, like any module. All other views
use `component: () => import('@/views/…')`. A dynamic `import()` tells Vite to put that view (and
anything only it uses) into a separate JavaScript file, which the browser downloads the first time
someone visits that page. The landing page is imported eagerly, because everyone needs it
immediately.

**`scrollBehavior`** runs on every navigation. Returning the saved position for back/forward and the
top of the page otherwise is what users expect from regular websites.

**`router.afterEach`** is a _global navigation hook_. It runs after every successful navigation; we
use it to update the browser tab title.

Register the router in `src/main.ts`:

```ts
import { createApp } from 'vue'

import '@fontsource/cinzel/600.css'
import '@fontsource/cinzel/700.css'
import './assets/main.css'

import App from './App.vue'
import router from './router'

createApp(App).use(router).mount('#app')
```

`app.use(router)` installs the plugin: it registers the global `<RouterLink>` and `<RouterView>`
components, makes `useRoute()` and `useRouter()` available, and starts the initial navigation to the
current URL.

## 8. The app shell

With a router, `App.vue` no longer contains a page. It becomes the **shell** that stays on screen
while pages come and go. Before replacing it, move its current content into a view, because you will
need it in a moment:

```bash
mkdir -p src/views
```

```bash
git mv src/App.vue src/views/RosterView.vue
```

Now create a new `src/App.vue`:

```vue
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
```

**`<RouterView />`** is the placeholder where the router renders the component of the current route.
Navigate to `/sectors`, and `SectorPlannerView` appears there; navigate back, and `RosterView`
returns.

**The skip link** is invisible until it receives keyboard focus (`sr-only focus:not-sr-only`). It lets
keyboard users jump past the navigation, which now repeats at the top of every page.

Create `src/components/layout/AppHeader.vue`:

```vue
<script setup lang="ts">
import AppNav from '@/components/layout/AppNav.vue'
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

      <AppNav />
    </div>
  </header>
</template>
```

And `src/components/layout/AppNav.vue`:

```vue
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
```

**`RouterLink`** renders a normal `<a href="/sectors">`, so it works with middle-click, "open in new
tab" and screen readers. On a regular click, it prevents the full page load and asks the router to
navigate instead.

**`useRoute()`** returns the current route, and it is reactive: when the URL changes, everything that
reads `route.meta.section` updates. That is how the active navigation entry follows you around.

**Why not RouterLink's built-in active classes?** `RouterLink` adds `router-link-active` when its
target matches the current route. But `/minion/m-006` does not "match" `/roster`: the profile is not a
nested route of the roster. We want "Roster" highlighted on profile pages anyway, so we compare
`meta.section`, which each route declares explicitly. (`RouterLink` still sets `aria-current="page"`
on an exact match, which screen readers announce.)

## 9. The views

### 9.1 The roster

You moved the old `App.vue` to `src/views/RosterView.vue`. Three things change: the page gets its own
`<h1>` and introduction, the roster buttons move into that header, and a comment explains where the
roster's state now lives. Replace the file:

<details>
<summary>Full content of <code>src/views/RosterView.vue</code></summary>

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'

import MinionCard from '@/components/minions/MinionCard.vue'
import MinionFilters from '@/components/minions/MinionFilters.vue'
import MinionForm from '@/components/minions/MinionForm.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { seedMinions } from '@/data/seedMinions'
import type { Minion, MinionDraft, MinionId, Species } from '@/types/dungeon'
import { toIsoDate } from '@/utils/date'
import { formatGold } from '@/utils/gold'
import { createId } from '@/utils/id'

/** How much stress a rest removes. */
const REST_STRESS_RELIEF = 25

// The roster now lives in this view. That has a price: when you navigate to another page, this
// component is unmounted and its state is thrown away. Chapter 5 moves the roster into a store.
const minions = ref<Minion[]>(structuredClone(seedMinions))

// ---------------------------------------------------------------------------
// Filters: owned here, edited by <MinionFilters> through v-model
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

// ---------------------------------------------------------------------------
// Roster statistics (always for the whole roster, not just the filtered view)
// ---------------------------------------------------------------------------

const totalPayroll = computed(() => minions.value.reduce((sum, minion) => sum + minion.salary, 0))
const unionCount = computed(() => minions.value.filter((minion) => minion.isUnionized).length)
const woundedCount = computed(
  () => minions.value.filter((minion) => minion.hp < minion.maxHp).length,
)

const rosterStats = computed(() => [
  { label: 'Headcount', value: String(minions.value.length) },
  { label: 'Monthly payroll', value: formatGold(totalPayroll.value) },
  { label: 'Union members', value: `${unionCount.value} / ${minions.value.length}` },
  { label: 'Wounded', value: String(woundedCount.value) },
])

// ---------------------------------------------------------------------------
// Recruiting: <MinionForm> emits a finished draft, we turn it into a minion
// ---------------------------------------------------------------------------

const isRecruiting = ref(false)
const minionNames = computed(() => minions.value.map((minion) => minion.name))

function recruitMinion(draft: MinionDraft): void {
  minions.value.unshift({
    ...draft,
    id: createId('m'),
    hp: draft.maxHp,
    stress: 0,
    hiredOn: toIsoDate(new Date()),
  })
  isRecruiting.value = false
}

// ---------------------------------------------------------------------------
// Actions on a single minion, requested by <MinionCard> through events
// ---------------------------------------------------------------------------

function findMinion(id: MinionId): Minion | undefined {
  return minions.value.find((minion) => minion.id === id)
}

function healMinion(id: MinionId): void {
  const minion = findMinion(id)
  if (minion) minion.hp = minion.maxHp
}

function restMinion(id: MinionId): void {
  const minion = findMinion(id)
  // Knocked-out minions cannot rest; they need the healer first.
  if (!minion || minion.hp === 0) return
  minion.stress = Math.max(0, minion.stress - REST_STRESS_RELIEF)
}

function fireMinion(id: MinionId): void {
  const minion = findMinion(id)
  // The card hides the button for union members, but the owner of the data enforces the rule.
  if (!minion || minion.isUnionized) return
  minions.value = minions.value.filter((other) => other.id !== id)
}

// ---------------------------------------------------------------------------
// Actions on the whole roster
// ---------------------------------------------------------------------------

/** Random integer between `min` and `max`, both inclusive. */
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
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
        <BaseButton variant="danger" @click="simulateRaid">Simulate a raid</BaseButton>
        <BaseButton @click="callHealer">Call the healer</BaseButton>
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
        @heal="healMinion"
        @rest="restMinion"
        @fire="fireMinion"
      />
    </div>
  </div>
</template>
```

</details>

Read the comment above `const minions` carefully. It describes a real problem, and you will run into
it at the end of this chapter.

### 9.2 Linking a card to its profile

In `src/components/minions/MinionCard.vue`, wrap the minion's name in a link. Replace the `<h3>`:

```vue
        <h3 class="text-lg leading-snug font-semibold text-crypt-50">
          <RouterLink
            :to="{ name: 'minion', params: { id: minion.id } }"
            class="transition-colors hover:text-ember-300"
          >
            {{ minion.name }}
          </RouterLink>
        </h3>
```

`:to="{ name: 'minion', params: { id: minion.id } }"` describes the target by route name and
parameters. The router builds the URL (`/minion/m-001`) for you.

### 9.3 The minion profile

Create `src/views/MinionDetailView.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'

import ThreatLevelIndicator from '@/components/minions/ThreatLevelIndicator.vue'
import BaseBadge from '@/components/ui/BaseBadge.vue'
import StatBar from '@/components/ui/StatBar.vue'
import { seedMinions } from '@/data/seedMinions'
import { SPECIES_PROFILES } from '@/data/species'
import { daysBetween, formatDate, toIsoDate } from '@/utils/date'
import { formatGold } from '@/utils/gold'

const { id } = defineProps<{
  /** The `:id` part of `/minion/:id`. The route passes it as a prop because it sets `props: true`. */
  id: string
}>()

// Everything below is `computed` from `id`. That matters: going from one minion to the next only
// changes the URL parameter. Vue Router reuses this component instance instead of creating a new
// one, so `<script setup>` does not run again. Only computed values notice the new `id`.
//
// There is no shared roster yet, so this page can only look minions up in the seed data. Recruits,
// raid damage and firings from the roster page are invisible here. Chapter 5 fixes that.
const minion = computed(() => seedMinions.find((candidate) => candidate.id === id))
const profile = computed(() => (minion.value ? SPECIES_PROFILES[minion.value.species] : undefined))

const position = computed(() => seedMinions.findIndex((candidate) => candidate.id === id))
const previousMinion = computed(() =>
  position.value > 0 ? seedMinions[position.value - 1] : undefined,
)
const nextMinion = computed(() =>
  position.value >= 0 ? seedMinions[position.value + 1] : undefined,
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
            <div class="flex justify-between">
              <dt class="text-crypt-400">Employee ID</dt>
              <dd class="font-mono text-crypt-300">{{ minion.id }}</dd>
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
        >. New recruits do not have a profile page yet.
      </p>
    </div>
  </div>
</template>
```

**The route parameter arrives as a prop.** Because the route sets `props: true`, `/minion/m-006`
renders `<MinionDetailView id="m-006" />`. The view does not import anything from `vue-router` to get
its ID. You could render it in a test or in another context with any `id`.

**Everything is `computed` from `id`.** This is the most important lesson of the chapter. Click the
"Rattlebones McGee →" link at the bottom of Grizzle's profile. The URL changes from `/minion/m-001`
to `/minion/m-002`, but both URLs match the same route record. Vue Router therefore **reuses the
existing component instance** and only updates its `id` prop. `<script setup>` does not run again.
If `minion` were a plain `const` (`const minion = seedMinions.find(…)`), the page would keep showing
Grizzle under Rattlebones' URL. Because `minion` is `computed` from the reactive prop, it updates.

**A link that looks like a button.** "File a leave request" navigates to another page, so it is a
`RouterLink`, styled like a button. The rule: elements that _go somewhere_ are links; elements that
_do something_ are buttons. Links can be opened in a new tab and are announced as links.

**Query parameters.** `{ name: 'requests', query: { minion: minion.id } }` produces
`/requests?minion=m-006`. Query parameters are the right place for optional view state like "which
applicant to pre-select"; the path is for the identity of the page.

**The data problem.** The view imports `seedMinions`, because it has no other way to reach the roster:
the roster's `ref` lives inside `RosterView`, which is not even mounted while you look at a profile.
Hold that thought until section 12.

### 9.4 The sector overview

Create `src/views/SectorPlannerView.vue`:

```vue
<script setup lang="ts">
import ThreatLevelIndicator from '@/components/minions/ThreatLevelIndicator.vue'
import { SECTOR_KIND_PROFILES } from '@/data/sectorKinds'
import { seedSectors } from '@/data/seedSectors'
import { SHIFTS } from '@/types/dungeon'
import { formatGold } from '@/utils/gold'

// Read-only for now: the sector data never changes, so there is no reactive state on this page.
// Assigning minions to sectors needs the roster, and the roster lives on another page. Chapter 5
// moves it into a store, and this page becomes the planner.
const sectors = seedSectors
</script>

<template>
  <div>
    <header class="mb-8">
      <h1 class="text-3xl font-bold text-crypt-50 sm:text-4xl">Sector Planner</h1>
      <p class="mt-2 max-w-2xl text-crypt-300">
        Every sector is staffed around the clock in three shifts:
        <span class="text-crypt-100 capitalize">{{ SHIFTS.join(', ') }}</span
        >. Shift assignments are closed until HR finishes its negotiations with the union.
      </p>
    </header>

    <ul class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      <li
        v-for="sector in sectors"
        :key="sector.id"
        class="rounded-2xl border border-crypt-700 bg-crypt-900/80 p-5 shadow-lg shadow-black/40"
      >
        <div class="flex items-center gap-4">
          <span
            class="grid size-12 shrink-0 place-items-center rounded-xl bg-crypt-800 text-2xl"
            aria-hidden="true"
          >
            {{ SECTOR_KIND_PROFILES[sector.kind].icon }}
          </span>
          <div>
            <h2 class="text-lg font-semibold text-crypt-50">{{ sector.name }}</h2>
            <p class="text-sm text-crypt-400">{{ SECTOR_KIND_PROFILES[sector.kind].label }}</p>
          </div>
        </div>

        <dl class="mt-5 space-y-3 text-sm">
          <div class="flex justify-between">
            <dt class="text-crypt-400">Capacity</dt>
            <dd class="text-crypt-100">{{ sector.capacity }} minions per shift</dd>
          </div>
          <div class="flex items-center justify-between">
            <dt class="text-crypt-400">Minimum threat level</dt>
            <dd><ThreatLevelIndicator :level="sector.minThreatLevel" /></dd>
          </div>
          <div class="flex justify-between">
            <dt class="text-crypt-400">Payroll budget</dt>
            <dd class="font-medium text-gold-400">
              {{ formatGold(sector.payrollBudget) }} / month
            </dd>
          </div>
        </dl>
      </li>
    </ul>
  </div>
</template>
```

No reactive state at all: the sector data never changes yet, so a plain `const` is the right tool.
Not everything in a Vue component needs to be a `ref`.

### 9.5 The 404 page

Create `src/views/NotFoundView.vue`:

```vue
<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'

import BaseButton from '@/components/ui/BaseButton.vue'

const route = useRoute()
const router = useRouter()

// Vue Router records the previous location in the browser's history state. Without one (the user
// opened a broken link directly), "Go back" would leave the app, so we only offer it when it is safe.
const canGoBack = Boolean(router.options.history.state.back)
</script>

<template>
  <div class="py-16 text-center">
    <p class="text-6xl" aria-hidden="true">🕯️</p>
    <h1 class="mt-6 text-3xl font-bold text-crypt-50">This corridor leads nowhere</h1>
    <p class="mt-3 text-crypt-300">
      There is no page at <span class="font-mono text-crypt-100">{{ route.fullPath }}</span
      >. Perhaps a minotaur moved the door again.
    </p>

    <div class="mt-8 flex flex-wrap justify-center gap-3">
      <BaseButton v-if="canGoBack" @click="router.back()">Go back</BaseButton>
      <RouterLink
        :to="{ name: 'roster' }"
        class="rounded-lg bg-ember-600 px-4 py-2 text-sm font-semibold text-crypt-950 transition-colors hover:bg-ember-500"
      >
        To the roster
      </RouterLink>
    </div>
  </div>
</template>
```

**`useRouter()`** returns the router instance, for navigating from code. `router.back()` is the same
as the browser's back button. Other methods you will use: `router.push(location)` to navigate and add
a history entry, and `router.replace(location)` to navigate without one.

**When to use `router.push` instead of `RouterLink`?** After something has happened: a form was saved,
a login succeeded, an item was deleted. If the user clicks something whose only purpose is to go
somewhere, render a `RouterLink`.

**`router.options.history.state.back`** is where Vue Router stores the previous in-app location. When
someone opens a broken link directly, there is none, and "Go back" would leave DungeonHR entirely, so
the button only appears when it stays inside the app.

`route.fullPath` shows the path the visitor asked for, including any query string.

## 10. Leave requests

### 10.1 A form whose fields depend on a choice

Create `src/components/requests/LeaveRequestForm.vue`:

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'

import BaseButton from '@/components/ui/BaseButton.vue'
import FormField from '@/components/ui/FormField.vue'
import { REQUEST_TYPE_PROFILES } from '@/data/requestTypes'
import { SPECIES_PROFILES } from '@/data/species'
import {
  REQUEST_TYPES,
  SHIFTS,
  type FieldErrors,
  type IsoDate,
  type LeaveRequestDraft,
  type Minion,
  type MinionId,
  type RequestType,
  type Shift,
} from '@/types/dungeon'
import { formatDate, toIsoDate } from '@/utils/date'
import { nextFullMoon } from '@/utils/moonPhase'
import { REQUEST_NOTE_MAX_LENGTH, validateLeaveRequest } from '@/utils/validation'

const { minions, preselectedMinionId } = defineProps<{
  /** Everyone who may file a request. */
  minions: readonly Minion[]
  /** Pre-selects the applicant, e.g. when arriving from a minion's profile page. */
  preselectedMinionId?: MinionId
}>()

const emit = defineEmits<{
  submit: [draft: LeaveRequestDraft]
}>()

/**
 * The form keeps one flat object with the fields of every request type, so switching the type
 * never throws away what the user already typed. `toDraft` turns it into a correctly shaped draft.
 */
interface FormState {
  type: RequestType
  minionId: MinionId
  note: string
  startDate: IsoDate
  endDate: IsoDate
  fullMoonDate: IsoDate
  date: IsoDate
  fromShift: Shift
  toShift: Shift
  swapPartnerId: MinionId | null
}

const today = toIsoDate(new Date())
const upcomingFullMoon = nextFullMoon(today)

function createInitialState(): FormState {
  return {
    type: 'vacation',
    minionId: preselectedMinionId ?? '',
    note: '',
    startDate: '',
    endDate: '',
    fullMoonDate: '',
    date: '',
    fromShift: 'dawn',
    toShift: 'dusk',
    swapPartnerId: null,
  }
}

/** Builds the draft for the selected type. Each branch returns exactly that type's fields. */
function toDraft(state: FormState): LeaveRequestDraft {
  const common = { minionId: state.minionId, note: state.note.trim() }
  switch (state.type) {
    case 'vacation':
      return { ...common, type: 'vacation', startDate: state.startDate, endDate: state.endDate }
    case 'full-moon-leave':
      return { ...common, type: 'full-moon-leave', fullMoonDate: state.fullMoonDate }
    case 'shift-swap':
      return {
        ...common,
        type: 'shift-swap',
        date: state.date,
        fromShift: state.fromShift,
        toShift: state.toShift,
        swapPartnerId: state.swapPartnerId,
      }
  }
}

const form = ref<FormState>(createInitialState())

const draft = computed(() => toDraft(form.value))
const applicant = computed(() => minions.find((minion) => minion.id === form.value.minionId))
const swapPartners = computed(() => minions.filter((minion) => minion.id !== form.value.minionId))

const hasAttemptedSubmit = ref(false)
const validation = computed(() =>
  validateLeaveRequest(draft.value, { applicant: applicant.value, today }),
)
const errors = computed<FieldErrors<LeaveRequestDraft>>(() =>
  hasAttemptedSubmit.value ? validation.value.errors : {},
)

function handleSubmit(): void {
  hasAttemptedSubmit.value = true
  if (!validation.value.valid) return

  emit('submit', draft.value)

  form.value = createInitialState()
  hasAttemptedSubmit.value = false
}
</script>

<template>
  <form
    class="rounded-2xl border border-ember-700/40 bg-crypt-900/80 p-5 shadow-lg shadow-black/40 sm:p-6"
    novalidate
    @submit.prevent="handleSubmit"
  >
    <h2 class="text-lg font-semibold text-crypt-50">File a request</h2>

    <fieldset class="mt-5">
      <legend class="text-sm font-medium text-crypt-200">Request type</legend>
      <div class="mt-2 grid gap-2">
        <label
          v-for="type in REQUEST_TYPES"
          :key="type"
          class="flex cursor-pointer items-start gap-3 rounded-xl border border-crypt-700 p-3 transition-colors has-checked:border-ember-500 has-checked:bg-ember-500/10"
        >
          <input v-model="form.type" type="radio" :value="type" class="mt-1 accent-ember-500" />
          <span>
            <span class="block text-sm font-semibold text-crypt-50">
              {{ REQUEST_TYPE_PROFILES[type].icon }} {{ REQUEST_TYPE_PROFILES[type].label }}
            </span>
            <span class="block text-xs text-crypt-400">
              {{ REQUEST_TYPE_PROFILES[type].description }}
            </span>
          </span>
        </label>
      </div>
    </fieldset>

    <div class="mt-5 grid gap-5 sm:grid-cols-2">
      <FormField
        v-slot="{ id, invalid, describedBy }"
        label="Minion"
        :error="errors.minionId"
        required
        class="sm:col-span-2"
      >
        <select
          :id="id"
          v-model="form.minionId"
          class="form-control"
          :aria-invalid="invalid"
          :aria-describedby="describedBy"
        >
          <option value="" disabled>Choose a minion…</option>
          <option v-for="minion in minions" :key="minion.id" :value="minion.id">
            {{ SPECIES_PROFILES[minion.species].icon }} {{ minion.name }}
          </option>
        </select>
      </FormField>

      <!-- Only the fields of the selected request type are rendered. -->
      <template v-if="form.type === 'vacation'">
        <FormField
          v-slot="{ id, invalid, describedBy }"
          label="First day"
          :error="errors.startDate"
          required
        >
          <input
            :id="id"
            v-model="form.startDate"
            type="date"
            :min="today"
            class="form-control"
            :aria-invalid="invalid"
            :aria-describedby="describedBy"
          />
        </FormField>
        <FormField
          v-slot="{ id, invalid, describedBy }"
          label="Last day"
          :error="errors.endDate"
          required
        >
          <input
            :id="id"
            v-model="form.endDate"
            type="date"
            :min="form.startDate || today"
            class="form-control"
            :aria-invalid="invalid"
            :aria-describedby="describedBy"
          />
        </FormField>
      </template>

      <template v-else-if="form.type === 'full-moon-leave'">
        <FormField
          v-slot="{ id, invalid, describedBy }"
          label="Night of the full moon"
          :hint="`The next full moon is on ${formatDate(upcomingFullMoon)}.`"
          :error="errors.fullMoonDate"
          required
        >
          <input
            :id="id"
            v-model="form.fullMoonDate"
            type="date"
            :min="today"
            class="form-control"
            :aria-invalid="invalid"
            :aria-describedby="describedBy"
          />
        </FormField>
        <div class="flex items-end pb-1">
          <BaseButton size="sm" @click="form.fullMoonDate = upcomingFullMoon">
            Use {{ formatDate(upcomingFullMoon) }}
          </BaseButton>
        </div>
      </template>

      <template v-else>
        <FormField
          v-slot="{ id, invalid, describedBy }"
          label="Date of the shift"
          :error="errors.date"
          required
        >
          <input
            :id="id"
            v-model="form.date"
            type="date"
            :min="today"
            class="form-control"
            :aria-invalid="invalid"
            :aria-describedby="describedBy"
          />
        </FormField>
        <FormField
          v-slot="{ id, invalid, describedBy }"
          label="Covering colleague"
          :error="errors.swapPartnerId"
        >
          <select
            :id="id"
            v-model="form.swapPartnerId"
            class="form-control"
            :aria-invalid="invalid"
            :aria-describedby="describedBy"
          >
            <option :value="null">Nobody yet</option>
            <option v-for="partner in swapPartners" :key="partner.id" :value="partner.id">
              {{ partner.name }}
            </option>
          </select>
        </FormField>
        <FormField
          v-slot="{ id, invalid, describedBy }"
          label="Current shift"
          :error="errors.fromShift"
          required
        >
          <select
            :id="id"
            v-model="form.fromShift"
            class="form-control capitalize"
            :aria-invalid="invalid"
            :aria-describedby="describedBy"
          >
            <option v-for="shift in SHIFTS" :key="shift" :value="shift">{{ shift }}</option>
          </select>
        </FormField>
        <FormField
          v-slot="{ id, invalid, describedBy }"
          label="Desired shift"
          :error="errors.toShift"
          required
        >
          <select
            :id="id"
            v-model="form.toShift"
            class="form-control capitalize"
            :aria-invalid="invalid"
            :aria-describedby="describedBy"
          >
            <option v-for="shift in SHIFTS" :key="shift" :value="shift">{{ shift }}</option>
          </select>
        </FormField>
      </template>

      <FormField
        v-slot="{ id, invalid, describedBy }"
        label="Note for HR"
        :hint="`Optional. Up to ${REQUEST_NOTE_MAX_LENGTH} characters.`"
        :error="errors.note"
        class="sm:col-span-2"
      >
        <textarea
          :id="id"
          v-model="form.note"
          rows="3"
          class="form-control resize-y"
          :aria-invalid="invalid"
          :aria-describedby="describedBy"
        ></textarea>
      </FormField>
    </div>

    <div class="mt-6 flex justify-end">
      <BaseButton type="submit" variant="primary">Submit request</BaseButton>
    </div>
  </form>
</template>
```

**Flat form state, typed output.** The form edits a `FormState` object that has the fields of _every_
request type. `toDraft` builds the correctly shaped `LeaveRequestDraft` for the selected type. Two
benefits:

- `v-model` always binds to a field that exists. Binding directly to a union would mean
  `v-model="draft.startDate"` on a value that might currently be a shift swap.
- Switching from "Vacation" to "Shift swap" and back keeps the dates you already entered.

The draft and the validation are `computed` from the form state, exactly like in the recruit form.

**Conditional fields.** `<template v-if="form.type === 'vacation'">` renders a group of fields without
adding a wrapper element. Only the selected type's fields exist in the DOM.

**Radio buttons with `v-model`.** All three radios bind to `form.type`; each has its own `:value`.
Checking one sets `form.type` to that value. The surrounding `<label>` gets an ember border while its
radio is checked, thanks to Tailwind's `has-checked:` variant, which compiles to the CSS selector
`:has(:checked)`. No JavaScript needed for the highlight.

**`null` as an option value.** `<option :value="null">Nobody yet</option>` makes `swapPartnerId`
exactly `null`, matching its type `MinionId | null`. With `value="null"` (no colon), it would be the
string `"null"`.

**Date inputs.** `<input type="date">` with `v-model` produces `YYYY-MM-DD` strings, which is exactly
our `IsoDate` format, or `''` when empty. `:min` stops the browser's date picker from offering past
dates; the validation still checks, because typing can bypass the picker.

**Props only read once.** `preselectedMinionId` is used in `createInitialState`, which runs when the
form is created and after each submit. If the URL's query changed while the form stays on screen, the
form would not notice. That is acceptable here; chapter 6 shows how to react to such changes with
`watch`.

### 10.2 The request list

Create `src/components/requests/RequestList.vue`:

```vue
<script setup lang="ts">
import BaseBadge from '@/components/ui/BaseBadge.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { REQUEST_TYPE_PROFILES } from '@/data/requestTypes'
import type { LeaveRequest, Minion, MinionId, RequestId, RequestStatus } from '@/types/dungeon'
import { daysBetween, formatDate } from '@/utils/date'

const { requests, minions } = defineProps<{
  requests: readonly LeaveRequest[]
  /** Used to show applicants' names instead of their IDs. */
  minions: readonly Minion[]
}>()

const emit = defineEmits<{
  approve: [id: RequestId]
  reject: [id: RequestId]
}>()

const STATUS_TONES = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
} as const satisfies Record<RequestStatus, string>

function minionName(id: MinionId): string {
  return minions.find((minion) => minion.id === id)?.name ?? 'Unknown minion'
}

/** A one-line summary of what was requested. TypeScript narrows `request` in each case. */
function describeRequest(request: LeaveRequest): string {
  switch (request.type) {
    case 'vacation': {
      const days = daysBetween(request.startDate, request.endDate) + 1
      return `${formatDate(request.startDate)} to ${formatDate(request.endDate)} (${days} days)`
    }
    case 'full-moon-leave':
      return `Night of ${formatDate(request.fullMoonDate)}`
    case 'shift-swap': {
      const partner = request.swapPartnerId ? minionName(request.swapPartnerId) : 'nobody yet'
      return `${formatDate(request.date)}: ${request.fromShift} to ${request.toShift}, covered by ${partner}`
    }
  }
}
</script>

<template>
  <section aria-labelledby="request-list-heading">
    <h2 id="request-list-heading" class="text-lg font-semibold text-crypt-50">
      Requests on HR's desk
    </h2>

    <p v-if="requests.length === 0" class="mt-4 text-crypt-400">No requests yet.</p>

    <ul v-else class="mt-4 space-y-4">
      <li
        v-for="request in requests"
        :key="request.id"
        class="rounded-2xl border border-crypt-700 bg-crypt-900/80 p-5"
      >
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class="text-sm font-semibold text-crypt-50">
              {{ REQUEST_TYPE_PROFILES[request.type].icon }}
              {{ REQUEST_TYPE_PROFILES[request.type].label }}
              <!--
                The link sits inside the span on purpose. Between two elements, Vue's compiler drops
                whitespace that contains a line break, which would glue "for" to the name. Between
                text and an element, the whitespace is kept as a single space.
              -->
              <span class="font-normal text-crypt-400">
                for
                <RouterLink
                  :to="{ name: 'minion', params: { id: request.minionId } }"
                  class="font-semibold text-ember-300 hover:underline"
                >
                  {{ minionName(request.minionId) }}
                </RouterLink>
              </span>
            </p>
            <p class="mt-1 text-sm text-crypt-300">{{ describeRequest(request) }}</p>
          </div>
          <BaseBadge :tone="STATUS_TONES[request.status]" class="capitalize">
            {{ request.status }}
          </BaseBadge>
        </div>

        <p v-if="request.note" class="mt-3 text-sm text-crypt-300 italic">“{{ request.note }}”</p>

        <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p class="text-xs text-crypt-500">
            Submitted {{ formatDate(request.submittedAt.slice(0, 10)) }}
          </p>
          <div v-if="request.status === 'pending'" class="flex gap-2">
            <BaseButton size="sm" variant="ghost-danger" @click="emit('reject', request.id)">
              Reject
            </BaseButton>
            <BaseButton size="sm" variant="primary" @click="emit('approve', request.id)">
              Approve
            </BaseButton>
          </div>
        </div>
      </li>
    </ul>
  </section>
</template>
```

**Narrowing in a helper function.** `describeRequest` switches on `request.type`, and TypeScript
narrows each case. Templates can narrow too (`v-if="request.type === 'vacation'"` makes
`request.startDate` available inside), but for a one-line summary, a function is easier to read.

**`as const satisfies Record<RequestStatus, string>`.** `as const` keeps the literal values
(`'warning'`, not `string`), so they are valid `tone` props for `BaseBadge`. `satisfies` checks that
every status has an entry without widening the type.

**Pitfall: whitespace between elements.** Look at the comment next to "for". Vue's template compiler
removes whitespace-only text that contains a line break when it sits _between two elements_. That
keeps the DOM lean, but it means

```html
<span>for</span>
<RouterLink>Fenric Nightfang</RouterLink>
```

renders as "forFenric Nightfang". Whitespace between _text and an element_ is kept as a single space,
so putting the link inside the span, after the word, fixes it. When two inline elements must be
separated by a space, check the rendered result.

### 10.3 The requests page

Create `src/views/RequestsView.vue`:

```vue
<script setup lang="ts">
import { ref } from 'vue'

import LeaveRequestForm from '@/components/requests/LeaveRequestForm.vue'
import RequestList from '@/components/requests/RequestList.vue'
import { seedMinions } from '@/data/seedMinions'
import { seedRequests } from '@/data/seedRequests'
import type { LeaveRequest, LeaveRequestDraft, RequestId } from '@/types/dungeon'
import { createId } from '@/utils/id'

const { preselectedMinionId } = defineProps<{
  /** From `?minion=…` in the URL. The route's `props` function maps the query to this prop. */
  preselectedMinionId?: string
}>()

// Like the roster, the requests are local to this page for now: navigate away, and new requests
// and decisions are gone. The applicants come from the seed data, so recruits cannot file requests.
const requests = ref<LeaveRequest[]>(structuredClone(seedRequests))
const minions = seedMinions

function submitRequest(draft: LeaveRequestDraft): void {
  requests.value.unshift({
    ...draft,
    id: createId('r'),
    status: 'pending',
    submittedAt: new Date().toISOString(),
  })
}

function decide(id: RequestId, status: 'approved' | 'rejected'): void {
  const request = requests.value.find((candidate) => candidate.id === id)
  if (request?.status === 'pending') request.status = status
}
</script>

<template>
  <div>
    <header class="mb-8">
      <h1 class="text-3xl font-bold text-crypt-50 sm:text-4xl">Leave Requests</h1>
      <p class="mt-2 max-w-2xl text-crypt-300">
        Vacations, shift swaps and full-moon leave. HR reads every request. Eventually.
      </p>
    </header>

    <div class="grid items-start gap-8 lg:grid-cols-5">
      <LeaveRequestForm
        class="lg:col-span-2"
        :minions="minions"
        :preselected-minion-id="preselectedMinionId"
        @submit="submitRequest"
      />
      <RequestList
        class="lg:col-span-3"
        :requests="requests"
        :minions="minions"
        @approve="decide($event, 'approved')"
        @reject="decide($event, 'rejected')"
      />
    </div>
  </div>
</template>
```

- **The query arrives as a prop**, thanks to the route's `props` function, and is passed on to the
  form.
- **`$event`** in an inline handler is the event's payload. `@approve="decide($event, 'approved')"`
  calls `decide` with the request ID that `RequestList` emitted and a second, fixed argument.
- **Spreading a union.** `{ ...draft, id, status, submittedAt }` spreads a `LeaveRequestDraft` and adds
  the missing fields. TypeScript understands that spreading each member of the union and adding the
  same fields produces the matching member of `LeaveRequest`.

## 11. Checkpoint

- `http://localhost:5173/` redirects to `/roster`. The browser tab says "Minion Roster · DungeonHR".
- The navigation highlights the current section. Clicking a minion's name opens `/minion/m-…` with
  their profile, and "Roster" stays highlighted.
- On a profile, the links at the bottom move to the previous or next minion, and the page updates
  each time. The browser's back button goes back through the profiles you visited.
- "File a leave request" on Fenric's profile opens `/requests?minion=m-006` with Fenric pre-selected.
- Choosing "Full-moon leave" shows the date of the next full moon and a button to use it. Picking a
  date that is not a full moon, or a minion that is not a werewolf, shows an error after submitting.
- A twelve-day vacation for a non-union minion is rejected; union members may take up to fourteen.
- Submitted requests appear at the top of the list as "Pending". Approve and Reject change their
  status.
- `/sectors` lists five sectors. `/no/such/page` shows the 404 page.
- Open the browser's network tab, reload on `/roster`, then click "Sectors": a file named
  `SectorPlannerView-….js` is downloaded only at that moment.

## 12. The cracks in the dungeon walls

Now try this:

1. On the roster, recruit a minion called "Nibbles". Nibbles appears at the top.
2. Click Nibbles' name. The profile page says **"No such minion"**.
3. Go back to the roster. Nibbles is still there. Now click "Sectors", then "Roster" again.
   **Nibbles is gone.** So is any raid damage, and every minion you fired is back.
4. Simulate a raid, note someone's HP, and open their profile: it shows their **original HP**.
5. On the requests page, approve a request, visit another page and come back. **The decision is
   forgotten.**

None of this is a bug in the code you wrote. It is the limit of component state:

- **State lives as long as its component.** `RosterView` owns the roster in a `ref`. Navigating away
  unmounts `RosterView`, and its state is garbage-collected. Coming back creates a new instance, which
  starts again from the seed data.
- **Pages cannot see each other's state.** `MinionDetailView` and `RequestsView` cannot reach
  `RosterView`'s `ref`, so they fall back to the seed data.

Could we lift the roster up into `App.vue`, which never unmounts? Technically, yes: `App.vue` would
own the roster and pass it through `<RouterView>` to whichever page is active, and every page would
emit its changes back up. But then every view receives every piece of state whether it needs it or
not, and `App.vue` turns back into the 200-line component we just took apart, plus routing glue. The
problem is not where in the component tree the state lives. The problem is that it lives in the
component tree at all.

That is what [Chapter 5: Pinia State Management](./05-pinia-state-management.md) solves: a store that
lives outside all components, which any page can read and change, and which survives navigation.

## 13. Run the quality checks

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

The build output now lists one JavaScript file per lazily loaded view, next to the main bundle:

```text
dist/assets/NotFoundView-….js         1.09 kB
dist/assets/SectorPlannerView-….js    2.55 kB
dist/assets/MinionDetailView-….js     4.46 kB
dist/assets/RequestsView-….js        10.91 kB
dist/assets/index-….js              121.42 kB
```

Commit your work:

```bash
git add -A
```

```bash
git commit -m "feat: add routing, minion profiles, sectors and leave requests"
```

## 14. Try it yourself

1. **Watch component reuse break things.** In `MinionDetailView.vue`, change `minion` to a
   ref that is filled once: `const minion = ref(seedMinions.find((candidate) => candidate.id === id))`
   (and import `ref`). Open a profile and click "next". The URL changes; the page does not, because
   the lookup ran only once, when the component was created. Undo.
2. **Add a route guard.** Give the `minion` route a `beforeEnter` guard that redirects unknown IDs to
   the 404 page: `beforeEnter: (to) => seedMinions.some((m) => m.id === to.params.id) || { name:
   'not-found', params: { pathMatch: to.path.slice(1).split('/') } }`. Then think about why this guard
   would be wrong as soon as the roster can change at runtime. Undo it before chapter 5.
3. **Find the chunks.** Run `npm run build` and `npm run preview`, open the network tab and navigate
   through the app. Which file is loaded when?

## Recap

- **Vue Router** maps URLs to components. `createRouter` with `createWebHistory` gives real URLs
  without page reloads.
- **Route records** have a `path`, a `component`, and optionally a `name`, `props`, `meta`, or a
  `redirect`. Link by name, not by path.
- **`<RouterView>`** renders the current route's component inside the app shell; **`<RouterLink>`**
  renders real links that navigate without reloading.
- **`useRoute()`** gives you the reactive current route; **`useRouter()`** gives you the router for
  programmatic navigation. Use links for navigation and `router.push` after actions.
- **Route props** (`props: true` or a function) pass params and query values to views as typed props,
  keeping views independent of the router.
- **Changing only a parameter reuses the component.** Derive everything from props with `computed`.
- **Lazy routes** (`() => import(…)`) split the app into chunks that load on demand.
- **Discriminated unions** model data with variants; `switch` narrows them, and a `never` check makes
  the compiler find unhandled cases.
- **Component state dies with its component.** Shared state that must survive navigation needs a home
  outside the component tree.

**Go deeper:** [Client-side routing](../concepts/06-client-side-routing.md)
