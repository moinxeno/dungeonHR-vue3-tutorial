# Anatomy of a Single File Component

> **Used in:** [Chapter 1: Scaffolding and Your First SFC](../build/01-scaffolding-and-first-sfc.md)

A `.vue` file looks like HTML with some JavaScript and CSS mixed in. It is easy to use one for weeks
without asking what it actually _is_. This guide answers three questions:

1. Why do Single File Components exist at all?
2. What happens to a `.vue` file between your editor and the browser?
3. How do `<script setup>` and `<style scoped>` work under the hood?

You do not need any of this to write your first component. You need it the first time something
behaves unexpectedly, and that moment comes sooner than you think.

---

## 1. The problem SFCs solve

The classic web splits a page by **technology**: structure in `.html`, behavior in `.js`, looks in
`.css`. That works for documents. It works badly for applications, where the real unit of work is a
**piece of UI**: a card, a form, a navigation bar.

Change how a minion card looks and behaves, and with the classic split you touch three files that
live in three different folders, connected only by class names and IDs that have to match by
convention. Delete the card, and its CSS lives on forever because nobody dares to remove a rule
that might be used somewhere else.

A Single File Component splits by **concern** instead. Everything that makes up the minion card,
its data, its markup and its styles, lives in `MinionCard.vue`. Delete the file, and the card is
gone completely: no orphaned CSS, no dangling event handlers.

```text
Split by technology                 Split by concern (SFC)

index.html  ──┐                     MinionCard.vue
app.js      ──┼── one card            ├── <script setup>  logic
styles.css  ──┘                       ├── <template>      markup
                                      └── <style scoped>  styles
```

**Mental model:** A component is a function from state to UI. You describe _what_ the card should
look like for a given minion; Vue figures out _how_ to create and update the DOM to match. The SFC
is just the most convenient way to write that function down.

## 2. A `.vue` file is not something the browser understands

Browsers speak HTML, CSS and JavaScript. A `.vue` file is none of those. It is a **source format**
that a compiler turns into ordinary JavaScript and CSS before the browser ever sees it.

The pipeline in DungeonHR:

```text
MinionCard.vue
     │  imported by App.vue
     ▼
Vite (dev server or build)
     │  hands .vue files to @vitejs/plugin-vue
     ▼
@vue/compiler-sfc
     ├── <script setup>  ──► a JavaScript module exporting a component object
     ├── <template>      ──► a render function (inlined into that module)
     └── <style scoped>  ──► CSS with rewritten selectors, injected by Vite
     ▼
Browser runs plain JavaScript + CSS
```

### What the compiler produces

Here is a tiny component:

```vue
<script setup lang="ts">
const name = 'Grizzle'
const hp = 18
const maxHp = 24
const hpPercent = Math.round((hp / maxHp) * 100)
</script>

<template>
  <h3 class="title">{{ name }}</h3>
  <div class="bar" :style="{ width: hpPercent + '%' }"></div>
</template>

<style scoped>
.title {
  color: red;
}
</style>
```

And here is what `@vue/compiler-sfc` turns the script and template into for a production build
(real compiler output, imports shortened):

```ts
import { defineComponent as _defineComponent } from 'vue'
import { toDisplayString as _toDisplayString, createElementVNode as _createElementVNode /* … */ } from 'vue'

const name = 'Grizzle'
const hp = 18
const maxHp = 24

export default /*@__PURE__*/ _defineComponent({
  __name: 'Tiny',
  setup(__props) {
    const hpPercent = Math.round((hp / maxHp) * 100)

    return (_ctx: any, _cache: any) => {
      return (_openBlock(), _createElementBlock(_Fragment, null, [
        _createElementVNode('h3', { class: 'title' }, _toDisplayString(name)),
        _createElementVNode('div', {
          class: 'bar',
          style: _normalizeStyle({ width: _unref(hpPercent) + '%' }),
        }, null, 4 /* STYLE */),
      ], 64 /* STABLE_FRAGMENT */))
    }
  },
})
```

Four things are worth noticing.

**The template became a function.** `<template>` compiled into the arrow function returned by
`setup`. This is the **render function**. Every time Vue renders the component, it calls this
function, which returns a description of the desired DOM: a tree of _virtual nodes_ (vnodes). Vue
compares that tree with the previous one and applies only the differences to the real DOM. The
template is a convenient way to write a render function; it is not a string that gets parsed at
runtime.

**The component is an object.** The default export is a plain object with a `setup` function.
That is all a Vue component is. When you write `<MinionCard />` three times, Vue calls `setup`
three times, once per instance, each with its own local variables.

**Literal constants were hoisted.** `name`, `hp` and `maxHp` moved _outside_ `setup`, to module
level. The compiler noticed they are constant literals that can never differ between instances, so
there is no reason to recreate them for every card. `hpPercent` is computed, so it stays inside.
This is an optimization you never have to think about, but it explains something you may see in
DevTools: hoisted constants are not listed as component state.

**The compiler leaves hints for the runtime.** The numbers `4 /* STYLE */` and
`64 /* STABLE_FRAGMENT */` are _patch flags_. The `div` is marked as "only the style can change", so
when the component re-renders, Vue compares just the style and skips the class and children. The
`h3` has no flag, because its class never changes. Because templates are restricted (no arbitrary
code, only expressions), the compiler can analyze them and generate these hints. Hand-written render
functions do not get them for free.

**Try it:** Paste any component into the [Vue SFC Playground](https://play.vuejs.org/) and open
the _JS_ tab to see its compiled output. It is the fastest way to answer "what does Vue actually do
with this?"

## 3. `<script setup>` under the hood

Without `<script setup>`, you write the component object yourself:

```vue
<script lang="ts">
import { defineComponent } from 'vue'

export default defineComponent({
  setup() {
    const name = 'Grizzle'
    return { name } // everything the template needs must be returned
  },
})
</script>
```

`<script setup>` is a compile-time shortcut for exactly this. The compiler wraps your code in a
`setup()` function and figures out on its own what the template needs. In development builds you
can see it collect every top-level binding into a returned object:

```ts
const __returned__ = { name, hp, maxHp, hpPercent }
return __returned__
```

In production builds, the template is inlined into `setup` (as shown above), so the render function
can access the variables directly through the closure and nothing needs to be returned.

Practical consequences:

- **Every top-level binding is available in the template:** variables, functions and imports.
  That is why importing `MinionCard` in `App.vue` is enough to use `<MinionCard />`; no
  `components: { MinionCard }` registration.
- **The code runs once per component instance**, when it is created. It is not re-run on every
  render. Only the render function is. Keep that in mind in chapter 2: if `hp` changes later,
  `const hpPercent = …` will _not_ re-run by itself. That is exactly the problem `computed` solves.
- **Compiler macros** such as `defineProps` and `defineEmits` (chapters 2 and 3) look like function
  calls but are not imported from anywhere. The compiler recognizes and removes them, replacing them
  with component options. They only work inside `<script setup>`.

**Pitfall:** A `.vue` file can contain both a normal `<script>` and a `<script setup>`. The normal
block runs once when the module is first imported (shared by all instances), and `<script setup>`
runs once per instance. You rarely need the normal block; if you add one, be aware of the
difference.

## 4. `<template>`: a language with deliberate limits

Templates allow **expressions** (`hp / maxHp`, `isUnionized ? 'Union' : ''`, `formatGold(salary)`)
but not **statements** (`if`, `for`, `let x = …`). Control flow uses directives instead: `v-if`,
`v-for`, `v-show`.

These limits are what make the compiler optimizations from section 2 possible. Vue can analyze a
template ahead of time, see which parts can change and which cannot, and generate lean update code.

Bindings recap:

| Template | Compiles to (roughly) |
| --- | --- |
| `{{ name }}` | `toDisplayString(name)` (escaped text) |
| `class="title"` | `{ class: 'title' }` (a static string) |
| `:class="cls"` | `{ class: normalizeClass(cls) }` (an expression, re-evaluated on render) |
| `v-if="isUnionized"` | `isUnionized ? createVNode(…) : createCommentVNode('v-if')` |

The last row explains what you saw in the chapter: with `v-if` false, the element is not hidden but
absent, replaced by an empty comment placeholder (`<!--v-if-->`) that marks where it would go.

## 5. `<style scoped>` under the hood

Scoped styles are not a browser feature. They are implemented with two cooperating tricks:

1. **At compile time**, every selector in a scoped style block gets an attribute selector appended.
   The ID is a hash of the file path, so it is stable between builds:

   ```css
   /* You write */
   .title {
     color: red;
   }

   /* The compiler emits */
   .title[data-v-7ba5bd90] {
     color: red;
   }
   ```

2. **At runtime**, every element rendered by that component's template gets the matching attribute:
   `<h3 class="title" data-v-7ba5bd90>`. (Vite's Vue plugin attaches the ID to the component as
   `__scopeId`, and the renderer adds the attribute when it creates each element.)

The selector now only matches elements that carry this component's attribute. Another component's
`.title` has a different hash and is untouched.

### The root-element exception

There is one deliberate leak. If the parent has scoped styles, a child component's **root element**
receives both its own scope ID and its parent's:

```html
<!-- App.vue (with a <style scoped> block) renders <MinionCard /> -->
<article class="minion-card …" data-v-a1564084 data-v-7a7a37b1>
  <header data-v-a1564084>…</header>
</article>
```

(A component without any scoped style block has no scope ID, so in the chapter's `App.vue` the card
initially carries only one attribute. Add a scoped block to `App.vue` and the second one appears.)

That is why a scoped rule in `App.vue` can style `.minion-card` (the child's root) but not the
`h3` inside it. The design intent: a parent is responsible for _placing_ a child (margins, width,
grid position), while the child is responsible for everything _inside_ itself.

If a parent truly needs to style something deeper, Vue provides the `:deep()` pseudo-class
(`.minion-card :deep(h3) { … }`). Treat it as a last resort; it couples the parent to the child's
internal markup.

### Where Tailwind fits

Tailwind utilities are global classes, so scoping does not apply to them, and it does not need to:
`p-5` means the same thing everywhere, so there is nothing to collide with. Tailwind gives you
component-local styling by a different route: the styles live in the template of the component
that uses them.

DungeonHR's rule of thumb:

- **Utilities** for layout, spacing, color and typography: nearly everything.
- **Scoped CSS** where utilities hurt readability: multi-step transitions, `@keyframes`, complex
  selectors such as `:hover` combined with sibling states.

**Pitfall:** Tailwind finds the classes you use by scanning your source files as plain text. It
never runs your code. A class built at runtime, such as `` `bg-${color}-500` ``, appears nowhere
literally in your source, so Tailwind never generates it. Always write complete class names, for
example by mapping data to full strings: `{ goblin: 'bg-ichor-500', orc: 'bg-blood-500' }`.

## 6. From `index.html` to pixels: the boot sequence

Putting it all together, this is what happens when you open DungeonHR:

```text
1. Browser loads index.html
2. <script type="module" src="/src/main.ts"> starts the app
3. main.ts imports CSS (Vite injects <style> tags) and App.vue (compiled module)
4. createApp(App)        → creates an application instance with App as root component
5. .mount('#app')        → runs App's setup(), calls its render function,
                            creates real DOM from the vnodes, inserts it into <div id="app">
6. App's vnodes include three MinionCard vnodes
                         → for each: run MinionCard's setup(), render, create DOM
```

In development, Vite serves each module separately over native ES modules, which is why the dev
server starts instantly. When you save `MinionCard.vue`, Vite recompiles just that file and Vue's
**hot module replacement** swaps the component definition in place. Instances re-render with the
new code without a full page reload.

## Summary

| Question | Answer |
| --- | --- |
| Why SFCs? | They group code by UI concern instead of by technology. A component is self-contained and deletable. |
| What is a `.vue` file? | A source format. `@vue/compiler-sfc` compiles it into a JavaScript module and CSS. |
| What is a component? | A plain object with a `setup` function. Each instance runs `setup` once. |
| What is a template? | Syntax for a render function that returns virtual nodes. Its restrictions enable compiler optimizations. |
| What does `<script setup>` do? | Wraps your code in `setup()` and exposes every top-level binding to the template. |
| How does `scoped` work? | Selectors get a `[data-v-hash]` suffix; rendered elements get the matching attribute. Child root elements also receive the parent's hash. |

## Check your understanding

1. You change `const hp = 18` to `const hp = 5` in `MinionCard.vue` and save. Why does the HP bar
   update in the browser, even though nothing in the component is reactive yet?
2. Why can a scoped style in `App.vue` add a margin to `<MinionCard />` but not change the color of
   the name inside it?

<details>
<summary>Answers</summary>

1. Saving the file triggers hot module replacement: Vite recompiles the component and Vue re-creates
   the instances with the new code, so `setup` runs again with `hp = 5`. That is a code change, not a
   state change. At runtime, without editing the file, nothing could change `hp` and the card would
   not update. Reactivity (chapter 2) is about changes _while the app runs_.
2. The margin targets the child's root element, which carries the parent's scope attribute as well
   as its own. The name is an inner element that only carries `MinionCard`'s scope attribute, so the
   parent's rewritten selector does not match it.

</details>

## Further reading

- [Vue docs: SFC syntax specification](https://vuejs.org/api/sfc-spec.html)
- [Vue docs: `<script setup>`](https://vuejs.org/api/sfc-script-setup.html)
- [Vue docs: SFC CSS features](https://vuejs.org/api/sfc-css-features.html)
- [Vue docs: Rendering mechanism](https://vuejs.org/guide/extras/rendering-mechanism.html)
- [Tailwind CSS docs: Theme variables](https://tailwindcss.com/docs/theme)
