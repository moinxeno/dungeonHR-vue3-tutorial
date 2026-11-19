# Props Down, Events Up

> **Used in:** [Chapter 3: Events and Forms](../build/03-events-and-forms.md) and every chapter
> after it.

Chapter 3 introduced a rule: parents pass data down as props, children ask for changes by emitting
events, and only the owner of the data modifies it. This guide explains why that rule exists, what
`emit` actually does at runtime, and how to decide where a piece of state should live.

---

## 1. The problem: "Who changed this?"

Imagine DungeonHR without the rule. Every `MinionCard` receives a minion object and is allowed to
change it. The roster's stats bar shows a wounded count of 9 when you expected 10. Who changed it?

- any of the twelve cards,
- the stats component,
- the filter bar (it receives the roster too, after all),
- a future sector planner, a future leave form, …

With shared, freely mutable state, the answer is "potentially anyone", and you find out by reading
all of them. That does not scale.

**One-way data flow** makes the answer boring, which is the goal:

> Every piece of state has exactly one owner. Only the owner changes it. Everyone else receives it
> read-only and _asks_ the owner for changes.

In DungeonHR today, `App.vue` owns the roster. Every change to a minion happens in one of a handful of
functions in `App.vue`: `healMinion`, `restMinion`, `fireMinion`, `recruitMinion`, `simulateRaid`,
`callHealer`. If the wounded count is wrong, you read those six functions. Nothing else can be
responsible.

### The HR analogy

| Dungeon | Vue |
| --- | --- |
| The HR department keeps the personnel files. | The parent owns the state. |
| Each minion gets a copy of its file to read. | Children receive props. |
| A minion cannot edit its file. It files a request: "please send me to rest". | A child emits an event: `emit('rest', id)`. |
| HR decides whether to grant it, according to the rules. | The parent's handler applies its rules. |
| HR updates the file, and everyone's copy is current again. | The parent mutates its state; reactivity re-renders the children. |

```text
                 ┌──────────────────────────────┐
                 │ App.vue                      │
                 │ owns: minions, filters       │
                 │ rules: healMinion(), …       │
                 └──────┬───────────────▲───────┘
      props (read-only) │               │ events (requests)
      :minion="minion"  │               │ @heal, @rest, @fire
                 ┌──────▼───────────────┴───────┐
                 │ MinionCard                   │
                 │ owns: isConfirmingFire       │
                 └──────────────────────────────┘
```

## 2. What `emit` actually does

`emit` sounds like broadcasting a message into the void. It is much simpler: **it calls a function
that the parent handed to the child.**

When the parent writes `<MinionCard @heal="healMinion" />`, the compiler turns the listener into a
prop named `onHeal`:

```ts
// The parent's compiled render function (simplified)
createVNode(MinionCard, {
  minion: minion,
  onHeal: healMinion,
  onRest: restMinion,
  onFire: fireMinion,
})
```

And `defineEmits` in the child compiles to a list of event names plus access to Vue's `emit`:

```ts
// MinionCard, compiled (real output, abbreviated)
export default _defineComponent({
  props: { minion: { type: Object, required: true } },
  emits: ['heal', 'rest', 'fire'],
  setup(__props, { emit: __emit }) {
    const emit = __emit
    // …
  },
})
```

When the child calls `emit('heal', 'm-007')`, Vue's runtime does, in essence:

```ts
function emit(instance, event, ...args) {
  const handlerName = 'on' + capitalize(camelize(event)) // 'heal' -> 'onHeal'
  const handler = instance.vnode.props?.[handlerName] // what the parent passed
  if (handler) handler(...args) // healMinion('m-007')
}
```

The real implementation adds error handling, `.once` listeners, `v-model` modifiers and development
warnings, but this is the mechanism. Several practical consequences follow from it:

- **Emitting is synchronous.** When `emit('heal', id)` returns, `healMinion` has already run and the
  minion's HP has changed. (The DOM has not updated yet; that happens in the next render flush, as
  explained in the [reactivity guide](./02-reactivity-under-the-hood.md#6-scheduling-why-24-writes-cause-one-render).)
- **Events do not bubble.** Unlike DOM events, a component event is delivered only to the direct
  parent that rendered the component. If `MinionCard` were nested inside a `MinionGrid`, `App.vue`
  would not hear `heal` unless `MinionGrid` listened and re-emitted it.
- **No listener, no effect, no error.** If nobody passed `onHeal`, emitting `heal` does nothing. That
  is what you saw at the chapter 3 checkpoint, before `App.vue` listened.
- **Return values are ignored.** `emit` does not return what the handler returned. An event is a
  notification, not a question.

### Why not just pass a callback prop?

Since a listener _is_ a prop called `onHeal`, you could declare `onHeal: (id: MinionId) => void` as
a prop and call it yourself. That works, and it is how React does it. Vue's convention is to use
`defineEmits` instead, for several reasons:

| | `defineEmits` | Callback prop |
| --- | --- | --- |
| Optional by nature | Yes, emitting without a listener is fine | You must check for `undefined` before calling |
| Shows in DevTools timeline | Yes | No |
| Typed at the call site | Yes (`@heal` is checked against the declaration) | Yes |
| Keeps listeners off the root element | Yes (declared events are not fallthrough attributes) | Yes |
| Can return a value to the child | No | Yes |

Use events for "something happened". If a child genuinely needs an _answer_ from its parent (for
example, an async `validate` function that a generic form component calls), a function prop is the
right tool, and that is fine.

## 3. Why a child must not mutate its props

Vue protects props, but only shallowly. The props object is read-only:

```ts
const { minion } = defineProps<{ minion: Minion }>()
minion = otherMinion // compile error: destructured props are constants
```

But the _object_ a prop points to is the parent's reactive object, and nothing stops this:

```ts
// Inside MinionCard: works, and is a bad idea
function heal() {
  minion.hp = minion.maxHp
}
```

Vue does not prevent it because it cannot do so cheaply: the object is the parent's own reactive
state, and making a read-only copy for every prop would cost performance on every render. Since it
_works_, it is worth being clear about why it is wrong:

1. **It breaks the "one owner" guarantee.** The question "who changed this HP?" is back to "anyone
   who receives the minion".
2. **It bypasses the owner's rules.** `restMinion` refuses knocked-out minions. A card that writes
   `minion.stress -= 25` directly does not know that rule, and will not learn about it when it
   changes.
3. **It is invisible in tooling.** Emitted events appear in the DevTools timeline with their payload.
   A direct mutation does not.
4. **It breaks silently when the parent changes how it passes data.** If the parent ever passes a
   copy (`:minion="{ ...minion }"`) or a computed value, the child's mutation changes the copy, and
   nothing happens. No error, just a button that stopped working.

**Rule:** treat everything you receive as a prop as read-only, all the way down.

## 4. Where should state live?

Every piece of state has to be owned by some component. Choosing well keeps components simple;
choosing badly leads either to components that cannot coordinate or to one giant component that
owns everything.

**The rule:** put state in the **lowest component that every user of that state can reach.**

Applied to DungeonHR in chapter 3:

| State | Who needs it? | Lowest common owner |
| --- | --- | --- |
| `isConfirmingFire` | Only the card that asks | `MinionCard` (one per card) |
| `draft` (the half-filled form) | Only the form, until submit | `MinionForm` |
| `search`, `speciesFilter`, `unionOnly` | The filter controls _and_ the `filteredMinions` computed | `App.vue` |
| `minions` | Cards, stats, filters, recruit form (for duplicate names) | `App.vue` |

Notice the filters. The filter _controls_ live in `MinionFilters`, but the filter _values_ live in
`App.vue`, because `App.vue` needs them to compute which cards to show. Moving state up to a common
ancestor so that siblings can share it is called **lifting state up**.

### The limits of lifting

Lifting works well across one or two levels. It gets painful when the common ancestor is far away
from the components that need the state. In chapter 4 DungeonHR gets several pages; the roster page,
the minion detail page and the sector planner will all need the roster. Their lowest common ancestor
is `App.vue` itself, and every page would have to receive the roster as a prop and pass events back
up through the router. Passing props through components that do not need them, just to reach a
deeper one, is called **prop drilling**.

That is the problem a store solves. In chapter 5, the roster moves into a Pinia store: still one
owner, still one place where changes happen, but reachable from any component without drilling.
_Props down, events up_ remains the rule for everything else.

## 5. Fallthrough attributes

Not everything written on a component tag needs to be declared. When a parent writes:

```html
<BaseButton size="sm" class="ml-auto" :disabled="isFull" title="Heal" @click="heal" />
```

Vue sorts each item:

| Written on the tag | Declared by `BaseButton`? | Goes to |
| --- | --- | --- |
| `size="sm"` | Yes, as a prop | `BaseButton`'s props |
| `class="ml-auto"` | No | the root `<button>`, **merged** with its own classes |
| `:disabled="isFull"` | No | the root `<button>`'s `disabled` attribute |
| `title="Heal"` | No | the root `<button>` |
| `@click="heal"` | No (not in `defineEmits`) | a native `click` listener on the root `<button>` |

This is what lets `BaseButton` stay tiny: it declares only what it actually handles (variant, size,
type) and lets the native button do the rest.

Details worth knowing:

- **`class` and `style` merge**, everything else replaces. But merged Tailwind classes do not
  override each other in the order you write them; see the pitfall in chapter 3, section 2.4.
- **Declared events do not fall through.** If `BaseButton` declared `defineEmits<{ click: [] }>()`,
  the parent's `@click` would become a component listener only, and clicking the button would do
  nothing until `BaseButton` emitted `click` itself.
- **Components with several root elements** have no single place to put fallthrough attributes.
  Vue warns, and you decide where they go by binding `$attrs` explicitly.
- **Opting out:** `defineOptions({ inheritAttrs: false })` turns fallthrough off, so you can place
  the attributes on an inner element with `v-bind="$attrs"`. Useful for a wrapper component whose
  root is a layout `<div>` but whose attributes belong on an inner `<input>`.

## 6. Scoped slots: data up, for rendering

Events are not the only way information flows from child to parent. A **scoped slot** passes data
from a child into the markup that the parent provides for it:

```html
<!-- FormField.vue (child) -->
<slot :id="id" :invalid="Boolean(error)" :described-by="describedBy" />

<!-- MinionForm.vue (parent) -->
<FormField v-slot="{ id, invalid, describedBy }" label="Name" :error="errors.name">
  <input :id="id" :aria-invalid="invalid" :aria-describedby="describedBy" />
</FormField>
```

Under the hood, a slot is a function that the parent passes to the child, and the child calls it to
render that part of its template. Slot props are simply that function's arguments. So scoped slots
are the same idea as events, a function owned by the parent and called by the child, used for a
different purpose:

| | Event | Scoped slot |
| --- | --- | --- |
| Purpose | "Something happened, please react" | "Here is data you need to render your part" |
| When it is called | When something happens (a click) | On every render of the child |
| Parent's function returns | Nothing useful | Markup (vnodes) |

## Summary

| Idea | Key point |
| --- | --- |
| One-way data flow | Every piece of state has one owner; only the owner changes it. |
| Props down | Children receive data read-only, including nested objects. |
| Events up | `emit('heal', id)` synchronously calls the parent's `onHeal` handler, if there is one. Events do not bubble. |
| Emit facts, not changes | Send what happened (an ID), let the owner apply its rules. |
| Where state lives | In the lowest component that all its users can reach. Lift it up when siblings need it. |
| Fallthrough attributes | Undeclared attributes, classes and listeners land on the root element. |
| Scoped slots | The child passes data into the parent's slot content; a slot is a function the child calls. |

## Check your understanding

1. `MinionCard` is moved inside a new `MinionGrid` component that renders all the cards. `App.vue`
   still writes `<MinionGrid :minions="filteredMinions" @heal="healMinion" />`. Clicking **Heal**
   no longer works. Why, and what are two ways to fix it?
2. Why is `isConfirmingFire` a `ref` inside `MinionCard` rather than state in `App.vue`, while the
   filters, which are also "just UI state", live in `App.vue`?

<details>
<summary>Answers</summary>

1. Component events do not bubble. `MinionCard` emits `heal` to its direct parent, `MinionGrid`, which
   does not listen, so nothing happens. `App.vue`'s `@heal` on `MinionGrid` only hears events that
   `MinionGrid` itself emits. Fix it by having `MinionGrid` declare `heal` and re-emit it
   (`@heal="(id) => emit('heal', id)"` on each card), or by moving the roster into a store (chapter 5)
   so that cards, or the grid, can call the store's action directly.
2. Nobody outside the card needs `isConfirmingFire`: no other component reads or changes it. The
   filter values, on the other hand, are needed by `App.vue` to compute `filteredMinions`. State lives
   in the lowest component that every user of it can reach. For `isConfirmingFire` that is the card;
   for the filters it is `App.vue`.

</details>

## Further reading

- [Vue docs: Component events](https://vuejs.org/guide/components/events.html)
- [Vue docs: Props, one-way data flow](https://vuejs.org/guide/components/props.html#one-way-data-flow)
- [Vue docs: Fallthrough attributes](https://vuejs.org/guide/components/attrs.html)
- [Vue docs: Scoped slots](https://vuejs.org/guide/components/slots.html#scoped-slots)
