# Chapter 2: Reactivity and Props

At the end of chapter 1 the roster showed Grizzle Snaggletooth three times. HR is not amused: there
are twelve minions on the payroll, and the accountant wants to see what they cost. In this chapter
we model the workforce in TypeScript, teach `MinionCard` to display _any_ minion, and make the
roster react when things change, such as a raid by adventurers.

**You will:**

- define the first TypeScript domain types in `src/types/dungeon.ts`,
- pass data from parent to child with `defineProps`,
- render lists with `v-for` and understand why `:key` matters,
- create reactive state with `ref` and derived state with `computed`,
- build three small reusable components: `BaseBadge`, `StatBar` and `ThreatLevelIndicator`,
- watch the UI update itself when state changes.

**Start from:** branch `step-01-scaffolding-and-first-sfc` · **Reference solution:** branch
`step-02-reactivity-and-props` · **Time:** about 75 minutes.

**Concept guides:**

- [Reactivity under the hood](../concepts/02-reactivity-under-the-hood.md): what `ref` and
  `computed` really do, built from scratch in 60 lines.
- [Typing components with TypeScript](../concepts/03-typing-components-with-typescript.md): how
  `defineProps<T>()` turns a type into runtime prop validation, and the patterns behind
  `dungeon.ts`.

```bash
git switch -c my-step-02 step-01-scaffolding-and-first-sfc
```

Start the dev server and keep it running:

```bash
npm run dev
```

---

## 1. Model the domain

Before components can receive a minion, we need to say what a minion _is_. All domain types live in
one file, `src/types/dungeon.ts`. It starts small in this chapter and grows as the app does.

Create `src/types/dungeon.ts`:

```ts
/**
 * DungeonHR domain model.
 *
 * Every other module derives its types from this file.
 *
 * Conventions:
 * - Value lists (`SPECIES`, `THREAT_LEVELS`, ...) are runtime arrays declared `as const`.
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

/** An amount of gold coins. Always a non-negative integer. */
export type Gold = number

export type MinionId = string

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
```

Three patterns in this file are worth understanding now, because the whole app relies on them:

**Unions derived from `as const` arrays.** `SPECIES` is a real array you can loop over at runtime
(we will, for a species filter in chapter 3). `as const` tells TypeScript to keep the exact string
values instead of widening them to `string[]`. Then `(typeof SPECIES)[number]` means "the type of
any element of that array", which is `'goblin' | 'skeleton' | … | 'werewolf'`. One list, used both
as a value and as a type, so the two can never drift apart.

**Type aliases that document intent.** `Gold` is just `number` and `IsoDate` is just `string`. The
compiler treats them identically, but `salary: Gold` tells a reader much more than
`salary: number`.

**`interface` for object shapes.** `Minion` describes an object. Optional fields are marked with
`?`. JSDoc comments (`/** … */`) show up as tooltips in your editor wherever the field is used.

**Why strings for dates?** A `Date` object does not survive `JSON.stringify` and back: it turns into
a string and stays a string. Storing ISO strings from the start avoids a class of bugs when we
persist state in chapter 6. The concept guide on TypeScript covers this in more depth.

## 2. Add the species profiles and the staff list

Each species has some static facts: a display name, an emoji, a description. Create
`src/data/species.ts`:

```ts
import type { Species, SpeciesProfile } from '@/types/dungeon'

/**
 * One profile per species.
 *
 * Typing this as `Record<Species, SpeciesProfile>` makes the compiler enforce completeness:
 * add a species to `SPECIES` and forget its profile here, and type checking fails.
 */
export const SPECIES_PROFILES: Record<Species, SpeciesProfile> = {
  goblin: {
    species: 'goblin',
    label: 'Goblin',
    pluralLabel: 'Goblins',
    icon: '👺',
    baseHp: 22,
    baseSalary: 100,
    description: 'Small, fast and unreasonably good at finding the snack cupboard.',
  },
  skeleton: {
    species: 'skeleton',
    label: 'Skeleton',
    pluralLabel: 'Skeletons',
    icon: '💀',
    baseHp: 28,
    baseSalary: 85,
    description: 'Never sleeps, never eats, never stops talking about the good old days.',
  },
  orc: {
    species: 'orc',
    label: 'Orc',
    pluralLabel: 'Orcs',
    icon: '👹',
    baseHp: 60,
    baseSalary: 280,
    description: 'Reliable muscle. Insists on a proper lunch break.',
  },
  minotaur: {
    species: 'minotaur',
    label: 'Minotaur',
    pluralLabel: 'Minotaurs',
    icon: '🐂',
    baseHp: 140,
    baseSalary: 600,
    description: 'Born for labyrinth duty. Gets territorial about corridors.',
  },
  beholder: {
    species: 'beholder',
    label: 'Beholder',
    pluralLabel: 'Beholders',
    icon: '👁️',
    baseHp: 190,
    baseSalary: 1400,
    description: 'Sees everything. Mostly your expense reports.',
  },
  werewolf: {
    species: 'werewolf',
    label: 'Werewolf',
    pluralLabel: 'Werewolves',
    icon: '🐺',
    baseHp: 85,
    baseSalary: 450,
    description: 'A model employee for twenty-eight days a month.',
  },
}
```

`import type` imports only types. It is erased completely at build time, which makes it obvious to
both readers and bundlers that no runtime code comes from that import.

**Try it:** Temporarily delete the `werewolf` entry and run `npm run type-check`. TypeScript reports
that property `werewolf` is missing. Put it back.

Now the staff list itself. Create `src/data/seedMinions.ts`. It is twelve entries of plain data, so
rather than typing it all, copy it from the reference branch:

```bash
git show step-02-reactivity-and-props:src/data/seedMinions.ts > src/data/seedMinions.ts
```

<details>
<summary>Full content of <code>src/data/seedMinions.ts</code></summary>

```ts
import type { Minion } from '@/types/dungeon'

/** The dungeon's staff on the day the Dark Lord left for his sabbatical. */
export const seedMinions: Minion[] = [
  {
    id: 'm-001',
    name: 'Grizzle Snaggletooth',
    species: 'goblin',
    hp: 18,
    maxHp: 24,
    threatLevel: 2,
    salary: 120,
    isUnionized: true,
    stress: 35,
    hiredOn: '2019-03-14',
    bio: 'Shop steward of Goblin Local 13. Keeps a laminated copy of the break-time regulations.',
  },
  {
    id: 'm-002',
    name: 'Rattlebones McGee',
    species: 'skeleton',
    hp: 30,
    maxHp: 30,
    threatLevel: 2,
    salary: 90,
    isUnionized: false,
    stress: 10,
    hiredOn: '1847-10-31',
    bio: 'Longest-serving employee. Claims to have trained the original Dark Lord.',
  },
  {
    id: 'm-003',
    name: 'Gorrak the Punctual',
    species: 'orc',
    hp: 52,
    maxHp: 60,
    threatLevel: 3,
    salary: 260,
    isUnionized: true,
    stress: 55,
    hiredOn: '2021-06-01',
    bio: 'Has never been late. Has also never let anyone forget it.',
  },
  {
    id: 'm-004',
    name: 'Asterion Hornsby',
    species: 'minotaur',
    hp: 110,
    maxHp: 140,
    threatLevel: 4,
    salary: 640,
    isUnionized: true,
    stress: 72,
    hiredOn: '2016-02-29',
    bio: 'Knows every corridor by heart. Gets twitchy when someone moves a door.',
  },
  {
    id: 'm-005',
    name: 'Ocularis Prime',
    species: 'beholder',
    hp: 180,
    maxHp: 200,
    threatLevel: 5,
    salary: 1500,
    isUnionized: false,
    stress: 40,
    hiredOn: '2012-09-09',
    bio: 'Head of Treasury Security. Maintains eye contact in every direction at once.',
  },
  {
    id: 'm-006',
    name: 'Fenric Nightfang',
    species: 'werewolf',
    hp: 75,
    maxHp: 90,
    threatLevel: 4,
    salary: 480,
    isUnionized: true,
    stress: 64,
    hiredOn: '2020-01-10',
    bio: 'Files his full-moon leave a year in advance. Brings homemade biscuits on Mondays.',
  },
  {
    id: 'm-007',
    name: 'Snikkit Two-Knives',
    species: 'goblin',
    hp: 9,
    maxHp: 22,
    threatLevel: 1,
    salary: 95,
    isUnionized: false,
    stress: 81,
    hiredOn: '2025-11-02',
    bio: 'Owns exactly one knife. Nobody knows where the name came from.',
  },
  {
    id: 'm-008',
    name: 'Brittle Bertram',
    species: 'skeleton',
    hp: 12,
    maxHp: 28,
    threatLevel: 1,
    salary: 80,
    isUnionized: true,
    stress: 5,
    hiredOn: '1902-04-17',
    bio: 'Falls apart under pressure. Literally. Reassembles in about ten minutes.',
  },
  {
    id: 'm-009',
    name: 'Urzula Ironjaw',
    species: 'orc',
    hp: 64,
    maxHp: 64,
    threatLevel: 3,
    salary: 310,
    isUnionized: false,
    stress: 28,
    hiredOn: '2018-08-21',
    bio: 'Gatehouse veteran. Has turned away four heroes and one very persistent bard.',
  },
  {
    id: 'm-010',
    name: 'Moira Blinkwell',
    species: 'beholder',
    hp: 150,
    maxHp: 190,
    threatLevel: 5,
    salary: 1350,
    isUnionized: true,
    stress: 91,
    hiredOn: '2017-05-05',
    bio: 'Covering two sectors since the reorganization. Has not blinked in three weeks.',
  },
  {
    id: 'm-011',
    name: 'Hrothgar Halfhorn',
    species: 'minotaur',
    hp: 125,
    maxHp: 150,
    threatLevel: 4,
    salary: 590,
    isUnionized: false,
    stress: 47,
    hiredOn: '2022-03-03',
    bio: 'Lost half a horn in a dispute with Asterion. They are not allowed on the same shift.',
  },
  {
    id: 'm-012',
    name: 'Velka Moonhowl',
    species: 'werewolf',
    hp: 40,
    maxHp: 85,
    threatLevel: 3,
    salary: 420,
    isUnionized: false,
    stress: 58,
    hiredOn: '2024-07-19',
    bio: 'Night-shift regular. Politely asks skeletons to stop rattling near her.',
  },
]
```

</details>

Because the array is annotated as `Minion[]`, TypeScript checks every entry. A typo such as
`species: 'gobiln'` or a missing `stress` is a compile error, not a runtime surprise.

## 3. A helper for money

Salaries appear in several places. Formatting them consistently (`1,500 gp`) belongs in one
function. Create `src/utils/gold.ts`:

```ts
import type { Gold } from '@/types/dungeon'

// Creating an `Intl.NumberFormat` is comparatively expensive, so we create it once and reuse it.
const goldFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

/** Formats an amount of gold for display: `formatGold(1500)` returns `"1,500 gp"`. */
export function formatGold(amount: Gold): string {
  return `${goldFormat.format(amount)} gp`
}
```

Plain functions like this are perfectly fine in Vue. Not everything needs to be a component or
reactive; a function that turns a number into a string is just a function.

## 4. Props: data flows from parent to child

A **prop** is an input to a component, like a function parameter. The parent decides the value; the
child reads it. In `<script setup>`, you declare props with the `defineProps` compiler macro and a
TypeScript type:

```ts
const { minion } = defineProps<{
  minion: Minion
}>()
```

The parent then passes the value as an attribute, with a colon because the value is an expression:

```html
<MinionCard :minion="someMinion" />
```

Before rewriting `MinionCard`, we build three small components it will use. Each one introduces one
new idea.

### 4.1 `BaseBadge`: an optional prop and a slot

Badges ("Union", "Knocked out") appear in several places with different colors. Create
`src/components/ui/BaseBadge.vue`:

```vue
<script setup lang="ts">
type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'accent'

// `tone` is optional. The default value in the destructuring pattern applies whenever the parent
// does not pass the prop.
const { tone = 'neutral' } = defineProps<{
  tone?: BadgeTone
}>()

// Complete class names only: Tailwind scans source files as text and cannot see class names that
// are assembled at runtime (such as `bg-${color}-500`).
const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'border-crypt-600 bg-crypt-800 text-crypt-200',
  success: 'border-ichor-600/50 bg-ichor-500/10 text-ichor-300',
  warning: 'border-gold-500/50 bg-gold-400/10 text-gold-300',
  danger: 'border-blood-600/60 bg-blood-500/10 text-blood-300',
  accent: 'border-ember-600/60 bg-ember-500/10 text-ember-300',
}
</script>

<template>
  <span
    class="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap"
    :class="TONE_CLASSES[tone]"
  >
    <!-- Whatever the parent writes between <BaseBadge> and </BaseBadge> is rendered here. -->
    <slot />
  </span>
</template>
```

New ideas:

- **Optional props with defaults.** `tone?:` makes the prop optional; `tone = 'neutral'` in the
  destructuring pattern provides the default. The parent can write `<BaseBadge tone="danger">` or
  just `<BaseBadge>`.
- **`class` and `:class` together.** The static `class` and the bound `:class` are merged. Static
  classes are always applied; the bound ones depend on `tone`.
- **Slots.** `<slot />` is a placeholder for content the parent provides:
  `<BaseBadge tone="success">Union</BaseBadge>` renders the text "Union" where the slot is. Props
  pass _data_ into a component; slots pass _markup_.

**Pitfall:** `tone="danger"` has no colon. It is a fixed string, so no binding is needed. With a
colon, `:tone="danger"` would look for a _variable_ named `danger` and pass `undefined`.

### 4.2 `StatBar`: computed values derived from props

The HP bar from chapter 1 is useful for stress too. Extract it into `src/components/ui/StatBar.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'

type StatBarVariant = 'health' | 'stress'

const {
  label,
  value,
  max,
  variant = 'health',
} = defineProps<{
  label: string
  value: number
  max: number
  /** `health`: a full bar is good. `stress`: a full bar is bad. Controls the bar color. */
  variant?: StatBarVariant
}>()

/** Fill level of the bar, clamped to 0–100. */
const percent = computed(() => {
  if (max <= 0) return 0
  return Math.min(100, Math.max(0, Math.round((value / max) * 100)))
})

/** How good the current value is, from 0 (terrible) to 100 (perfect), regardless of variant. */
const wellbeing = computed(() => (variant === 'health' ? percent.value : 100 - percent.value))

const barClass = computed(() => {
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

Remember the comment in chapter 1's card: _"Plain arithmetic, evaluated once when the component is
created."_ That was fine for constants. But props change: when a raid lowers a minion's HP, the
parent passes a new `value`, and a plain `const percent = …` would still hold the old number,
because `<script setup>` runs only once.

`computed` solves this. It takes a function and returns a read-only reactive value:

- Vue records which reactive values the function reads (here: `max`, `value`, `variant`).
- When one of them changes, the computed value is marked as stale.
- The next time someone reads it, the function runs again. Until then, the cached result is reused.

Computed values can build on each other: `barClass` depends on `wellbeing`, which depends on
`percent`, which depends on the props. Change `value`, and the whole chain updates.

In the script you read a computed value with `.value` (`percent.value`). In the template you do not:
Vue unwraps it for you (`{{ percent }}`, `` `${percent}%` ``).

**Why is `value` from the destructured props not a stale copy?** Normally, destructuring copies
values out of an object. Destructuring `defineProps` is special: the compiler rewrites every use of
`value` into `__props.value`, a reactive property access. The typing concept guide shows the
compiled output.

### 4.3 `ThreatLevelIndicator`: rendering lists with `v-for`

"Threat level 4 / 5" is informative but dull. Five runes, four of them lit, is quicker to read.
Create `src/components/minions/ThreatLevelIndicator.vue`:

```vue
<script setup lang="ts">
import { THREAT_LEVELS, type ThreatLevel } from '@/types/dungeon'

const { level } = defineProps<{
  level: ThreatLevel
}>()
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5"
    role="img"
    :aria-label="`Threat level ${level} of ${THREAT_LEVELS.length}`"
  >
    <!-- One rune per possible level; the first `level` runes are lit. -->
    <span
      v-for="step in THREAT_LEVELS"
      :key="step"
      class="size-2.5 rotate-45 rounded-[2px]"
      :class="step <= level ? 'bg-blood-500 shadow-[0_0_6px] shadow-blood-500/70' : 'bg-crypt-700'"
    ></span>
  </span>
</template>
```

`v-for="step in THREAT_LEVELS"` renders the element once per array item, with `step` set to the
current item (1, 2, 3, 4, 5). Here we reuse the `THREAT_LEVELS` array from the domain model: if the
scale ever changes, the indicator changes with it.

`:key` gives each rendered element a stable identity. More on why that matters in section 6.

`level: ThreatLevel` means the parent can only pass 1 to 5. `<ThreatLevelIndicator :level="7" />`
is a type error in your editor and in `npm run type-check`.

**Accessibility:** the five runes are meaningless to a screen reader on their own, so the wrapper
gets `role="img"` and a text label: "Threat level 4 of 5".

## 5. Rewrite `MinionCard` with a prop

Now the card can take a minion. Replace `src/components/minions/MinionCard.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'

import BaseBadge from '@/components/ui/BaseBadge.vue'
import StatBar from '@/components/ui/StatBar.vue'
import ThreatLevelIndicator from '@/components/minions/ThreatLevelIndicator.vue'
import { SPECIES_PROFILES } from '@/data/species'
import type { Minion } from '@/types/dungeon'
import { formatGold } from '@/utils/gold'

const { minion } = defineProps<{
  minion: Minion
}>()

// Both values are derived from the prop. `computed` re-evaluates them when the minion changes
// and caches the result in between.
const profile = computed(() => SPECIES_PROFILES[minion.species])
const isKnockedOut = computed(() => minion.hp === 0)
</script>

<template>
  <article
    class="minion-card rounded-2xl border border-crypt-700 bg-crypt-900/80 p-5 shadow-lg shadow-black/40"
    :class="{ 'opacity-60 grayscale': isKnockedOut }"
  >
    <header class="flex items-start gap-4">
      <span
        class="grid size-14 shrink-0 place-items-center rounded-xl bg-crypt-800 text-3xl"
        aria-hidden="true"
        :title="profile.description"
      >
        {{ profile.icon }}
      </span>

      <div class="min-w-0 flex-1">
        <h3 class="text-lg leading-snug font-semibold text-crypt-50">{{ minion.name }}</h3>
        <p class="text-sm text-crypt-400">{{ profile.label }}</p>
      </div>

      <div class="flex flex-col items-end gap-1.5">
        <BaseBadge v-if="isKnockedOut" tone="danger">Knocked out</BaseBadge>
        <BaseBadge v-if="minion.isUnionized" tone="success">Union</BaseBadge>
      </div>
    </header>

    <div class="mt-5 space-y-3">
      <StatBar label="Hit points" :value="minion.hp" :max="minion.maxHp" variant="health" />
      <StatBar label="Stress" :value="minion.stress" :max="100" variant="stress" />
    </div>

    <dl class="mt-4 space-y-3 text-sm">
      <div class="flex items-center justify-between">
        <dt class="text-crypt-400">Threat level</dt>
        <dd><ThreatLevelIndicator :level="minion.threatLevel" /></dd>
      </div>

      <div class="flex justify-between">
        <dt class="text-crypt-400">Salary</dt>
        <dd class="font-medium text-gold-400">{{ formatGold(minion.salary) }} / month</dd>
      </div>
    </dl>
  </article>
</template>

<style scoped>
/*
 * Scoped styles only apply to this component's elements.
 * Tailwind covers almost everything; a hover glow with a transition is easier to read as plain CSS.
 */
.minion-card {
  transition:
    border-color 200ms ease,
    box-shadow 200ms ease,
    translate 200ms ease,
    opacity 300ms ease,
    filter 300ms ease;
}

.minion-card:hover {
  border-color: var(--color-ember-600);
  box-shadow: 0 0 24px -6px color-mix(in oklab, var(--color-ember-500) 60%, transparent);
  translate: 0 -2px;
}

@media (prefers-reduced-motion: reduce) {
  .minion-card {
    transition: none;
  }

  .minion-card:hover {
    translate: none;
  }
}
</style>
```

What changed compared to chapter 1:

- The eight hard-coded constants are gone. Everything comes from one `minion` prop.
- **One object prop or many primitive props?** We pass the whole `Minion` rather than `name`,
  `species`, `hp`, … separately. The card is a view _of a minion_, so taking a minion is the most
  honest interface, and it stays stable when we add fields later. Small, generic components like
  `StatBar` take primitives instead, because they know nothing about minions.
- **Object syntax for `:class`.** `{ 'opacity-60 grayscale': isKnockedOut }` applies the classes
  only while `isKnockedOut` is true. A knocked-out minion fades and loses its color.
- The template calls `formatGold(minion.salary)` directly. Imported functions are available in the
  template just like variables.
- The `transition` list in the scoped style gained `opacity` and `filter`, so the fade is smooth.

Your editor now shows an error in `App.vue`: `<MinionCard />` is missing the required prop
`minion`. That is the type checker doing its job. Let's fix it.

## 6. Reactive state in `App.vue`

Replace `src/App.vue`:

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'

import MinionCard from '@/components/minions/MinionCard.vue'
import { seedMinions } from '@/data/seedMinions'
import type { Minion } from '@/types/dungeon'
import { formatGold } from '@/utils/gold'

// The roster is reactive state. `structuredClone` gives us our own deep copy, so changes made
// here never leak back into the seed module.
const minions = ref<Minion[]>(structuredClone(seedMinions))

// Derived state: recalculated automatically whenever a minion is added, removed or changed.
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

/** Random integer between `min` and `max`, both inclusive. */
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/** Adventurers storm the dungeon: everyone takes some damage and gets more stressed. */
function simulateRaid(): void {
  for (const minion of minions.value) {
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
      <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
        <h2 class="text-2xl font-semibold text-crypt-100">Minion Roster</h2>

        <div class="flex flex-wrap gap-3">
          <button
            type="button"
            class="rounded-lg bg-ember-600 px-4 py-2 text-sm font-semibold text-crypt-950 transition-colors hover:bg-ember-500"
            @click="simulateRaid"
          >
            Simulate a raid
          </button>
          <button
            type="button"
            class="rounded-lg border border-ichor-600/60 px-4 py-2 text-sm font-semibold text-ichor-300 transition-colors hover:bg-ichor-500/10"
            @click="callHealer"
          >
            Call the healer
          </button>
        </div>
      </div>

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

      <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <MinionCard v-for="minion in minions" :key="minion.id" :minion="minion" />
      </div>
    </main>
  </div>
</template>
```

Let's take it apart.

### 6.1 `ref`: state that Vue watches

```ts
const minions = ref<Minion[]>(structuredClone(seedMinions))
```

`ref()` wraps a value in a reactive container. You read and write the value through `.value`:
`minions.value.length`, `minions.value.push(…)`. Whenever code that Vue is tracking reads
`minions.value` (a computed, a template), Vue remembers that dependency. Whenever the value
changes, everything that depends on it updates.

`ref` is **deep**: the array inside, every minion object in it and every property of those objects
are reactive too. That is why `simulateRaid` can simply assign `minion.hp = …` and the UI follows.

**Why `structuredClone`?** `ref` does not copy its input; it makes the very same objects reactive.
Without the clone, every raid would also modify the objects exported by `seedMinions.ts`. That
would be harmless today, but in later chapters we will reset to the seed data, and by then it would
silently contain wounded minions. Copy data you intend to mutate.

**Pitfall:** Clone _before_ wrapping, never after. `structuredClone(minions.value)` throws a
`DataCloneError`, because `minions.value` is a reactive Proxy, and Proxies cannot be cloned. The
reactivity concept guide explains why.

### 6.2 `computed`: derived state

```ts
const totalPayroll = computed(() => minions.value.reduce((sum, minion) => sum + minion.salary, 0))
```

The payroll is not state of its own. It is a fact _about_ the roster. Storing it in a separate
`ref` and updating it by hand would work until the first time someone forgets. With `computed`, it
cannot get out of sync.

`rosterStats` is itself computed from other computed values and returns an array that the template
loops over. Computed values can return anything: numbers, strings, arrays, objects.

**Rule of thumb:** if a value can be calculated from other state, make it `computed`, not a `ref`.

### 6.3 `v-for` with `:key`

```html
<MinionCard v-for="minion in minions" :key="minion.id" :minion="minion" />
```

In the template, `minions` is used without `.value`. Top-level refs are unwrapped automatically in
templates.

`:key="minion.id"` tells Vue which rendered card belongs to which minion. When the list changes,
for example when we sort or remove minions in later chapters, Vue uses the keys to move existing
card components instead of re-creating them or, worse, patching the wrong card with another
minion's data.

**Pitfall:** Do not use the array index as a key (`v-for="(minion, index) in minions" :key="index"`).
When the order changes, index 0 now means a different minion, and any state inside the card (an
open menu, a focused input, a running animation) stays attached to the wrong one. Use a stable,
unique ID from your data.

### 6.4 Native events with `@click`

```html
<button type="button" @click="simulateRaid">Simulate a raid</button>
```

`@click` (short for `v-on:click`) calls `simulateRaid` when the button is clicked. Chapter 3 covers
events properly, including components that emit their own. For now it is enough to know that
`@event="handler"` listens to a DOM event.

`type="button"` matters. A `<button>` without a type defaults to `type="submit"`, which would submit
any form it ends up inside.

### 6.5 What happens when you click "Simulate a raid"

1. `simulateRaid` changes `hp` and `stress` on every minion. That is 24 property writes.
2. Each write notifies everything that read that property: the computed values in `App.vue` and
   the render functions of the affected cards, bars and badges.
3. Vue does not re-render 24 times. It queues the updates and flushes them once, after your
   function has finished.
4. `woundedCount` and `rosterStats` re-run; the stats bar re-renders.
5. For each card, Vue re-renders only the components whose inputs actually changed. The stat bars
   get new `value` props, so their `percent` and `barClass` recompute. `ThreatLevelIndicator` gets the
   same `level` as before, so it does not re-render at all.

**Checkpoint:** The roster now shows twelve different minions and a stats bar (headcount 12,
payroll 5,935 gp, union members 6 / 12, wounded 10).

- Click **Simulate a raid** a few times. HP bars shrink and change color, stress bars grow, the
  "Wounded" count rises, and eventually someone is knocked out: their card fades to gray with a red
  badge.
- Click **Call the healer**. All HP bars refill, knocked-out cards come back, and "Wounded" drops to
  0. Stress stays where it was.
- Open the Vue DevTools (the Vue logo at the bottom of the page), select `App` and expand
  `minions`. Click the raid button and watch the values change live. Select a `StatBar` and see its
  props and computed values.

## 7. Run the quality checks

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

**Checkpoint:** All four commands succeed.

Commit your work:

```bash
git add -A
```

```bash
git commit -m "feat: render the roster from typed, reactive data"
```

## 8. Try it yourself

1. **See the type checker catch a wrong prop.** In `MinionCard.vue`, change
   `:level="minion.threatLevel"` to `:level="minion.hp"`. Your editor underlines it, and
   `npm run type-check` reports _Type 'number' is not assignable to type '1 | 2 | 3 | 4 | 5'_
   (TypeScript spells out the `ThreatLevel` union). Undo.
2. **Break reactivity on purpose.** In `StatBar.vue`, replace the `percent` computed with
   `const percent = Math.round((value / max) * 100)` and change `percent.value` to `percent` in
   `wellbeing`. Run a raid: the numbers change, but the bar widths stay frozen, because the
   calculation ran only once. Undo.
3. **Add a fifth stat.** Add an "Average stress" tile to `rosterStats`. Compute the average of
   `minion.stress` across the roster and round it. The tile should update after every raid.
4. **Watch a key do its job.** Add a "Sort by HP" button that calls
   `minions.value.sort((a, b) => a.hp - b.hp)`. Click it: the cards jump to their new positions and
   the bars stay still, because Vue _moved_ each existing card. Reload the page, then change
   `:key="minion.id"` to `:key="index"` (with `v-for="(minion, index) in minions"`) and sort again.
   Now every bar animates, as if everyone's HP had changed at once. With index keys, Vue kept each
   card in place and patched it with a different minion's data, so the `StatBar`s saw new `value`
   props and played their width transition. Undo both changes afterwards.

## Recap

- **Domain types** live in `src/types/dungeon.ts`. `as const` arrays give us both runtime lists and
  union types from a single definition.
- **Props** are a component's inputs, declared with `defineProps<{ … }>()`. Data flows down from
  parent to child. Optional props get defaults in the destructuring pattern.
- **Slots** let a parent pass markup into a child.
- **`ref`** creates deep reactive state, accessed with `.value` in scripts and unwrapped in
  templates.
- **`computed`** creates derived state that updates automatically and is cached between changes.
  Anything that can be calculated should be computed.
- **`v-for`** renders lists; **`:key`** gives each item a stable identity. Never use the index.

The roster now reacts to changes, but only the parent can change anything. The cards are
display-only: you cannot heal a single minion or recruit a new one. You may also have noticed that
stress only ever goes up. Raids add it, the healer does not treat it, and there is no way to send an
exhausted minion home for a rest. That is not an oversight in the game rules but a limitation of
our components: the card that shows a stressed minion has no way to ask its parent to do something
about it. In [Chapter 3: Events and Forms](./03-events-and-forms.md) the components learn to talk
back to their parents, and the first thing a card will ask for is a rest.

**Go deeper:**

- [Reactivity under the hood](../concepts/02-reactivity-under-the-hood.md): build `ref`, `reactive`
  and `computed` yourself to see exactly how Vue tracks dependencies.
- [Typing components with TypeScript](../concepts/03-typing-components-with-typescript.md): what
  `defineProps<T>()` compiles to and how to design component interfaces.
