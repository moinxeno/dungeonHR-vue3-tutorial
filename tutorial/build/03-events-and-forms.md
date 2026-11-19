# Chapter 3: Events and Forms

The roster looks good and reacts to raids, but HR keeps filing complaints. You cannot heal a single
minion, only everyone at once. You cannot send an exhausted minion home for a rest. You cannot fire
anyone, or hire anyone. And with twelve cards on screen, finding Velka takes a while.

All of these have the same root cause: the cards can _show_ data, but they cannot _ask for_
anything. In this chapter the components learn to talk back.

**You will:**

- emit custom events from a component with `defineEmits`,
- apply the rule that keeps Vue apps understandable: _props down, events up_,
- decide which state belongs to a child and which to its parent,
- build a `BaseButton` and learn how attributes and listeners fall through to a component's root,
- bind form controls with `v-model` and its modifiers,
- give your own components a `v-model` with `defineModel`,
- build a validated "Recruit a minion" form around a pure validation function,
- pass data from a child back into a slot with a scoped slot.

**Start from:** branch `step-02-reactivity-and-props` · **Reference solution:** branch
`step-03-events-and-forms` · **Time:** about 90 minutes.

**Concept guides:**

- [Props down, events up](../concepts/04-props-down-events-up.md): why data flows in one direction,
  what `emit` really does, and where state should live.
- [Two-way binding demystified](../concepts/05-two-way-binding-demystified.md): what `v-model`
  compiles to, on inputs and on components, and when not to use it.

```bash
git switch -c my-step-03 step-02-reactivity-and-props
```

```bash
npm run dev
```

---

## 1. The rule: props down, events up

In the dungeon, a minion cannot edit its own personnel file. A goblin who wants a rest does not
change the duty roster; it files a request with HR, and HR decides. That is exactly how Vue
components cooperate:

```text
            App.vue  (owns the roster)
             │   ▲
   props:    │   │   events:
   minion    │   │   "heal m-007", "rest m-007", "fire m-007"
             ▼   │
          MinionCard (shows one minion, asks for changes)
```

- **Props flow down.** The parent owns the data and hands it to children to display.
- **Events flow up.** A child that wants something changed _emits an event_. The parent listens and
  decides what to do.

The child never modifies the parent's data itself. That way, every change to the roster happens in
one place, `App.vue`, which makes the app far easier to reason about and to debug. The concept guide
explains the reasoning in depth; for now, let's build it.

## 2. Small building blocks

### 2.1 Two utilities

New minions need a unique ID and a hiring date. Create `src/utils/id.ts`:

```ts
/**
 * Creates a unique ID with a readable prefix, e.g. `createId('m')` returns `"m-3f2c…"`.
 *
 * `crypto.randomUUID()` is built into every modern browser and Node.js, so no library is needed.
 */
export function createId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}
```

And `src/utils/date.ts`:

```ts
import type { IsoDate } from '@/types/dungeon'

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
```

**Pitfall:** The comment in `toIsoDate` describes a real, common bug. `toISOString()` always
converts to UTC. A minion hired at 00:30 in Berlin would get yesterday's date. Use local date
parts when you mean "today, here".

### 2.2 Types for the form

The recruit form edits a minion that does not exist yet: it has no ID, no hiring date, and its HP
and stress are not up to the user. Add this below the `Minion` interface in
`src/types/dungeon.ts`:

```ts
/**
 * The fields a user fills in on the "Recruit a minion" form.
 * `id` and `hiredOn` are generated; a fresh recruit starts at full HP and zero stress.
 */
export type MinionDraft = Omit<Minion, 'id' | 'hiredOn' | 'hp' | 'stress'>

// ---------------------------------------------------------------------------
// Form helpers
// ---------------------------------------------------------------------------

/** One error message per invalid field. Missing key = field is valid. */
export type FieldErrors<T> = Partial<Record<keyof T & string, string>>

export interface ValidationResult<T> {
  valid: boolean
  errors: FieldErrors<T>
}
```

- `Omit<Minion, …>` derives the draft from `Minion` instead of repeating its fields. Add a field to
  `Minion` and the form type follows automatically.
- `FieldErrors<MinionDraft>` is an object with an optional string per field:
  `{ name?: string; species?: string; … }`. An empty object means "no errors".
- `keyof T & string` keeps only string keys. (`keyof` can also include `number` and `symbol` keys,
  which cannot be field names.)

### 2.3 A shared style for form controls

Every input, select and textarea needs the same dozen utility classes. Repeating them in every
field invites drift, so we register them once as a custom utility. Add this to the end of
`src/assets/main.css`:

```css
/*
 * Shared look for text inputs, selects and textareas.
 *
 * `@utility` registers a custom utility class, so `class="form-control"` works like any built-in
 * Tailwind class (including variants such as `sm:form-control`). We extract this one style because
 * every form field needs exactly the same dozen classes.
 */
@utility form-control {
  @apply w-full rounded-lg border border-crypt-700 bg-crypt-950/60 px-3 py-2 text-sm text-crypt-50 transition-colors placeholder:text-crypt-500 focus:border-ember-500 aria-[invalid=true]:border-blood-500;
}
```

- `@utility` is Tailwind v4's way to define your own utility class. `form-control` now works like
  `rounded-lg` or `p-4`.
- `aria-[invalid=true]:border-blood-500` turns the border red whenever the control has
  `aria-invalid="true"`. The visual error state and the accessible error state come from the same
  attribute, so they can never disagree.

**Why not a `FormInput` component instead?** A component would have to re-expose every attribute an
`<input>` can take (`type`, `min`, `max`, `step`, `autocomplete`, …). A class keeps the native
element, with all its features, and just styles it.

### 2.4 `BaseButton`: attributes fall through

Chapter 2 styled two buttons inline. We are about to add many more: heal, rest, fire, recruit,
cancel. Create `src/components/ui/BaseButton.vue`:

```vue
<script setup lang="ts">
type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'ghost-danger'
type ButtonSize = 'sm' | 'md'

const {
  variant = 'secondary',
  size = 'md',
  type = 'button',
} = defineProps<{
  variant?: ButtonVariant
  size?: ButtonSize
  /** Defaults to `button`, so a button inside a form never submits it by accident. */
  type?: 'button' | 'submit' | 'reset'
}>()

// `enabled:` limits the hover styles to buttons that are not disabled.
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-ember-600 text-crypt-950 enabled:hover:bg-ember-500',
  secondary:
    'border border-crypt-600 bg-crypt-800 text-crypt-100 enabled:hover:border-crypt-500 enabled:hover:bg-crypt-700',
  danger: 'bg-blood-600 text-crypt-50 enabled:hover:bg-blood-500',
  ghost: 'text-crypt-300 enabled:hover:bg-crypt-800 enabled:hover:text-crypt-100',
  'ghost-danger': 'text-blood-300 enabled:hover:bg-blood-500/10 enabled:hover:text-blood-200',
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
}
</script>

<template>
  <!--
    No click handling in here. A listener such as @click, written on <BaseButton>, is not a declared
    prop or emit, so Vue passes it through to this root <button>, together with attributes like
    `disabled`, `title` or extra classes.
  -->
  <button
    :type="type"
    class="inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40"
    :class="[VARIANT_CLASSES[variant], SIZE_CLASSES[size]]"
  >
    <slot />
  </button>
</template>
```

There is no `@click` handling, no `disabled` prop and no `title` prop in this component. Still,
`<BaseButton :disabled="…" @click="…">` will work. This is **attribute fallthrough**: anything you
write on a component tag that is not a declared prop or emit is passed on to the component's root
element. So `disabled`, `title`, `aria-*` attributes, extra `class` and `style`, and listeners like
`@click` all end up on the native `<button>`.

`class` is merged, not replaced. `<BaseButton class="ml-auto">` keeps all of `BaseButton`'s own
classes and adds `ml-auto`.

**Pitfall: merged classes do not override each other.** It is tempting to restyle a variant from the
outside: `<BaseButton variant="ghost" class="text-blood-300">`. The button then has both
`text-crypt-300` (from the variant) and `text-blood-300` (from you), and which one wins is decided by
the order of the rules in Tailwind's generated CSS, not by the order in the `class` attribute. In
our theme, `text-crypt-300` wins and the button stays gray. When a component needs a new look, give
it a new variant. That is why `BaseButton` has `ghost-danger`.

**Why does `type` default to `button`?** A native `<button>` inside a `<form>` defaults to
`type="submit"`. Without our default, every Cancel button in a form would submit it.

## 3. Cards that talk back

Replace `src/components/minions/MinionCard.vue`:

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'

import BaseBadge from '@/components/ui/BaseBadge.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import StatBar from '@/components/ui/StatBar.vue'
import ThreatLevelIndicator from '@/components/minions/ThreatLevelIndicator.vue'
import { SPECIES_PROFILES } from '@/data/species'
import type { Minion, MinionId } from '@/types/dungeon'
import { formatGold } from '@/utils/gold'

const { minion } = defineProps<{
  minion: Minion
}>()

// The card never changes the minion itself. It asks its parent to, by emitting an event with the
// minion's ID. Each key is an event name; the tuple lists the arguments the event carries.
const emit = defineEmits<{
  heal: [id: MinionId]
  rest: [id: MinionId]
  fire: [id: MinionId]
}>()

// Both values are derived from the prop. `computed` re-evaluates them when the minion changes
// and caches the result in between.
const profile = computed(() => SPECIES_PROFILES[minion.species])
const isKnockedOut = computed(() => minion.hp === 0)

// Local UI state: whether this card is asking "Really fire?". Nobody outside the card cares about
// it, so it lives here and not in the parent.
const isConfirmingFire = ref(false)
</script>

<template>
  <article
    class="minion-card flex flex-col rounded-2xl border border-crypt-700 bg-crypt-900/80 p-5 shadow-lg shadow-black/40"
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

    <footer class="mt-auto flex flex-wrap items-center gap-2 border-t border-crypt-800 pt-4">
      <template v-if="isConfirmingFire">
        <p class="mr-auto text-sm text-blood-300">Fire {{ minion.name }}?</p>
        <BaseButton size="sm" variant="danger" @click="emit('fire', minion.id)">
          Yes, fire
        </BaseButton>
        <BaseButton size="sm" variant="ghost" @click="isConfirmingFire = false">Cancel</BaseButton>
      </template>

      <template v-else>
        <BaseButton
          size="sm"
          :disabled="minion.hp === minion.maxHp"
          @click="emit('heal', minion.id)"
        >
          Heal
        </BaseButton>
        <BaseButton
          size="sm"
          :disabled="isKnockedOut || minion.stress === 0"
          @click="emit('rest', minion.id)"
        >
          Send to rest
        </BaseButton>

        <span v-if="minion.isUnionized" class="ml-auto text-xs text-crypt-400">
          Firing needs a union hearing
        </span>
        <BaseButton
          v-else
          size="sm"
          variant="ghost-danger"
          class="ml-auto"
          @click="isConfirmingFire = true"
        >
          Fire
        </BaseButton>
      </template>
    </footer>
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

### 3.1 Declaring events with `defineEmits`

```ts
const emit = defineEmits<{
  heal: [id: MinionId]
  rest: [id: MinionId]
  fire: [id: MinionId]
}>()
```

Like `defineProps`, `defineEmits` is a compiler macro with a type argument. Each key is an event
name; the tuple describes the arguments that come with it. `[id: MinionId]` means "one argument, a
minion ID". The labels (`id`) are only documentation, but they show up in your editor's tooltips.

`defineEmits` returns the `emit` function. `emit('heal', minion.id)` fires the event. TypeScript
checks both the name and the arguments: `emit('heel', minion.id)` and `emit('heal', 42)` are
compile errors.

In the template you can call `emit` directly: `@click="emit('heal', minion.id)"`.

### 3.2 What to send with an event

The card emits the minion's **ID**, not the minion object and not a new HP value. The event says
_what happened_ ("someone asked to heal m-007"), and the parent, which owns the data, decides _what
that means_. If the healing rules change tomorrow (heal by half, charge a fee, refuse during a raid),
only the parent changes. The card stays a pure view.

### 3.3 Local state stays local

```ts
const isConfirmingFire = ref(false)
```

Firing someone should not be one accidental click away. When you click **Fire**, the card switches
its footer to "Fire Snikkit Two-Knives? Yes, fire / Cancel". Only **Yes, fire** emits the event.

Where should `isConfirmingFire` live? Ask: _who else needs to know?_ Nobody. The parent does not
care which card is currently asking a question. So it is a `ref` inside the card. Each card instance
has its own, because `<script setup>` runs once per instance.

Contrast that with `minion.hp`: the stats bar, the "Wounded" count and the card all depend on it.
That state must live in a component that all of them can see, the parent.

**Rule of thumb:** keep state in the lowest component that every user of that state can reach.

### 3.4 Rules in the UI and rules in the owner

Union members cannot be fired without a hearing, so their cards show a note instead of the Fire
button (`v-if` / `v-else`). Knocked-out minions cannot rest, so that button is disabled. These are
conveniences for the user. The parent will enforce the same rules again when it handles the event,
because the owner of the data is the only place a rule is guaranteed to apply.

**Checkpoint:** Save and click **Heal** or **Send to rest** on a card. Nothing happens. That is
correct: the card emits an event, but nobody is listening yet. Open the Vue DevTools, switch to the
**Timeline** tab and enable **Component events**. Click **Heal** again: you see a `heal` event with
the minion's ID as its payload. The request was filed; HR just has not read it yet. **Fire** shows
its confirmation, and **Cancel** brings the buttons back.

## 4. Filters with `v-model` and `defineModel`

Finding one minion among twelve (soon more) needs a search box, a species filter and a "union
members only" checkbox.

### 4.1 `v-model` on native elements

`v-model` creates a two-way binding between a form control and a piece of state:

```html
<input v-model="search" type="search" />
```

Typing updates `search`; changing `search` in code updates the input. It works on every kind of
control and does the right thing for each: `value` and `input` for text fields, `checked` and
`change` for checkboxes, the selected option for `<select>`.

### 4.2 Giving a component a `v-model`

The filter controls belong in their own component, but the filter _values_ belong to `App.vue`,
which needs them to compute the visible minions. So the component must read values from its parent
and write changes back. That is a `v-model` on a component.

Create `src/components/minions/MinionFilters.vue`:

```vue
<script setup lang="ts">
import { SPECIES_PROFILES } from '@/data/species'
import { SPECIES, type Species } from '@/types/dungeon'

// Each `defineModel` declares one two-way binding. The parent writes
// `v-model:search="…"`; here, `search` behaves like a ref: reading it returns the parent's value,
// assigning to it asks the parent to update.
const search = defineModel<string>('search', { required: true })
const species = defineModel<Species | 'all'>('species', { required: true })
const unionOnly = defineModel<boolean>('unionOnly', { required: true })
</script>

<template>
  <div
    class="flex flex-wrap items-end gap-4 rounded-xl border border-crypt-800 bg-crypt-900/60 p-4"
    role="search"
  >
    <label class="flex min-w-48 flex-1 flex-col gap-1.5 text-sm font-medium text-crypt-200">
      Search by name
      <input v-model="search" type="search" placeholder="e.g. Grizzle" class="form-control" />
    </label>

    <label class="flex min-w-40 flex-col gap-1.5 text-sm font-medium text-crypt-200">
      Species
      <select v-model="species" class="form-control">
        <option value="all">All species</option>
        <option v-for="option in SPECIES" :key="option" :value="option">
          {{ SPECIES_PROFILES[option].pluralLabel }}
        </option>
      </select>
    </label>

    <label class="flex items-center gap-2 pb-2 text-sm text-crypt-200">
      <input v-model="unionOnly" type="checkbox" class="size-4 accent-ember-500" />
      Union members only
    </label>
  </div>
</template>
```

`defineModel('search')` declares a model named `search`. It gives you a ref-like value:

- **reading** `search.value` (or `search` in the template) returns what the parent passed in,
- **assigning** to it emits `update:search` with the new value, and the parent's `v-model` updates
  its own ref.

So `<input v-model="search">` inside the component is bound to the parent's state, through the
component. The parent uses it like this (you will add it in section 8):

```html
<MinionFilters
  v-model:search="search"
  v-model:species="speciesFilter"
  v-model:union-only="unionOnly"
/>
```

A component can have any number of named models. The name after the colon matches the name in
`defineModel`. In templates you may write it in kebab-case (`union-only`) for a `unionOnly` model,
the same way props work.

**Why isn't this "events up"?** It is. `v-model:search="search"` is shorthand for
`:search="search" @update:search="(value) => (search = value)"`. Data still goes down as a prop and
changes still come up as an event; `v-model` just writes both halves for you. The two-way binding
guide shows the compiled code.

The `<select>` binds option values with `:value="option"`. With `v-model`, a `<select>` hands back the
bound value itself, not its string form, so `species` stays typed as `Species | 'all'`.

## 5. `FormField`: label, control, message

Every field in the recruit form needs the same structure: a label, the control, and either a hint or
an error message, all connected for screen readers. Create `src/components/ui/FormField.vue`:

```vue
<script setup lang="ts">
import { computed, useId } from 'vue'

const {
  label,
  error,
  hint,
  required = false,
} = defineProps<{
  label: string
  /** Validation message. When set, the field is marked invalid and the hint is hidden. */
  error?: string
  /** Help text shown below the control while there is no error. */
  hint?: string
  required?: boolean
}>()

// A unique, stable ID per FormField instance, used to connect the label, the control and the
// messages for assistive technology.
const id = useId()
const hintId = `${id}-hint`
const errorId = `${id}-error`

/** The ID of whichever message is currently visible, for the control's `aria-describedby`. */
const describedBy = computed(() => {
  if (error) return errorId
  if (hint) return hintId
  return undefined
})
</script>

<template>
  <div>
    <label :for="id" class="block text-sm font-medium text-crypt-200">
      {{ label }}
      <template v-if="required">
        <span class="text-blood-400" aria-hidden="true">*</span>
        <span class="sr-only">(required)</span>
      </template>
    </label>

    <div class="mt-1.5">
      <!--
        A scoped slot: the parent renders the actual control and receives these values from us,
        so the input can use the same ID as the label above.
      -->
      <slot :id="id" :invalid="Boolean(error)" :described-by="describedBy" />
    </div>

    <p v-if="error" :id="errorId" class="mt-1.5 text-xs text-blood-300">{{ error }}</p>
    <p v-else-if="hint" :id="hintId" class="mt-1.5 text-xs text-crypt-400">{{ hint }}</p>
  </div>
</template>
```

Two new features:

**`useId()`** (Vue 3.5) generates an ID that is unique per component instance and stable between
server and client rendering. The label's `for`, the input's `id` and the messages' IDs are all
derived from it. You never invent IDs by hand, so two forms on one page cannot collide.

**Scoped slots.** The input itself is not part of `FormField`. The parent renders it into the slot,
because only the parent knows whether it is a text input, a select or a textarea. But the input
needs the ID that `FormField` generated. A **scoped slot** solves this: `<slot :id="id" … />` passes
values _up_ into the slot content. The parent receives them with `v-slot`:

```html
<FormField v-slot="{ id, invalid, describedBy }" label="Name" :error="errors.name">
  <input :id="id" :aria-invalid="invalid" :aria-describedby="describedBy" />
</FormField>
```

Regular slots let a parent pass markup in. Scoped slots additionally let the child pass data back
out to that markup. (Slot props written in kebab-case, like `:described-by`, arrive in camelCase,
`describedBy`.)

**Accessibility:** `aria-describedby` points at whichever message is visible. The red asterisk is
hidden from screen readers (`aria-hidden`), and a visually hidden "(required)" (Tailwind's `sr-only`)
says the same thing in words. When a screen reader user focuses the name field after a failed
submit, they hear roughly "Name (required), invalid entry, Every minion needs a name."

## 6. Validation as a pure function

The rules for a valid recruit have nothing to do with Vue: a name of 2 to 40 characters that is not
already taken, HP between 1 and 999, and so on. Keep them out of the component. Create
`src/utils/validation.ts`:

```ts
import {
  SPECIES,
  THREAT_LEVELS,
  type FieldErrors,
  type MinionDraft,
  type ValidationResult,
} from '@/types/dungeon'

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

/**
 * Number inputs can produce `''` when they are empty, even though the draft's type says `number`.
 * Checking `typeof` at runtime protects us from that gap between the type and reality.
 */
function isIntegerInRange(value: unknown, min: number, max: number): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
}
```

**Why a pure function?**

- **Testable.** In the final chapter, testing it takes a few lines: call it with data, check the
  result. No component mounting, no DOM.
- **Reusable.** Anything that creates minions later (an import, a different form) uses the same
  rules.
- **Honest.** The function receives everything it depends on as arguments, including
  `existingNames`. Nothing is hidden.

`isIntegerInRange` checks `typeof value === 'number'` even though the draft's type says `number`.
That is deliberate: when a user clears a number input, `v-model` hands back an empty string `''`.
TypeScript cannot know what the browser will put into an input at runtime, so validation code
checks reality, not just the type.

## 7. The recruit form

Create `src/components/minions/MinionForm.vue`:

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'

import BaseButton from '@/components/ui/BaseButton.vue'
import FormField from '@/components/ui/FormField.vue'
import { SPECIES_PROFILES } from '@/data/species'
import { SPECIES, THREAT_LEVELS, type FieldErrors, type MinionDraft } from '@/types/dungeon'
import {
  MAX_HP_LIMIT,
  MINION_BIO_MAX_LENGTH,
  SALARY_LIMIT,
  validateMinionDraft,
} from '@/utils/validation'

const { existingNames } = defineProps<{
  /** Names already on the roster, used to reject duplicates. */
  existingNames: readonly string[]
}>()

const emit = defineEmits<{
  /** The user submitted a valid draft. The parent decides what to do with it. */
  submit: [draft: MinionDraft]
  /** The user gave up. The parent decides whether to hide the form. */
  cancel: []
}>()

function createEmptyDraft(): MinionDraft {
  const { baseHp, baseSalary } = SPECIES_PROFILES.goblin
  return {
    name: '',
    species: 'goblin',
    maxHp: baseHp,
    threatLevel: 1,
    salary: baseSalary,
    isUnionized: false,
    bio: '',
  }
}

// The form edits its own private copy of the data. Nothing outside the form sees the half-typed
// draft; the parent only receives a finished, valid one through the `submit` event.
const draft = ref<MinionDraft>(createEmptyDraft())

// Validation runs continuously, but errors are only shown after the first submit attempt, so the
// user is not scolded for an empty name before typing a single letter.
const hasAttemptedSubmit = ref(false)
const validation = computed(() => validateMinionDraft(draft.value, existingNames))
const errors = computed<FieldErrors<MinionDraft>>(() =>
  hasAttemptedSubmit.value ? validation.value.errors : {},
)

/** Picking a species fills in its typical HP and salary. The user can still change both. */
function applySpeciesDefaults(): void {
  const profile = SPECIES_PROFILES[draft.value.species]
  draft.value.maxHp = profile.baseHp
  draft.value.salary = profile.baseSalary
}

function handleSubmit(): void {
  hasAttemptedSubmit.value = true
  if (!validation.value.valid) return

  // Emit a plain copy with tidy text fields. An empty bio is left out instead of stored as ''.
  const { bio, ...fields } = draft.value
  const recruit: MinionDraft = { ...fields, name: fields.name.trim() }
  const trimmedBio = bio?.trim()
  if (trimmedBio) recruit.bio = trimmedBio

  emit('submit', recruit)

  draft.value = createEmptyDraft()
  hasAttemptedSubmit.value = false
}
</script>

<template>
  <form
    class="rounded-2xl border border-ember-700/40 bg-crypt-900/80 p-5 shadow-lg shadow-black/40 sm:p-6"
    novalidate
    @submit.prevent="handleSubmit"
  >
    <h3 class="text-lg font-semibold text-crypt-50">Recruit a minion</h3>
    <p class="mt-1 text-sm text-crypt-400">Fields marked with * are required.</p>

    <div class="mt-5 grid gap-5 sm:grid-cols-2">
      <FormField
        v-slot="{ id, invalid, describedBy }"
        label="Name"
        :error="errors.name"
        required
        class="sm:col-span-2"
      >
        <input
          :id="id"
          v-model="draft.name"
          type="text"
          autocomplete="off"
          class="form-control"
          :aria-invalid="invalid"
          :aria-describedby="describedBy"
        />
      </FormField>

      <FormField
        v-slot="{ id, invalid, describedBy }"
        label="Species"
        :error="errors.species"
        required
      >
        <select
          :id="id"
          v-model="draft.species"
          class="form-control"
          :aria-invalid="invalid"
          :aria-describedby="describedBy"
          @change="applySpeciesDefaults"
        >
          <option v-for="species in SPECIES" :key="species" :value="species">
            {{ SPECIES_PROFILES[species].icon }} {{ SPECIES_PROFILES[species].label }}
          </option>
        </select>
      </FormField>

      <FormField
        v-slot="{ id, invalid, describedBy }"
        label="Threat level"
        :error="errors.threatLevel"
        required
      >
        <select
          :id="id"
          v-model="draft.threatLevel"
          class="form-control"
          :aria-invalid="invalid"
          :aria-describedby="describedBy"
        >
          <option v-for="level in THREAT_LEVELS" :key="level" :value="level">{{ level }}</option>
        </select>
      </FormField>

      <FormField
        v-slot="{ id, invalid, describedBy }"
        label="Max HP"
        hint="Pre-filled for the species. Adjust it for veterans."
        :error="errors.maxHp"
        required
      >
        <input
          :id="id"
          v-model.number="draft.maxHp"
          type="number"
          min="1"
          :max="MAX_HP_LIMIT"
          step="1"
          class="form-control"
          :aria-invalid="invalid"
          :aria-describedby="describedBy"
        />
      </FormField>

      <FormField
        v-slot="{ id, invalid, describedBy }"
        label="Monthly salary (gp)"
        :error="errors.salary"
        required
      >
        <input
          :id="id"
          v-model.number="draft.salary"
          type="number"
          min="0"
          :max="SALARY_LIMIT"
          step="10"
          class="form-control"
          :aria-invalid="invalid"
          :aria-describedby="describedBy"
        />
      </FormField>

      <FormField
        v-slot="{ id, invalid, describedBy }"
        label="Bio"
        :hint="`Optional. Up to ${MINION_BIO_MAX_LENGTH} characters.`"
        :error="errors.bio"
        class="sm:col-span-2"
      >
        <textarea
          :id="id"
          v-model="draft.bio"
          rows="3"
          class="form-control resize-y"
          :aria-invalid="invalid"
          :aria-describedby="describedBy"
        ></textarea>
      </FormField>

      <label class="flex items-center gap-3 text-sm text-crypt-200 sm:col-span-2">
        <input v-model="draft.isUnionized" type="checkbox" class="size-4 accent-ember-500" />
        Member of the minion union
      </label>
    </div>

    <div class="mt-6 flex flex-wrap justify-end gap-3">
      <BaseButton variant="ghost" @click="emit('cancel')">Cancel</BaseButton>
      <BaseButton type="submit" variant="primary">Recruit</BaseButton>
    </div>
  </form>
</template>
```

### 7.1 The form owns a private draft

The form edits `draft`, its own `ref`. The roster does not see half-typed names; the parent only
receives a finished, valid draft through the `submit` event. Compare that with the filters, which
update the parent on every keystroke because the roster _should_ react live.

| | Filters | Recruit form |
| --- | --- | --- |
| Parent sees changes | On every keystroke | Only on submit |
| Mechanism | `v-model` on the component | Local `ref` + `submit` event |
| Can be abandoned | Nothing to abandon | Cancel throws the draft away |

Both are correct. Choose live binding when every change is meaningful to the parent, and a local
draft plus an event when the parent should only see the finished result.

`handleSubmit` emits a copy (`{ ...fields, name: … }`), not `draft.value` itself. The parent gets a
plain object that it can keep, and the form is free to reset its draft afterwards.

### 7.2 `v-model` details worth knowing

- `v-model="draft.species"` on a `<select>` and `v-model="draft.isUnionized"` on a checkbox: one
  directive, the right behavior for each control.
- `v-model.number="draft.maxHp"` converts the input's string to a number. (Vue does this
  automatically for `type="number"`; writing `.number` makes the intent visible to readers.) An
  empty field still yields `''`, which is why validation checks types at runtime.
- Other modifiers exist: `.trim` strips whitespace on every input, `.lazy` syncs on `change`
  instead of `input`. We trim once, on submit, so the user can type spaces freely.

### 7.3 Validate always, complain later

```ts
const validation = computed(() => validateMinionDraft(draft.value, existingNames))
const errors = computed<FieldErrors<MinionDraft>>(() =>
  hasAttemptedSubmit.value ? validation.value.errors : {},
)
```

Validation is a `computed`, so it always reflects the current draft. But errors only become visible
after the first submit attempt. From then on they update live: fix the name and its error disappears
as you type. This is the friendliest common pattern: no red borders on an untouched form, immediate
feedback once the user has asked for it.

`computed<FieldErrors<MinionDraft>>` names the type explicitly, because the two branches (`errors`
and `{}`) would otherwise be inferred as two different types.

### 7.4 Form plumbing

- `@submit.prevent="handleSubmit"` listens to the form's submit event (fired by the submit button
  _and_ by pressing Enter in a field) and calls `preventDefault()`, so the browser does not reload
  the page.
- `novalidate` turns off the browser's built-in validation bubbles. We show our own messages,
  consistently styled and announced to screen readers.
- `@change="applySpeciesDefaults"` on the species select pre-fills HP and salary from the species
  profile. It is an event handler, not a watcher: it runs only when the _user_ changes the species,
  so it never overwrites values the user typed for other reasons.

## 8. Wire it up in `App.vue`

Now the parent listens, owns the filter state, and turns drafts into minions. Replace `src/App.vue`:

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

// The roster is reactive state. `structuredClone` gives us our own deep copy, so changes made
// here never leak back into the seed module.
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
          <BaseButton variant="primary" :disabled="isRecruiting" @click="isRecruiting = true">
            Recruit a minion
          </BaseButton>
          <BaseButton variant="danger" @click="simulateRaid">Simulate a raid</BaseButton>
          <BaseButton @click="callHealer">Call the healer</BaseButton>
        </div>
      </div>

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
    </main>
  </div>
</template>
```

Walk through the new parts:

- **Listening.** `@heal="healMinion"` on `<MinionCard>` calls `healMinion` with the event's
  arguments, the minion ID. Events are camelCase in `defineEmits` and can be written in camelCase or
  kebab-case in the parent's template.
- **The owner enforces the rules.** `restMinion` refuses knocked-out minions and `fireMinion` refuses
  union members, even though the card already prevents both in the UI.
- **Replacing vs. mutating.** `fireMinion` assigns a new, filtered array to `minions.value`;
  `recruitMinion` calls `unshift` on the existing one. Both trigger reactivity: assigning goes
  through the ref's setter, `unshift` through the reactive array.
- **Filtering is derived state.** `filteredMinions` is a `computed` over the roster and the three
  filter refs. The cards render `filteredMinions`; the statistics still use the full roster.
- **The form is conditional.** `v-if="isRecruiting"` creates the form when needed and destroys it on
  Cancel or submit. Destroying it also throws away its local draft, so the next time it opens it is
  empty.
- **Parent changes flow down.** "Reset filters" just resets the three refs. The filter inputs update
  because they are bound to those refs through `v-model`.

**Checkpoint:**

- **Heal**, **Send to rest** and **Fire** work on each card. Resting lowers stress by 25, and is
  disabled for knocked-out minions and minions with zero stress. Heal is disabled at full HP.
- Union members show "Firing needs a union hearing" instead of a Fire button. Firing anyone else
  asks for confirmation, then removes the card and updates headcount and payroll.
- Typing "gr" in the search box leaves only Grizzle Snaggletooth. Choosing a species, or checking
  "Union members only", narrows the list further. "Showing X of Y minions" follows along.
- Filters that match nobody show a "Reset filters" button that clears all three.
- **Recruit a minion** opens the form. Submitting it empty marks the name in red. Typing an existing
  name, in any capitalization, shows "A minion with this name already works here." Picking
  _Beholder_ fills in 190 HP and 1,400 gp. A valid submission closes the form and the new minion
  appears first in the roster with full HP and zero stress.
- In the DevTools Timeline, every card action shows up as a component event.

## 9. Run the quality checks

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
git commit -m "feat: add card actions, roster filters and a recruit form"
```

## 10. Try it yourself

1. **Break the rule on purpose.** In `MinionCard.vue`, change the Heal button's handler to
   `@click="minion.hp = minion.maxHp"`. It works: the minion is healed. Now ask: when the healing
   rules change, how many components do you have to search? And in the DevTools Timeline, can you
   still see who changed the HP? Undo it. The concept guide explains why Vue lets this happen and
   why you should not rely on it.
2. **Add a "Promote" action.** Add a `promote` event to the card that raises the threat level by one,
   up to 5. Disable the button at level 5. Which component decides the maximum, and why?
3. **Feel the difference of `.lazy`.** In `MinionFilters.vue`, change the search input to
   `v-model.lazy="search"`. The roster now filters only when the field loses focus or you press
   Enter. Undo.
4. **Show a recruit counter.** Display "Recruited this session: N" next to the headcount. Where does
   the counter live, and which function updates it?

## Recap

- **Props down, events up.** Parents own data and pass it down; children ask for changes by emitting
  events. Only the owner modifies the data.
- **`defineEmits<{ name: [args] }>()`** declares typed events. Emit _what happened_ (an ID), and let
  the parent decide _what it means_.
- **Local UI state** (like a confirmation prompt) lives in the component that uses it. Shared state
  lives in the lowest component that all its users can reach.
- **Fallthrough attributes**: undeclared attributes, classes and listeners land on a component's root
  element. Classes merge, but do not override each other.
- **`v-model`** binds form controls two-way. On a component, `defineModel` gives you a ref-like model
  that reads a prop and writes through an `update:` event.
- **Forms** edit a private draft and emit the finished result. Validation lives in a pure function.
- **Scoped slots** let a child pass data, such as a generated ID, back into the parent's slot
  content.

`App.vue` now holds the roster, the filters, the recruit form, five actions and the statistics:
more than 200 lines, and we have not even started on sector planning or leave requests. Everything
lives on a single page, in a single component. In [Chapter 4: Routing and Views](./04-routing-and-views.md)
we split DungeonHR into pages with their own URLs, including a detail page for each minion.

**Go deeper:**

- [Props down, events up](../concepts/04-props-down-events-up.md)
- [Two-way binding demystified](../concepts/05-two-way-binding-demystified.md)
