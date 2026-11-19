# Two-Way Binding Demystified

> **Used in:** [Chapter 3: Events and Forms](../build/03-events-and-forms.md)

`v-model` looks like it breaks the rule from the [previous guide](./04-props-down-events-up.md): data
seems to flow both ways at once. It does not. `v-model` is shorthand for exactly one prop going down
and one event coming up. Once you see the expansion, you can predict how it behaves in every
situation, including the confusing ones.

This guide covers:

1. what `v-model` compiles to,
2. how it behaves on each kind of form control,
3. how `defineModel` gives your own components a `v-model`,
4. when to use `v-model` and when a local draft plus an event is better,
5. the common pitfalls.

---

## 1. `v-model` is a prop plus a listener

Here is a parent with a native input and a component, both using `v-model`:

```vue
<script setup lang="ts">
import { ref } from 'vue'
import MinionFilters from './MinionFilters.vue'

const name = ref('')
const search = ref('')
</script>

<template>
  <input v-model="name" />
  <MinionFilters v-model:search="search" />
</template>
```

And here is what the compiler produces for that template (real production output, slightly
shortened):

```ts
_withDirectives(
  _createElementVNode('input', {
    'onUpdate:modelValue': ($event) => (name.value = $event),
  }),
  [[_vModelText, name.value]],
)

_createVNode(MinionFilters, {
  search: search.value,
  'onUpdate:search': ($event) => (search.value = $event),
})
```

Both expand to the same two halves:

- **down:** the current value (`name.value`, `search.value`) is passed in,
- **up:** a handler (`onUpdate:…`) that assigns whatever value comes back.

For the component, that is literally a prop named `search` and a listener for the event
`update:search`. You could write it by hand and get the identical result:

```html
<MinionFilters :search="search" @update:search="(value) => (search = value)" />
```

So the parent still owns `search`, and the child still asks for changes through an event. `v-model`
is _props down, events up_ with less typing.

## 2. `v-model` on native form controls

For native elements, the "prop" and "event" are DOM properties and DOM events. The `vModelText`,
`vModelCheckbox`, `vModelSelect` and `vModelRadio` directives pick the right pair for each control:

| Control | Reads/writes | Listens to | Notes |
| --- | --- | --- | --- |
| `<input type="text">`, `<textarea>` | `value` | `input` | Waits until IME composition (e.g. Japanese input) is finished. |
| `<input type="checkbox">` | `checked` | `change` | Bound to an array, it adds and removes its `value`. |
| `<input type="radio">` | `checked` | `change` | Sets the model to the radio's `value`. |
| `<select>` | the selected option | `change` | Hands back the option's **bound** value, with its original type. |
| `<input type="number">` | `value` | `input` | Converts to a number automatically, when possible. |

Two rows deserve attention.

**`<select>` keeps your types.** `<option :value="level">` with a number `level` gives you a
number back, not the string `"4"`. Vue stores the original value on the option element and returns
that, instead of reading the DOM's always-a-string `value`. That is why `draft.threatLevel` stays a
`ThreatLevel` in `MinionForm`.

**Number inputs are only _mostly_ numbers.** Vue converts the input's string with `parseFloat`.
If that fails, which it does for an empty field, you get the original string. So a cleared
`<input type="number" v-model="draft.maxHp">` puts `''` into a field typed as `number`. TypeScript
cannot see this, because it happens at runtime. Validation code has to check
(`typeof value === 'number'`), as `validateMinionDraft` does.

### Modifiers

| Modifier | Effect |
| --- | --- |
| `.lazy` | Sync on `change` (blur or Enter) instead of on every `input`. |
| `.number` | Convert with `parseFloat`, falling back to the string. Automatic for `type="number"`. |
| `.trim` | Strip leading and trailing whitespace before assigning. |

## 3. `v-model` on your own components

### Before `defineModel`

A component that supports `v-model:search` has to accept the prop and emit the update event. Until
Vue 3.4 you wrote that by hand, usually with a writable `computed` to make it usable with an inner
`v-model`:

```ts
const props = defineProps<{ search: string }>()
const emit = defineEmits<{ 'update:search': [value: string] }>()

const search = computed({
  get: () => props.search,
  set: (value) => emit('update:search', value),
})
```

You will see this pattern in older code. It is correct, just verbose: three declarations for one
binding.

### With `defineModel`

`defineModel` generates all of it. `MinionFilters.vue` declares:

```ts
const search = defineModel<string>('search', { required: true })
const species = defineModel<Species | 'all'>('species', { required: true })
const unionOnly = defineModel<boolean>('unionOnly', { required: true })
```

The compiler turns that into (real output, abbreviated):

```ts
export default _defineComponent({
  props: {
    search: { type: String, required: true },
    searchModifiers: {},
    species: { type: null, required: true },
    speciesModifiers: {},
    unionOnly: { type: Boolean, required: true },
    unionOnlyModifiers: {},
  },
  emits: ['update:search', 'update:species', 'update:unionOnly'],
  setup(__props) {
    const search = _useModel<string>(__props, 'search')
    const species = _useModel<Species | 'all'>(__props, 'species')
    const unionOnly = _useModel<boolean>(__props, 'unionOnly')
    // …
  },
})
```

So each model is a prop, an `update:` event and a call to `useModel`. (The `…Modifiers` props carry
modifiers the parent writes, such as `v-model:search.trim`. A component can read them to implement
custom modifiers.)

`useModel` returns a ref with a custom getter and setter. Simplified:

```ts
function useModel(props, name) {
  return customRef((track, trigger) => ({
    get() {
      track()
      return props[name] // always the parent's current value
    },
    set(value) {
      emit(`update:${name}`, value) // ask the parent to change it
    },
  }))
}
```

Reading `search.value` reads the prop; assigning `search.value = 'gr'` emits `update:search`. The
parent's `v-model` handler assigns the new value, the prop changes, and the input re-renders with it.
The round trip is synchronous, so typing feels instant.

One refinement in the real implementation: if the parent did **not** bind `v-model` at all, there is
nobody to update the prop. In that case `useModel` keeps the value locally, so the component still
works as a self-contained control. With `{ required: true }`, as in `MinionFilters`, the type checker
makes sure the parent always binds it.

### Why `v-model:union-only` reaches `unionOnly`

Props and events are normalized between kebab-case and camelCase. The parent may write
`v-model:union-only` (the style the Vue style guide recommends for templates), which compiles to the
prop `union-only` and the listener `onUpdate:union-only`. Vue normalizes the prop to `unionOnly`,
and `useModel` checks all spellings when it looks for the parent's listener.

## 4. Live binding or local draft?

`v-model` on a component means the parent sees **every intermediate value**. DungeonHR uses it for
the filters, and deliberately not for the recruit form. The question to ask is: _is every
intermediate value meaningful to the parent?_

| Situation | Every keystroke meaningful to the parent? | Use |
| --- | --- | --- |
| Search box, filter dropdown, toggle | Yes: the roster should update live | `v-model` / `defineModel` |
| A rating input, a color picker, a date picker | Yes: the value is always valid | `v-model` / `defineModel` |
| "Recruit a minion" form | No: a half-typed name is not a minion yet | Local draft + `submit` event |
| A dialog with OK and Cancel | No: Cancel must leave the parent untouched | Local draft + `confirm` event |
| Heal, rest, fire | Not a value at all, a command | Event (`emit('heal', id)`) |

The recruit form shows why the second pattern matters. If the form used `v-model` against the roster,
typing a name would create a minion with the name "G", then "Gr", then "Gri"… and Cancel would have to
undo all of it. With a local draft, the parent sees nothing until there is something worth seeing,
and Cancel is simply "throw the draft away".

**Rule of thumb:** use `v-model` for _editing a value the parent owns_; use a local draft plus an
event for _producing a result the parent should receive once_; use plain events for _commands_.

## 5. Pitfalls

### `v-model` on a prop

```vue
<script setup lang="ts">
const { search } = defineProps<{ search: string }>()
</script>

<template>
  <input v-model="search" />
</template>
```

This is a compile error: _"v-model cannot be used on a prop, because local prop bindings are not
writable."_ `v-model` would assign to the prop, which belongs to the parent. Declare a model with
`defineModel('search')` instead, so assignments become `update:search` events.

### Deep changes to an object model

```ts
const minion = defineModel<Minion>({ required: true })

minion.value.hp = 0 // ✗ mutates the parent's object, emits nothing
minion.value = { ...minion.value, hp: 0 } // ✓ assigns a new object, emits update:modelValue
```

`useModel` only intercepts assignments to `.value`. Changing a property _inside_ the object is a
direct mutation of the parent's state, with all the problems described in the previous guide. When a
model holds an object, replace it instead of editing it.

### Empty number inputs

As described above, a cleared `<input type="number">` yields `''`. Validate types at runtime, or
handle `''` explicitly, before treating the value as a number.

### Binding `v-model` to a read-only value

`v-model="totalPayroll"`, where `totalPayroll` is a `computed` without a setter, has nowhere to write
to. Typing into the input triggers a development warning that the computed value is read-only, and
the input snaps back. `v-model` needs something assignable: a ref, a reactive property, or a
writable computed.

## Summary

| Idea | Key point |
| --- | --- |
| What `v-model` is | Shorthand for a value passed down plus an `onUpdate:…` handler that assigns what comes back. |
| On native controls | The right property and event per control type; `<select>` keeps bound value types; number inputs can still yield `''`. |
| On components | `v-model:name` ↔ prop `name` + event `update:name`. `defineModel('name')` generates both and returns a ref-like model. |
| `useModel` | Reading returns the prop; assigning emits the update event. Keeps a local value if the parent does not bind it. |
| When to use it | For editing a value the parent owns, where every intermediate value matters. Use a local draft + event for results, and plain events for commands. |

## Check your understanding

1. In `MinionFilters`, what exactly happens, step by step, between typing the letter "g" into the
   search box and the roster showing fewer cards?
2. A teammate suggests replacing `MinionForm`'s `submit` event with
   `<MinionForm v-model="newMinion" />`, where `newMinion` is a ref in `App.vue`. What would get
   worse?

<details>
<summary>Answers</summary>

1. The input fires `input`. The `vModelText` directive inside `MinionFilters` assigns the input's value
   to `search.value`. That is `useModel`'s setter, which emits `update:search` with `"g"`. The emit
   synchronously calls the parent's `onUpdate:search` handler, which sets `App.vue`'s `search` ref to
   `"g"`. `filteredMinions` depends on that ref and is marked dirty. In the next render flush, `App.vue`
   re-renders, reads `filteredMinions` (which recomputes), renders fewer cards, and passes `"g"` back
   down as the `search` prop, which the input already shows.
2. `App.vue` would see every intermediate state of the form: invalid, half-typed drafts. It would have
   to know when the draft is "done", which is the form's job. Cancel would no longer be "throw the
   draft away" but "restore whatever `newMinion` was before". And validation would either have to move
   into the parent or the parent would have to trust that the form only emits valid values, which
   `v-model` cannot express. A local draft plus a `submit` event keeps all of that inside the form.

</details>

## Further reading

- [Vue docs: Form input bindings](https://vuejs.org/guide/essentials/forms.html)
- [Vue docs: Component v-model](https://vuejs.org/guide/components/v-model.html)
- [Vue API: `defineModel()`](https://vuejs.org/api/sfc-script-setup.html#definemodel)
