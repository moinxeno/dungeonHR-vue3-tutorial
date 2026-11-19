# Typing Components with TypeScript

> **Used in:** [Chapter 2: Reactivity and Props](../build/02-reactivity-and-props.md) and every
> chapter after it.

TypeScript in a Vue project does two jobs. It types your ordinary code (utilities, data, stores),
and it types the **contracts between components**: which props a component accepts, which events it
emits, what a template may pass. The second job is what makes refactoring a fifty-component app
feel safe.

This guide covers:

1. what `defineProps<T>()` really does,
2. how reactive props destructuring works,
3. how to design a component's props,
4. how templates get type-checked,
5. the TypeScript patterns used in `src/types/dungeon.ts`.

It assumes basic TypeScript: annotations, interfaces, union types. It does not assume you have
used TypeScript with Vue before.

---

## 1. A component is a function, props are its parameters

Think of `<StatBar label="Stress" :value="minion.stress" :max="100" />` as a function call:
`StatBar({ label: 'Stress', value: minion.stress, max: 100 })`. Like any function, a component
benefits from typed parameters:

- **At the call site** (the parent's template), a wrong or missing prop is underlined immediately.
- **Inside the component**, you get autocompletion on `minion.` and cannot read a field that does
  not exist.
- **When you change the contract** (rename a prop, add a required one), every call site that
  breaks lights up in `npm run type-check`.

## 2. What `defineProps<T>()` compiles to

You write a type:

```ts
const {
  label,
  value,
  max,
  variant = 'health',
} = defineProps<{
  label: string
  value: number
  max: number
  variant?: StatBarVariant
}>()
```

Types are erased at runtime, yet Vue needs to know at runtime which attributes are props (they go
into the props object) and which are not (they fall through to the root element as HTML
attributes). So the SFC compiler reads your type and **generates a runtime props declaration** from
it. This is the real compiler output for `StatBar.vue`:

```ts
export default _defineComponent({
  __name: 'StatBar',
  props: {
    label: { type: String, required: true },
    value: { type: Number, required: true },
    max: { type: Number, required: true },
    variant: { type: String, required: false, default: 'health' },
  },
  setup(__props) {
    const percent = computed(() => {
      if (__props.max <= 0) return 0
      return Math.min(100, Math.max(0, Math.round((__props.value / __props.max) * 100)))
    })
    // …
  },
})
```

Observations:

- **`defineProps` is gone.** It is a _compiler macro_: it looks like a function call, but it is
  never called at runtime and is never imported. The compiler replaces it.
- **TypeScript types became runtime constructors.** `string` → `String`, `number` → `Number`. In
  development, Vue warns in the console if a parent passes the wrong runtime type.
- **The runtime check is coarser than the type.** `variant?: 'health' | 'stress'` became just
  `type: String`. At runtime, Vue only checks "is it a string?". The precise check (only these two
  strings) happens at compile time in your editor and in `vue-tsc`. Types are the real guard;
  runtime checks are a development-time safety net.
- **The default from the destructuring pattern** became `default: 'health'`.

### What the compiler can and cannot read

The compiler analyzes your type _statically_, without running TypeScript's full type checker. It
handles:

- inline object types, interfaces and type aliases in the same file,
- types imported from other files (`import type { Minion } from '@/types/dungeon'`),
- unions, intersections, optional properties, literal types, `Record`, `Partial`, `Pick`, `Omit`
  and similar common utility types.

It cannot resolve arbitrarily complex type-level computation (deeply conditional or mapped types).
If it fails, you get a compile error such as _"Unresolvable type reference"_. The fix is almost
always to give the props an explicit interface.

## 3. Reactive props destructure

In chapter 2, `const { value } = defineProps<…>()` destructures the props, and yet `value` stays
reactive inside `computed`. As the compiled output shows, there is no destructuring at runtime at
all: the compiler **rewrites every reference** to `value` in your script into `__props.value`, a
property access on the reactive props object. A read inside `computed` is therefore tracked, and
the computed updates when the parent passes a new value.

This feature arrived in Vue 3.5. You will meet two other styles in older code and documentation,
and it helps to recognize them:

```ts
// Style 1: keep the props object (works in every Vue 3 version)
const props = defineProps<{ value: number; variant?: StatBarVariant }>()
const percent = computed(() => props.value)

// Style 2: defaults via withDefaults (before Vue 3.5)
const props = withDefaults(defineProps<{ value: number; variant?: StatBarVariant }>(), {
  variant: 'health',
})
```

DungeonHR uses destructuring throughout: it is shorter, defaults read like normal JavaScript, and
templates look identical either way.

**The one rule to remember:** the rewrite is lexical. It turns `value` into `__props.value` _where
you write it_. If you pass `value` to a function, that function receives the current number, not
something it can observe. When a function needs to keep watching a prop, pass a getter:

```ts
watch(() => value, (next) => console.log('value changed to', next))
```

The [reactivity guide](./02-reactivity-under-the-hood.md#passing-a-destructured-prop-out-of-the-component)
explains why in terms of tracking.

### Optional and boolean props

- An optional prop that the parent does not pass is `undefined`, unless you give it a default.
- **Boolean props are special.** Vue casts a missing boolean prop to `false`, not `undefined`, and
  treats a bare attribute as `true`, just like HTML's `disabled`:

  ```ts
  defineProps<{ compact?: boolean }>()
  ```

  ```html
  <MinionCard />          <!-- compact === false -->
  <MinionCard compact />  <!-- compact === true  -->
  ```

### Props are read-only

Props belong to the parent. Inside the child, they are read-only: TypeScript rejects
`value = 5` on a destructured prop, and Vue warns at runtime if you try to assign to `props.value`.

There is a loophole. When a prop is an object, such as `minion`, nothing technically stops a child
from writing `minion.hp = 0`: the prop itself is not reassigned, the object it points to is changed,
and since that object is reactive, the change even shows up everywhere. **Don't do it.** It means
any component could change shared state in ways the owner cannot see or control. Chapter 3 shows
the right way, _props down, events up_.

## 4. Designing a component's props

Types also push you toward better component interfaces. The decisions behind DungeonHR's
components:

### Domain components take domain objects

`MinionCard` takes `minion: Minion`, not eight separate props. The card is a view _of a minion_;
the interface says so, and it stays stable when `Minion` gains fields. Passing eight props would
also mean eight places to update in every parent.

### Generic components take primitives

`StatBar` takes `label`, `value` and `max`. It has no idea what a minion is, and that is what makes
it reusable: the same component shows HP, stress and, later, a sector's budget usage.

**The test:** could this component be useful in a different app? If yes, keep domain types out of
its props.

### Variants are unions, not booleans

`BaseBadge` has `tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'accent'`. The alternative,
`isSuccess?: boolean; isDanger?: boolean; …`, allows contradictions such as
`<BaseBadge is-success is-danger>`. A union makes illegal states unrepresentable: exactly one tone,
always.

### Map unions to classes with `Record`

```ts
const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: '…',
  success: '…',
  // …
}
```

`Record<BadgeTone, string>` requires an entry for every member of the union. Add `'info'` to
`BadgeTone`, and the compiler points at the map until you add its classes. It also keeps Tailwind
happy: every class name appears in full in the source.

## 5. Type-checked templates

Plain `tsc` does not understand `.vue` files. Two tools do:

- **Vue - Official** (the VS Code extension, built on Volar) type-checks as you type.
- **`vue-tsc`** does the same on the command line. `npm run type-check` runs it; `npm run build`
  runs it in parallel with the bundler.

Under the hood, both convert each `.vue` file into a virtual TypeScript file in which your template
is expressed as TypeScript code. So the template is checked with the same rigor as your script:

| In the template | Error |
| --- | --- |
| `<MinionCard />` | Missing required prop `minion` |
| `<ThreatLevelIndicator :level="minion.hp" />` | Type `number` is not assignable to type `1 \| 2 \| 3 \| 4 \| 5` |
| `{{ minion.nmae }}` | Property `nmae` does not exist on type `Minion` |
| `<StatBar labl="HP" … />` | Missing required prop `label` (the typo is treated as an unknown attribute) |

**Why does the build run type-checking separately?** Vite strips types without checking them, which
is what keeps it fast. Type errors would not stop the dev server or the bundle. Running `vue-tsc`
in `npm run build` makes sure type errors fail the build, for example in CI.

## 6. Typing state: `ref` and `computed`

TypeScript infers most types from the initial value:

```ts
const count = ref(0) // Ref<number>
const name = ref('Grizzle') // Ref<string>
const isOpen = ref(false) // Ref<boolean>
```

Provide the type explicitly when the initial value does not tell the whole story:

```ts
const minions = ref<Minion[]>(structuredClone(seedMinions)) // documents intent
const selected = ref<Minion | null>(null) // null now, a minion later
const filter = ref<Species | 'all'>('all') // without it: Ref<string>
```

`computed` infers its type from the getter's return value. `rosterStats` in `App.vue` is inferred
as `ComputedRef<{ label: string; value: string }[]>` without any annotation.

## 7. The patterns in `dungeon.ts`

### Derive unions from `as const` arrays

```ts
export const SPECIES = ['goblin', 'skeleton', 'orc', 'minotaur', 'beholder', 'werewolf'] as const
export type Species = (typeof SPECIES)[number]
```

Reading it from the inside out:

1. `as const` makes the array a `readonly ['goblin', 'skeleton', …]` tuple of literal types instead
   of `string[]`.
2. `typeof SPECIES` lifts the value into the type world.
3. `[number]` indexes the tuple type with "any numeric index", giving the union of its elements.

The alternative, a separate `type Species = 'goblin' | …` plus an array for the UI, is two lists
that must be kept in sync by hand. Eventually someone adds a species to one and not the other.

### Prefer string unions over `enum`

TypeScript `enum`s generate runtime code, behave differently from the rest of the type system, and
are not supported by Node.js's native type stripping. String-literal unions are plain values at
runtime, serialize to JSON unchanged, and read naturally in templates: `species === 'werewolf'`.

### Aliases that carry meaning

```ts
export type Gold = number
export type IsoDate = string
export type MinionId = string
```

They add no type safety (a `Gold` and a `number` are interchangeable), but they add meaning to
every signature: `formatGold(amount: Gold)` explains itself. (Stricter "branded types" exist, which
make `MinionId` and `SectorId` incompatible. We skip them here; they add friction for little gain in
an app this size.)

### Dates as ISO strings

`hiredOn: IsoDate` stores `'2019-03-14'`, not a `Date`. Reasons:

- **Serialization.** `JSON.parse(JSON.stringify(new Date()))` returns a string, not a `Date`. State
  that is persisted (chapter 6) or sent over the network would silently change type.
- **No time zone surprises.** A calendar date has no time zone. `new Date('2019-03-14')` is midnight
  UTC, which is the previous evening in America. A string is just the date.
- **Cloning and comparison.** Strings are trivially comparable (`'2019-03-14' < '2020-01-10'` works
  for ISO dates) and copy without surprises.

Convert to `Date` only at the edges, when you need to calculate or format.

### `interface` vs `type`

DungeonHR uses `interface` for object shapes (`Minion`, `SpeciesProfile`) and `type` for everything
else (unions, aliases, derived types). Both work for objects; picking one convention is what
matters. Interfaces give slightly clearer error messages and can be extended with `extends`, which
the domain model uses later for leave requests.

### A preview: exhaustive checks with `never`

Later chapters model alerts and requests as _discriminated unions_ (a union of object types with a
shared `kind` field). The compiler can then verify that a `switch` handles every case:

```ts
function describe(level: ThreatLevel): string {
  switch (level) {
    case 1:
      return 'Mildly inconvenient'
    case 2:
      return 'Annoying'
    case 3:
      return 'Dangerous'
    case 4:
      return 'Terrifying'
    case 5:
      return 'Ballad-worthy'
    default: {
      const unreachable: never = level // compile error if a case is missing
      return unreachable
    }
  }
}
```

Add `6` to `THREAT_LEVELS`, and `level` is no longer `never` in the default branch, so the
assignment fails to compile. That points you to every `switch` that needs updating.

## Summary

| Topic | Key point |
| --- | --- |
| `defineProps<T>()` | A compiler macro. The type generates a runtime props declaration; precise checks happen at compile time. |
| Destructured props | Rewritten to `__props.x` by the compiler, so they stay reactive. Pass a getter (`() => x`) to functions that need to observe them. |
| Defaults | Write them in the destructuring pattern: `variant = 'health'`. |
| Read-only | Never reassign props or mutate objects received as props. |
| Component design | Domain components take domain objects; generic ones take primitives; variants are unions. |
| Template checking | `vue-tsc` and Vue - Official check templates as TypeScript. `npm run build` fails on type errors. |
| Domain patterns | `as const` arrays + `(typeof X)[number]`; `Record<Union, T>` for complete maps; ISO strings for dates. |

## Check your understanding

1. A parent writes `<BaseBadge tone="danjer">Union</BaseBadge>`. What happens in the editor, in
   `npm run type-check`, and in the browser at runtime?
2. Why does `SPECIES_PROFILES` use `Record<Species, SpeciesProfile>` instead of
   `{ [key: string]: SpeciesProfile }`?

<details>
<summary>Answers</summary>

1. The editor underlines it and `npm run type-check` fails: `'danjer'` is not assignable to
   `BadgeTone`. In the browser (if you ignore the error, since Vite does not type-check), there is
   no runtime warning, because the runtime check only verifies "is a string". `TONE_CLASSES['danjer']`
   is `undefined`, so the badge renders without color classes. This is why the type check in the
   build matters.
2. `Record<Species, …>` requires exactly one entry per species: a missing species is a compile error,
   and so is a misspelled key. With a string index signature, any key is allowed and none is
   required, so the compiler could not catch a forgotten or misspelled species. Also,
   `SPECIES_PROFILES[minion.species]` is typed as `SpeciesProfile`, not `SpeciesProfile | undefined`,
   which it would be with an index signature under our `noUncheckedIndexedAccess` setting.

</details>

## Further reading

- [Vue docs: TypeScript with Composition API](https://vuejs.org/guide/typescript/composition-api.html)
- [Vue docs: Props](https://vuejs.org/guide/components/props.html), including reactive props
  destructure
- [Vue docs: Using Vue with TypeScript, IDE support](https://vuejs.org/guide/typescript/overview.html)
- [TypeScript handbook: Literal types and `as const`](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#literal-types)
