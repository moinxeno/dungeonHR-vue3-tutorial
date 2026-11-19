# Reactivity Under the Hood

> **Used in:** [Chapter 2: Reactivity and Props](../build/02-reactivity-and-props.md) and every
> chapter after it.

In chapter 2 you assigned `minion.hp = 6` and the HP bar shrank. Nobody called `render()`, nobody
dispatched an event, nobody told the bar to update. This guide explains how that works by building
a working miniature of Vue's reactivity system in about 60 lines.

Once you understand the mechanism, the rules that seem arbitrary at first (".value in scripts but
not in templates", "don't destructure reactive objects", "don't clone a proxy") become obvious
consequences.

---

## 1. The problem: JavaScript is not reactive

```ts
let hp = 18
const maxHp = 24
let percent = Math.round((hp / maxHp) * 100) // 75

hp = 6
console.log(percent) // still 75
```

`percent` was calculated once. Changing `hp` afterwards does nothing to it. A spreadsheet behaves
differently: if cell C1 contains `=A1/B1`, changing A1 updates C1 instantly. C1 is not a value; it
is a _formula with dependencies_.

That is what we want for UIs. The rendered DOM should be a formula over our state: change the
state, and everything that depends on it updates. To get there, the framework needs to answer two
questions automatically:

1. **Tracking:** when a formula runs, which pieces of state does it read?
2. **Triggering:** when a piece of state changes, which formulas read it and need to run again?

## 2. The vocabulary

Vue's reactivity system has three roles:

| Role | Spreadsheet analogy | In Vue |
| --- | --- | --- |
| **Reactive state** | An input cell | `ref()`, `reactive()`, props |
| **Effect** | Something that reacts to cells, like a chart | A component's render function, `watch`, `watchEffect` |
| **Computed** | A formula cell: derived from other cells, read by others | `computed()` |

The core idea in one sentence: **while an effect runs, every reactive read registers the effect as a
dependency; every reactive write re-runs the effects registered for that piece of state.**

## 3. Building it: `reactive` and `effect`

JavaScript has a built-in way to intercept reads and writes on an object: the
[`Proxy`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy).
A proxy wraps an object, and its `get` and `set` traps run on every property access.

That is exactly the hook we need: the `get` trap does **tracking**, the `set` trap does
**triggering**.

```ts
type Effect = () => void

// The effect that is currently running, if any.
let activeEffect: Effect | null = null

// For every reactive object, for every property: the set of effects that read it.
// target -> key -> Set<Effect>
const targetMap = new WeakMap<object, Map<PropertyKey, Set<Effect>>>()

function track(target: object, key: PropertyKey): void {
  if (!activeEffect) return // a read outside of any effect: nothing to record
  let depsMap = targetMap.get(target)
  if (!depsMap) targetMap.set(target, (depsMap = new Map()))
  let dep = depsMap.get(key)
  if (!dep) depsMap.set(key, (dep = new Set()))
  dep.add(activeEffect)
}

function trigger(target: object, key: PropertyKey): void {
  const dep = targetMap.get(target)?.get(key)
  if (dep) [...dep].forEach((effect) => effect())
}

function reactive<T extends object>(target: T): T {
  return new Proxy(target, {
    get(obj, key, receiver) {
      track(obj, key)
      const value = Reflect.get(obj, key, receiver)
      // Deep reactivity: nested objects are wrapped lazily, when they are accessed.
      return typeof value === 'object' && value !== null ? reactive(value) : value
    },
    set(obj, key, value, receiver) {
      const result = Reflect.set(obj, key, value, receiver)
      trigger(obj, key)
      return result
    },
  })
}

function effect(fn: () => void): void {
  const run: Effect = () => {
    const previous = activeEffect // effects can be nested; restore the outer one afterwards
    activeEffect = run
    try {
      fn()
    } finally {
      activeEffect = previous
    }
  }
  run()
}
```

Let's use it:

```ts
const minion = reactive({ name: 'Grizzle', hp: 18, maxHp: 24 })

effect(() => {
  console.log(`render: ${minion.name} ${Math.round((minion.hp / minion.maxHp) * 100)}%`)
})
// render: Grizzle 75%

minion.hp = 6
// render: Grizzle 25%
```

Step by step:

1. `effect` sets `activeEffect` and runs the function.
2. The function reads `minion.name`, `minion.hp` and `minion.maxHp`. Each read goes through the
   `get` trap, which calls `track`. The effect is now registered under all three keys.
3. `minion.hp = 6` goes through the `set` trap, which calls `trigger(minion, 'hp')`. It finds the
   effect and runs it again.

Replace `console.log` with "patch the DOM" and you have the essence of a Vue component: **a
component's render function is an effect**. Every reactive value it reads becomes a dependency.
Change any of them, and the component re-renders.

### What real Vue does in addition

Our version is deliberately minimal. Vue's real implementation (in the `@vue/reactivity` package)
adds things a production system needs:

- **Proxy caching.** `reactive(obj)` always returns the same proxy for the same object, using a
  `WeakMap`. Ours creates a new proxy on every nested access.
- **Dependency cleanup.** If an effect stops reading a property (say, a `v-if` branch disappears),
  Vue removes the stale dependency. Ours keeps it forever.
- **Change detection.** Vue only triggers if the value actually changed (`Object.is`). Ours triggers
  on every write.
- **Collections and arrays.** `Map`, `Set`, `array.push` and `array.length` need special handling.
- **Scheduling.** Covered in section 6.

## 4. Building it: `ref`

A Proxy can only wrap objects. But a lot of state is a single number, string or boolean. You cannot
proxy `18`.

The solution is to put the value inside an object with a getter and setter. That object is a
`ref`:

```ts
function ref<T>(initial: T): { value: T } {
  let value = initial
  const r = {
    get value() {
      track(r, 'value')
      return value
    },
    set value(next: T) {
      value = next
      trigger(r, 'value')
    },
  }
  return r
}

const count = ref(0)
effect(() => console.log('count is', count.value)) // count is 0
count.value++ // count is 1
```

This is why you write `.value`: **the `.value` property access is the moment tracking or triggering
happens**. Without it, there would be no getter to intercept.

Real `ref` does one more thing: if you give it an object or an array, it wraps that in
`reactive()`. That is why in chapter 2, `ref<Minion[]>(…)` made the array, every minion object and
every property deeply reactive, and `minion.hp = …` inside `simulateRaid` just worked.

### `ref` or `reactive`?

Vue offers both. DungeonHR uses `ref` everywhere, as the Vue docs recommend, for three reasons:

| | `ref` | `reactive` |
| --- | --- | --- |
| Works with primitives | Yes | No (objects only) |
| Can be replaced wholesale | Yes: `minions.value = newList` | No: reassigning the variable disconnects it |
| Survives destructuring | The ref object itself can be passed around | Destructured properties lose reactivity |
| Syntax | `.value` in scripts | Plain property access |

The `.value` is a small price for one consistent rule.

### Why templates don't need `.value`

When a template uses a top-level ref, the compiler generates code that unwraps it (with `unref()`).
You saw it in the compiled output in the SFC guide: `_unref(hpPercent)`. Inside the template, Vue
knows the context and does it for you. Inside your script it cannot, because a ref is a normal
JavaScript value there and you might want the ref itself (to pass it to a function, for example).

## 5. Building it: `computed`

A computed value is both things at once: it is an **effect** (it reads other reactive state and
needs to know when that changes) and it is **reactive state** (others read it and need to know when
_it_ changes).

The naive approach would be to recalculate eagerly whenever a dependency changes. Vue does
something smarter: it is **lazy** and **cached**.

```ts
function computed<T>(getter: () => T): { readonly value: T } {
  let cached: T
  let dirty = true // "my cached value may be outdated"

  // Runs when one of the getter's dependencies changes.
  const onDependencyChange: Effect = () => {
    if (dirty) return
    dirty = true // don't recompute now: just remember that we have to...
    trigger(self, 'value') // ...and tell whoever reads us that we changed
  }

  const self = {
    get value() {
      track(self, 'value') // whoever reads us now depends on us
      if (dirty) {
        // Run the getter with `onDependencyChange` as the active effect,
        // so the getter's reads register it as their dependency.
        const previous = activeEffect
        activeEffect = onDependencyChange
        try {
          cached = getter()
        } finally {
          activeEffect = previous
        }
        dirty = false
      }
      return cached
    },
  }
  return self
}
```

Now watch the caching at work:

```ts
const minion = reactive({ name: 'Grizzle', hp: 18, maxHp: 24 })

let getterRuns = 0
const percent = computed(() => {
  getterRuns++
  return Math.round((minion.hp / minion.maxHp) * 100)
})

effect(() => console.log(`render: ${minion.name} ${percent.value}%`))
// render: Grizzle 75%

minion.hp = 6
// render: Grizzle 25%

minion.name = 'Grizzle the Brave'
// render: Grizzle the Brave 25%

console.log(getterRuns) // 2
```

The effect ran three times, but the getter only twice. Renaming the minion re-rendered the effect,
which read `percent.value` again, and found it clean: `name` is not a dependency of `percent`, so
the cached 25 was reused.

Those are the two properties that make computed values worth using over plain functions:

- **Lazy:** a computed value that nobody reads never runs. Changing `hp` ten times in a row only
  marks it dirty; the getter runs once, on the next read.
- **Cached:** reading a clean computed value is free. Call a plain function from a template ten
  times and it runs ten times per render.

**Rule:** a computed getter must be **pure**. It may read state, but it must not change state, make
API calls or touch the DOM. It might run once, many times or never, whenever Vue decides it needs
the value. Side effects go into event handlers or watchers (chapter 6).

Vue 3.5's real implementation uses version counters instead of a single `dirty` flag, which also
lets it skip recomputation when a dependency changed but its value ended up the same. The mental
model is the same: dependencies push "you might be outdated", readers pull the actual value.

## 6. Scheduling: why 24 writes cause one render

In our mini version, `trigger` runs effects immediately. If `simulateRaid` writes 24 properties,
the effect would run 24 times, each time with half-updated data.

Vue does not run component render effects immediately. `trigger` puts them into a **queue**, and
the queue is flushed in a microtask, after the current synchronous code has finished:

```text
simulateRaid() starts
  minion[0].hp = …      → queue: [MinionCard#1, App]
  minion[0].stress = …  → already queued
  minion[1].hp = …      → queue: [MinionCard#1, App, MinionCard#2]
  … 21 more writes …
simulateRaid() returns
microtask: flush queue  → each component renders once, parents before children
```

Two consequences:

- **You can mutate freely.** Any number of synchronous changes produce one render per affected
  component.
- **The DOM is not updated synchronously.** Right after `minion.hp = 0`, the "Knocked out" badge is
  not in the DOM yet. If you need the updated DOM (to measure an element or move focus), wait for
  the flush with `await nextTick()`.

## 7. Props are reactive too

A component's props object is a reactive object (internally a `shallowReactive`). When the parent
re-renders and passes a new `value` to `StatBar`, Vue writes to that props object, which triggers
everything in `StatBar` that read the prop: the `percent` computed, and through it `wellbeing` and
`barClass`, and finally `StatBar`'s render effect.

Destructuring props (`const { value } = defineProps<…>()`) would normally break this, because a
destructured value is a plain copy. Vue 3.5 makes it work with a compile-time transform: every use
of `value` in your script is rewritten to `__props.value`. The guide on
[typing components](./03-typing-components-with-typescript.md#3-reactive-props-destructure) shows the
compiled code. The transform only applies within the component's own code, which leads to the first
pitfall below.

## 8. Pitfalls, explained by the mechanism

Every one of these follows directly from "tracking happens on property access of a reactive
object".

### Destructuring a reactive object

```ts
const minion = reactive({ hp: 18 })
const { hp } = minion // reads minion.hp ONCE and copies the number
minion.hp = 6
console.log(hp) // 18
```

`hp` is a plain number now. There is no proxy in the way anymore, so there is nothing to track.
If you need to destructure while keeping reactivity, use `toRefs(minion)`, which gives you a ref per
property.

### Passing a destructured prop out of the component

```ts
const { value } = defineProps<{ value: number }>()

watch(value, () => {}) // ✗ would be watch(__props.value, …): passes the current number
watch(() => value, () => {}) // ✓ a getter: re-reads __props.value whenever the watcher checks
```

The compiler rewrites `value` to `__props.value`, but if you hand it to a function, that function
receives the _result_ of the property access, a plain number. Wrap it in a getter (`() => value`)
when a function needs to keep observing it. For `watch()` and `toRef()` the compiler catches the
mistake and refuses to compile: _"value" is a destructured prop and should not be passed directly
to watch()_. For your own functions (such as the composables in chapter 6) it cannot know, so the
getter is your responsibility.

### Cloning a reactive object

```ts
const minions = ref(seedMinions)
structuredClone(minions.value) // ✗ DataCloneError
```

`minions.value` is a Proxy, and the structured clone algorithm cannot clone Proxies. Clone the
plain data _before_ making it reactive (as chapter 2 does), or unwrap it first:
`structuredClone(toRaw(minions.value))`.

### Comparing a proxy with the original object

```ts
const raw = { hp: 18 }
const state = reactive(raw)
state === raw // false: one is the proxy, one is the original
```

Once data is reactive, work with the reactive version consistently. Comparing by ID
(`a.id === b.id`) sidesteps the problem entirely, and it is what DungeonHR does.

### Replacing a reactive object

```ts
let roster = reactive([])
roster = reactive(newList) // the template still holds the OLD proxy
```

The template captured the original proxy. Reassigning the variable does not tell anyone. With a
`ref`, `minions.value = newList` goes through the setter, which triggers. This is the main reason
DungeonHR uses `ref` throughout.

## Summary

| Concept | Mechanism |
| --- | --- |
| `reactive(obj)` | A Proxy whose `get` trap tracks and whose `set` trap triggers. Nested objects are wrapped on access. |
| `ref(value)` | An object with a `value` getter/setter that tracks and triggers. Objects inside are made `reactive`. |
| Effect | A function run with itself as `activeEffect`, so its reads register it. Render functions are effects. |
| `computed(fn)` | Lazy and cached: dependencies mark it dirty, the next read recomputes. Must be pure. |
| Scheduler | Component updates are queued and flushed once per tick. Use `nextTick()` to wait for the DOM. |
| `.value` | The property access that makes tracking possible for refs. Unwrapped automatically in templates. |

## Check your understanding

1. `App.vue` computes `woundedCount` from `minions.value.filter(…)`. Which reactive reads does that
   computed register, and which writes in `simulateRaid` can make it dirty?
2. Why would `const percent = computed(() => …)` in `StatBar` not help if the parent passed
   `:value="minion.hp"` as a **plain number captured once** instead of reading `minion.hp` during
   render? (Hint: think about where the reactive read happens.)

<details>
<summary>Answers</summary>

1. It reads `minions.value` (the ref), the array's iteration (its length and indices), and
   `hp` and `maxHp` on every minion object. So any write to any minion's `hp` or `maxHp`, adding or
   removing a minion, or replacing the array marks it dirty. Writes to `stress` or `name` do not.
2. In the real code, the parent's render function reads `minion.hp`, so the parent re-renders when
   it changes and passes a new prop value, which triggers `StatBar`. If the parent had copied the
   number once outside of any effect, there would be no reactive read, no dependency, no
   re-render, and `StatBar` would never receive a new value. Reactivity has to start with a
   tracked read of reactive state; `computed` can only propagate changes it is told about.

</details>

## Further reading

- [Vue docs: Reactivity in depth](https://vuejs.org/guide/extras/reactivity-in-depth.html)
- [Vue docs: Reactivity fundamentals](https://vuejs.org/guide/essentials/reactivity-fundamentals.html)
- [Vue docs: Computed properties](https://vuejs.org/guide/essentials/computed.html)
- [MDN: Proxy](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy)
