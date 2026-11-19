# Composables and Lifecycle

> **Used in:** [Chapter 6: Composables and Persistence](../build/06-composables-and-persistence.md)

Composables are the Composition API's answer to "how do I reuse logic that has state?". They look
deceptively simple: a function that calls `ref` and `computed` and returns the results. This guide
explains why that is enough, what rules make it work, and the parts of Vue that composables rely on:
the component lifecycle, effect scopes, and the difference between `computed`, `watch` and
`watchEffect`.

---

## 1. The problem composables solve

Suppose two components need a live clock. With what you knew before chapter 6, each would contain:

```ts
const now = ref(new Date())
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(() => (now.value = new Date()), 1000)
})
onUnmounted(() => clearInterval(timer))
const currentShift = computed(() => shiftAt(now.value))
```

Copy-paste works until someone fixes a bug in one copy. A utility function cannot help, because this
code has **state** (`now`), **derived values** (`currentShift`) and **lifecycle** (start and stop the
timer). A component cannot help either: there is nothing to render.

Older Vue had **mixins** for this: objects whose options were merged into a component. They had three
well-known problems:

| Mixin problem | Composable answer |
| --- | --- |
| Where does `this.now` come from? With several mixins, you cannot tell. | `const { now } = useShiftClock()`: the source is right there. |
| Two mixins both define `now`: one silently wins. | Destructuring lets you rename: `const { now: clockNow } = useShiftClock()`. |
| Mixins cannot take parameters per use. | Composables are functions: `useShiftClock(5000)`. |

## 2. Why "just a function" works

A composable is an ordinary function. It works because of two properties of Vue's reactivity that you
met in [reactivity under the hood](./02-reactivity-under-the-hood.md):

1. **Reactivity is not tied to components.** A `ref` created inside any function is fully reactive.
   Components re-render when they _read_ it, wherever it was created.
2. **Vue knows which component is currently being set up.** While `<script setup>` runs, Vue keeps a
   pointer to the current component instance (and its effect scope). Lifecycle hooks and watchers
   created during that time are registered on it, even when they are created deep inside a function
   you called.

So `useShiftClock()` called in `ShiftClock.vue`'s `<script setup>` creates a `ref` (reactive anywhere)
and calls `onMounted` and `onUnmounted` (attached to `ShiftClock`, the component being set up). Each
component instance that calls it gets its own `now` and its own timer, because the function runs once
per instance.

### The one rule: call composables synchronously during setup

Because hooks attach to "the component currently being set up", composables must be called while
setup is running, synchronously:

```ts
// ✓ top level of <script setup>
const clock = useShiftClock()

// ✗ inside an event handler: setup is long over, there is no current instance
function onClick() {
  const clock = useShiftClock() // onMounted: "no active component instance" warning
}

// ✗ after an await: by the time the promise resolves, setup has finished
await loadSomething()
const clock = useShiftClock()
```

(`<script setup>` with a top-level `await` is a special case: the compiler restores the instance after
the `await`. Plain `async` functions do not get that treatment.)

## 3. Conventions for writing composables

| Convention | Why |
| --- | --- |
| Name starts with `use` | Signals "call me during setup"; tooling and readers rely on it. |
| Return a plain object of refs | Callers can destructure without losing reactivity: `const { alerts } = …`. |
| Accept `MaybeRefOrGetter<T>` for inputs, read with `toValue` | Callers can pass refs, getters or plain values. |
| Clean up every side effect | Timers, listeners and subscriptions must stop when the owner goes away. |
| Keep the pure logic outside | Rules as plain functions; the composable only adds reactivity. Easier to test and reuse. |
| Expose read-only state where callers should not write | `readonly(now)` makes the contract explicit. |

### Returning refs, not a reactive object

```ts
return { now, currentShift } // ✓ refs: destructuring keeps them reactive
return reactive({ now, currentShift }) // ✗ destructuring copies values, like any reactive object
```

A caller who wants a single object can still wrap the result: `const clock = reactive(useShiftClock())`.
The other way round is not possible.

### Flexible inputs: `MaybeRefOrGetter` and `toValue`

```ts
export function useAggroCalculator(
  minions: MaybeRefOrGetter<readonly Minion[]>,
  // …
) {
  const alerts = computed(() => calculateAlerts(toValue(minions) /* … */))
  return { alerts }
}
```

`toValue` unwraps refs, calls getters, and passes plain values through. Because it is called inside
`computed`, refs and getters are read in a tracked context, so the computed follows them. A plain value
is fine for inputs that never change, and wrong for inputs that do: the composable would hold on to the
value it got at call time.

## 4. The component lifecycle

Every component instance goes through the same stages. Each stage has a hook you can register from
setup:

```text
  setup()                      <script setup> runs: refs, computed, watchers are created
     │
  onBeforeMount                render function about to run for the first time
     │
  ── first render: vnodes created, DOM elements created and inserted ──
     │
  onMounted                    DOM exists and is in the document. Template refs are set.
     │
     │   ┌──────────────────────────────────────────────┐
     ├──▶│ reactive state changes                        │
     │   │ onBeforeUpdate   DOM still shows the old state │
     │   │ ── re-render, DOM patched ──                  │
     │   │ onUpdated        DOM shows the new state      │
     │   └──────────────────────────────────────────────┘
     │
  onBeforeUnmount              about to be removed; still fully functional
     │
  ── DOM removed, effect scope stopped: watchers and computed are disposed ──
     │
  onUnmounted                  gone. Clean up anything Vue does not know about.
```

What to do where:

| Hook | Typical use in DungeonHR and beyond |
| --- | --- |
| setup (top level) | Create state, computed values, watchers. Do not touch the DOM; it does not exist yet. |
| `onMounted` | Start timers (`useShiftClock`), focus elements (`MinionForm`), measure layout, initialize non-Vue libraries on a DOM element. |
| `onUnmounted` | Stop timers, remove global listeners, destroy non-Vue library instances. |
| `onBeforeUpdate` / `onUpdated` | Rarely needed. If you reach for them, a `watch` with `flush: 'post'` is usually clearer. |

**Why not start the clock's timer at the top level of the composable?** Two reasons. During
server-side rendering, setup runs on the server but `onMounted` never does, so a timer started at the
top level would leak on the server. And conceptually, a clock is only useful while it is displayed;
`onMounted` and `onUnmounted` bracket exactly that period.

## 5. Effect scopes and cleanup

Vue groups every reactive effect (each `computed`, each `watch`, each component's render effect) into
an **effect scope**. Each component instance has one; so does each Pinia store. When the scope stops,
all effects in it stop with it.

That is why you never clean up `computed` or `watch` yourself in a component: when it unmounts, its
scope stops, and they are disposed. Vue cannot do the same for things it did not create, such as a
`setInterval` timer or a `window.addEventListener` listener. Those need explicit cleanup.

Two hooks register cleanup:

| | `onUnmounted` | `onScopeDispose` |
| --- | --- | --- |
| Runs when | The component unmounts | The current effect scope stops |
| Works in components | Yes | Yes (a component's scope stops when it unmounts) |
| Works in Pinia setup stores | No (a store is never "mounted") | Yes |
| Works in a manual `effectScope()` | No | Yes |

`useLocalStorage` is used inside stores, so it uses `onScopeDispose`. `useShiftClock` needs `onMounted`
to start anyway, so it is component-only and pairs it with `onUnmounted`. A rule of thumb for writing
composables: **use `onScopeDispose` for cleanup unless you also need other lifecycle hooks.**

## 6. `computed`, `watch` and `watchEffect`

All three react to changes. They are for different jobs:

| | `computed` | `watch` | `watchEffect` |
| --- | --- | --- | --- |
| Purpose | Derive a **value** | Run a **side effect** when specific sources change | Run a side effect, tracking whatever it reads |
| Returns | A read-only ref | A stop function | A stop function |
| Sources | Whatever the getter reads | Explicit: a ref, a getter, or an array of them | Whatever the callback reads |
| Runs initially | Lazily, on first read | No (unless `immediate: true`) | Yes, immediately |
| Gets old and new value | No | Yes | No |
| May have side effects | **No** | Yes | Yes |

In DungeonHR:

- **`computed`**: alerts, filtered minions, crews, the current shift. Values derived from state.
- **`watch`**: `useLocalStorage` writes to storage when the value changes; `LeaveRequestForm` updates its
  form state when the `preselectedMinionId` prop changes. Effects with an explicit trigger.
- **`watchEffect`**: not used. It is convenient for "re-run this whenever anything it uses changes", but
  the implicit dependencies make it easier to trigger by accident. Prefer `watch` with explicit sources
  when in doubt.

**Rule of thumb:** if you are about to write `watch(source, () => { someRef.value = derive(source) })`,
you want a `computed` instead. A watcher that only copies a derived value into another ref is a
computed with extra steps and a window of inconsistency.

### Watch sources and depth

```ts
watch(state, write) // a ref: fires when .value is replaced
watch(state, write, { deep: true }) // also fires when something inside changes
watch(() => preselectedMinionId, update) // a getter: fires when its return value changes
watch([a, b], ([newA, newB]) => {}) // several sources at once
```

`useLocalStorage` needs `deep: true` because the stores mutate objects inside the array
(`minion.hp = 3`). Deep watching traverses the whole value on every check, which is fine for a few
hundred minions and something to keep in mind for very large structures.

### When does a watcher run?

By default (`flush: 'pre'`), watcher callbacks run after the change but **before** the component
re-renders, batched like renders. `flush: 'post'` runs them after the DOM has been updated (useful when
the callback needs to measure the new DOM), and `flush: 'sync'` runs them immediately on every change
(rarely a good idea).

## 7. Template refs

```ts
const nameInput = useTemplateRef<HTMLInputElement>('name-input')
onMounted(() => nameInput.value?.focus())
```

```html
<input ref="name-input" />
```

`useTemplateRef(key)` (Vue 3.5) returns a ref that Vue fills with the element (or component instance)
that has the matching `ref` attribute. Its value is `null` until the element is mounted, and again
after it is removed (for example by a `v-if`). That is why the focus call lives in `onMounted` and uses
optional chaining.

Reach for template refs when you need the DOM itself: focusing, measuring, scrolling, handing an
element to a non-Vue library. Everything else (content, classes, attributes) should stay declarative
in the template.

## 8. Composables vs stores

Both hold reactive state outside a single component's template. The difference is **sharing**:

| | Composable | Pinia store |
| --- | --- | --- |
| State per | Call (each component gets its own) | App (everyone shares one) |
| Lifetime | The caller's scope | The app |
| Example | `useShiftClock`: each clock ticks on its own | `useDungeonStore`: one roster for all pages |

They combine well. DungeonHR's dungeon store _uses_ two composables: `useLocalStorage` for its state and
`useAggroCalculator` for its alerts. The store provides sharing; the composables provide reusable
behavior.

(A composable can also share state, by creating its refs at module level outside the function. That
is the "store in ten lines" from the [Pinia guide](./07-state-management-with-pinia.md#2-a-store-in-ten-lines),
with the same drawbacks.)

## Summary

| Concept | Key point |
| --- | --- |
| Composable | A `use…` function that bundles state, derived values, side effects and cleanup. Returns refs. |
| Why it works | Refs are reactive anywhere; hooks attach to the component currently being set up. |
| Calling rule | Synchronously, during setup (or in a store or another composable). Not in handlers or after `await`. |
| Inputs | `MaybeRefOrGetter` + `toValue`, read inside `computed` or `watch`. |
| Lifecycle | Create state in setup; touch the DOM and start timers in `onMounted`; clean up in `onUnmounted`. |
| Effect scopes | Vue disposes its own effects automatically. Clean up foreign ones; `onScopeDispose` works everywhere. |
| `computed` / `watch` / `watchEffect` | Derive values / effects on explicit sources / effects on implicit sources. |
| Template refs | `useTemplateRef` + `ref="…"`; `null` until mounted. |
| Composable vs store | Per-call state vs app-wide state. Stores can use composables. |

## Check your understanding

1. `useLocalStorage` uses `onScopeDispose`, while `useShiftClock` uses `onUnmounted`. What would happen
   if you swapped them: `onUnmounted` in `useLocalStorage`, and `onScopeDispose` in `useShiftClock`?
2. A colleague writes this in a component: `const shift = ref(shiftAt(new Date()))` and
   `watch(now, () => { shift.value = shiftAt(now.value) })`. What is wrong with it, and what should it
   be?

<details>
<summary>Answers</summary>

1. `useLocalStorage` is called inside Pinia stores, which are not components. `onUnmounted` there has no
   component instance to attach to: Vue warns, and the `storage` listener is never removed. (For an
   app-wide store that is rarely disposed, the practical damage is small, but in tests that create and
   dispose stores repeatedly, listeners would pile up.) In `useShiftClock`, `onScopeDispose` would work
   fine for the cleanup, because a component's scope stops when it unmounts. The composable still needs
   `onMounted` to start the timer, so it is component-only either way, and pairing `onMounted` with
   `onUnmounted` reads more naturally.
2. It is a derived value maintained by hand. Between the change of `now` and the watcher running, `shift`
   is stale, and anyone who changes `shift` directly makes it wrong. It should be
   `const shift = computed(() => shiftAt(now.value))`: always consistent, read-only, and no watcher to
   forget.

</details>

## Further reading

- [Vue docs: Composables](https://vuejs.org/guide/reusability/composables.html)
- [Vue docs: Lifecycle hooks](https://vuejs.org/guide/essentials/lifecycle.html)
- [Vue docs: Watchers](https://vuejs.org/guide/essentials/watchers.html)
- [Vue docs: Template refs](https://vuejs.org/guide/essentials/template-refs.html)
- [Vue API: `effectScope` and `onScopeDispose`](https://vuejs.org/api/reactivity-advanced.html#effectscope)
