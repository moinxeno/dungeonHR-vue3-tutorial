# Chapter 1: Scaffolding and Your First SFC

The Dark Lord left a note on the throne: _"Get the staff portal running before I'm back."_ In this
chapter we create the project, give it a suitably gloomy look, and build the first piece of the
roster: a card that shows one minion.

**You will:**

- scaffold a Vue 3 + TypeScript project with Vite,
- understand what each generated file is for,
- add Tailwind CSS v4 with a custom dark theme,
- write your first Single File Component (SFC), `MinionCard.vue`,
- run type checking, linting and a production build.

**Start from:** tag `step-00-start` · **Reference solution:** branch
`step-01-scaffolding-and-first-sfc` · **Time:** about 60 minutes.

**Concept guide:** [Anatomy of an SFC](../concepts/01-anatomy-of-an-sfc.md) explains what a `.vue`
file really is and what the compiler does with it. Read it before or after this chapter.

```bash
git switch -c my-step-01 step-00-start
```

---

## 1. Scaffold the project

Vue's official scaffolding tool is `create-vue`. It generates a Vite project with exactly the
features you ask for.

The repository is not empty: it already contains the README, the license, `.gitignore` and this
tutorial. `create-vue` refuses to write into a non-empty folder unless you pass `--force`, and with
`--force` it **empties the folder first**, which would delete the tutorial. So we scaffold into a
temporary sibling folder and copy the result over.

```bash
npm create vue@3.24.0 -- --ts --vitest --eslint --prettier --bare ../dungeon-hr-scaffold
```

What the flags mean:

| Flag | Effect |
| --- | --- |
| `--ts` | TypeScript everywhere, including `<script setup lang="ts">` in `.vue` files. |
| `--vitest` | Unit testing with Vitest and `@vue/test-utils`. We write tests in the final chapter, but the setup is in place from day one. |
| `--eslint` | ESLint plus Oxlint (a very fast linter that runs first). |
| `--prettier` | Prettier for formatting. |
| `--bare` | No demo components. We want a clean slate, not a "You did it!" page full of example code to delete. |

We deliberately leave out `--router` and `--pinia`. You will add both by hand in chapters 4 and 5,
at the moment you actually need them, which is the best way to understand what they do.

**Why the pinned version `3.24.0`?** The tutorial was written against it. A newer `create-vue` may
generate slightly different files, which would make the instructions drift from what you see. Once
you have finished the tutorial, use `npm create vue@latest` for your own projects.

Now copy everything except `README.md` and `.gitignore` (we already have our own) into the
repository and remove the temporary folder.

On macOS and Linux:

```bash
rsync -a --exclude README.md --exclude .gitignore ../dungeon-hr-scaffold/ ./
```

```bash
rm -rf ../dungeon-hr-scaffold
```

On Windows, copy the contents of `..\dungeon-hr-scaffold` into the repository with File Explorer.
Make sure hidden files and folders (`.vscode`, `.editorconfig`, `.prettierrc.json`, …) are
included, and skip `README.md` and `.gitignore`. Then delete the temporary folder.

The bare template still ships two things we do not want: a demo test for its "You did it!" page and
the default Vite favicon. Delete both:

```bash
rm -rf src/__tests__ public/favicon.ico
```

Finally, install the dependencies:

```bash
npm install
```

**Checkpoint:** `npm install` finishes without errors. You may see a note about `fsevents` install
scripts (a macOS file-watching helper; npm is fine without approving it) and a few "moderate"
audit warnings in development-only packages. Neither affects the app.

## 2. A tour of the generated files

Before changing anything, take five minutes to understand what you just got. Every file has a job.

| File | Job |
| --- | --- |
| `package.json` | Dependencies and npm scripts. The scripts are your daily tools; see the table below. |
| `index.html` | The single HTML page of the app. Vite serves it as-is and injects your code through `<script type="module" src="/src/main.ts">`. |
| `src/main.ts` | The entry point. Creates the Vue application and mounts it into `<div id="app">`. |
| `src/App.vue` | The root component. Everything you see in the browser is rendered from here. |
| `vite.config.ts` | Vite configuration: the Vue plugin, the Vue DevTools plugin, and the `@` alias that points to `src/`. |
| `vitest.config.ts` | Test configuration. Reuses the Vite config and runs tests in a simulated browser (`jsdom`). |
| `tsconfig.json` | A "solution" file that only references three real configs: |
| `tsconfig.app.json` | …for application code in `src/` (browser environment). |
| `tsconfig.node.json` | …for config files such as `vite.config.ts` (Node.js environment). |
| `tsconfig.vitest.json` | …for test files (Node.js + jsdom environment). |
| `env.d.ts` | Teaches TypeScript about Vite-specific features such as `import.meta.env` and importing assets. |
| `eslint.config.ts`, `.oxlintrc.json` | Lint rules: Vue's essential rules, TypeScript's recommended rules, Vitest rules for test files. |
| `.prettierrc.json` | Formatting rules: no semicolons, single quotes, 100-character lines. |
| `.editorconfig`, `.gitattributes` | Editor-agnostic basics: UTF-8, two-space indentation, LF line endings. |
| `.vscode/` | Recommended extensions and workspace settings (format on save, file nesting). |

The npm scripts:

| Script | What it does |
| --- | --- |
| `npm run dev` | Starts the Vite dev server with hot module replacement. |
| `npm run build` | Type-checks and builds an optimized production bundle into `dist/` (both in parallel). |
| `npm run preview` | Serves the `dist/` folder locally, to test the production build. |
| `npm run type-check` | Runs `vue-tsc`, the TypeScript compiler that understands `.vue` files. |
| `npm run lint` | Runs Oxlint, then ESLint, and auto-fixes what it can. |
| `npm run format` | Formats everything in `src/` with Prettier. |
| `npm run test:unit` | Runs Vitest in watch mode. |

**Why three `tsconfig` files?** Your application code runs in a browser, `vite.config.ts` runs in
Node.js, and tests run in Node.js with a fake DOM. Each environment has different global types
(`window` exists in one, `process` in another). Separate configs stop you from accidentally using
`process.env` in a component, where it would crash at runtime.

Start the dev server:

```bash
npm run dev
```

**Checkpoint:** Open the URL Vite prints (usually `http://localhost:5173`). You see a plain "You did
it!" heading on a white page. Leave the server running; it updates the page every time you save.

## 3. Add Tailwind CSS

Tailwind is a utility-first CSS framework: instead of writing a `.card` class in a stylesheet, you
compose small single-purpose classes such as `rounded-2xl p-5 bg-crypt-900` directly in the
template. Tailwind v4 integrates with Vite through a plugin and is configured in CSS, not in a
JavaScript config file.

Install Tailwind, its Vite plugin, and a Prettier plugin that sorts utility classes into a
consistent order:

```bash
npm install -D tailwindcss @tailwindcss/vite prettier-plugin-tailwindcss
```

We also want a display font with the right amount of carved-stone gravitas. `@fontsource` packages
let you self-host Google Fonts through npm, without requests to third-party servers:

```bash
npm install @fontsource/cinzel
```

**Why is the font a regular dependency and Tailwind a dev dependency?** The font files end up in
the bundle the user downloads. Tailwind only runs at build time and is not shipped. Vite bundles
both either way, so this is about documenting intent.

### 3.1 Register the Vite plugin

Replace `vite.config.ts` with:

```ts
import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), tailwindcss(), vueDevTools()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
```

### 3.2 Create the theme

Create `src/assets/main.css`. This file imports Tailwind and defines our design tokens: a cold
"crypt" stone palette for surfaces, "ember" orange for actions, "ichor" green for health, "blood"
red for danger and "gold" for money.

```css
@import 'tailwindcss';

/*
 * Design tokens.
 *
 * Every variable in `@theme` becomes both a CSS custom property and a set of utility classes.
 * `--color-crypt-900` gives us `bg-crypt-900`, `text-crypt-900`, `border-crypt-900`, and so on.
 * `static` emits every variable even if no utility uses it, so plain CSS (such as the scoped
 * styles in our components) can always rely on `var(--color-…)`.
 */
@theme static {
  /* Typography */
  --font-display: 'Cinzel', ui-serif, Georgia, serif;
  --font-sans: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;

  /* Crypt: cold, slightly violet stone. Backgrounds, surfaces, borders and body text. */
  --color-crypt-50: #f6f5f9;
  --color-crypt-100: #ebe8f2;
  --color-crypt-200: #d3cee1;
  --color-crypt-300: #aea7c4;
  --color-crypt-400: #827a9e;
  --color-crypt-500: #5f5879;
  --color-crypt-600: #453f5a;
  --color-crypt-700: #312c42;
  --color-crypt-800: #221e2f;
  --color-crypt-900: #17141f;
  --color-crypt-950: #0c0a12;

  /* Ember: torchlight. Primary accent for actions and focus. */
  --color-ember-300: #fdba74;
  --color-ember-400: #fb923c;
  --color-ember-500: #f97316;
  --color-ember-600: #ea580c;
  --color-ember-700: #c2410c;

  /* Ichor: toxic green. Health and success. */
  --color-ichor-300: #bef264;
  --color-ichor-400: #a3e635;
  --color-ichor-500: #84cc16;
  --color-ichor-600: #65a30d;

  /* Blood: danger, warnings and threat. */
  --color-blood-300: #fca5a5;
  --color-blood-400: #f87171;
  --color-blood-500: #ef4444;
  --color-blood-600: #dc2626;
  --color-blood-700: #b91c1c;

  /* Gold: salaries and everything the Dark Lord's accountant cares about. */
  --color-gold-300: #fde047;
  --color-gold-400: #facc15;
  --color-gold-500: #eab308;
}

/* Global defaults. DungeonHR is dark by design, so there is no light theme to switch to. */
@layer base {
  :root {
    color-scheme: dark;
  }

  body {
    @apply min-h-screen bg-crypt-950 font-sans text-crypt-100 antialiased;
    /* A faint torch glow at the top of the page. */
    background-image: radial-gradient(
      ellipse 80% 50% at 50% -10%,
      color-mix(in oklab, var(--color-ember-600) 18%, transparent),
      transparent
    );
    background-attachment: fixed;
  }

  h1,
  h2,
  h3 {
    @apply font-display tracking-wide;
  }

  :focus-visible {
    @apply outline-2 outline-offset-2 outline-ember-400;
  }
}
```

A few things worth noticing:

- `@theme` is where Tailwind v4 is configured. There is no `tailwind.config.js` anymore.
- `--font-display` creates the utility `font-display`; `--font-sans` overrides Tailwind's default
  sans-serif stack.
- `@layer base` holds element defaults. `@apply` lets you reuse utilities inside regular CSS; use it
  sparingly, for global defaults like these.
- `color-scheme: dark` tells the browser to draw native controls (scrollbars, date pickers) in their
  dark variant.

### 3.3 Load the stylesheet and fonts

Replace `src/main.ts` with:

```ts
import { createApp } from 'vue'

import '@fontsource/cinzel/600.css'
import '@fontsource/cinzel/700.css'
import './assets/main.css'

import App from './App.vue'

createApp(App).mount('#app')
```

Importing a CSS file from TypeScript looks odd at first. It is a Vite feature: Vite sees the import,
processes the CSS (running Tailwind on the way) and injects it into the page. We load only the two
font weights we use, 600 and 700, to keep the download small.

**Why does the CSS import come before `App`?** CSS is applied in import order. Global styles first,
component styles after, so a component can always override a global default.

### 3.4 Teach Prettier and VS Code about Tailwind

Replace `.prettierrc.json` with:

```json
{
  "$schema": "https://json.schemastore.org/prettierrc",
  "semi": false,
  "singleQuote": true,
  "printWidth": 100,
  "plugins": ["prettier-plugin-tailwindcss"],
  "tailwindStylesheet": "./src/assets/main.css"
}
```

`tailwindStylesheet` tells the plugin where our theme lives, so it can sort custom utilities like
`bg-crypt-900` correctly.

Add the Tailwind extension to `.vscode/extensions.json`:

```json
{
  "recommendations": [
    "Vue.volar",
    "vitest.explorer",
    "dbaeumer.vscode-eslint",
    "EditorConfig.EditorConfig",
    "oxc.oxc-vscode",
    "esbenp.prettier-vscode",
    "bradlc.vscode-tailwindcss"
  ]
}
```

And associate `.css` files with the Tailwind language mode in `.vscode/settings.json`, so that
`@theme` and `@apply` are not flagged as unknown at-rules:

```json
{
  "explorer.fileNesting.enabled": true,
  "explorer.fileNesting.patterns": {
    "tsconfig.json": "tsconfig.*.json, env.d.ts, typed-router.d.ts",
    "vite.config.*": "jsconfig*, vitest.config.*, cypress.config.*, playwright.config.*",
    "package.json": "package-lock.json, pnpm*, .yarnrc*, yarn*, .eslint*, eslint*, .oxlint*, oxlint*, .oxfmt*, .prettier*, prettier*, .editorconfig, bun.lock, nub.lock"
  },
  "editor.codeActionsOnSave": {
    "source.fixAll": "explicit"
  },
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "files.associations": {
    "*.css": "tailwindcss"
  }
}
```

The repository's `.gitignore` ignores `.vscode/*` except `extensions.json` and `settings.json`, so
these two files are shared with everyone who clones the project.

**Checkpoint:** The browser page turned dark, with a faint orange glow at the top. If it is still
white, restart `npm run dev`; Vite only picks up new plugins in `vite.config.ts` on startup.

## 4. Allow an empty test run

We will not write tests until the final chapter, but the `test:unit` script should not fail in the
meantime. Vitest treats "no test files found" as an error by default. Replace `vitest.config.ts`
with:

```ts
import { fileURLToPath } from 'node:url'
import { mergeConfig, defineConfig, configDefaults } from 'vitest/config'
import viteConfig from './vite.config.ts'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      exclude: [...configDefaults.exclude, 'e2e/**'],
      root: fileURLToPath(new URL('./', import.meta.url)),
      // The test suite is written in the final chapter. Until then, an empty run is not a failure.
      passWithNoTests: true,
    },
  }),
)
```

## 5. Polish `index.html` and the favicon

Replace `index.html` with:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="DungeonHR: the staff and resource portal of the dungeon." />
    <meta name="theme-color" content="#0c0a12" />
    <title>DungeonHR</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`lang="en"` matters for screen readers and automatic translation. `theme-color` tints the browser
UI on mobile to match our background.

Create `public/favicon.svg`, a small skull with ember eyes:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <path fill="#ebe8f2" d="M16 2C9 2 4 7 4 13.5c0 3.6 1.6 6.4 4 8.3V26a2 2 0 0 0 2 2h2v-3h2v3h4v-3h2v3h2a2 2 0 0 0 2-2v-4.2c2.4-1.9 4-4.7 4-8.3C28 7 23 2 16 2Z"/>
  <circle cx="11" cy="14" r="3.2" fill="#f97316"/>
  <circle cx="21" cy="14" r="3.2" fill="#f97316"/>
  <path fill="#0c0a12" d="m16 17.5-2 3.5h4z"/>
</svg>
```

Files in `public/` are copied to the build output unchanged and served from the site root, which is
why `index.html` refers to `/favicon.svg` and not `/public/favicon.svg`.

## 6. Your first Single File Component: `MinionCard.vue`

A Single File Component bundles a piece of UI's **logic** (`<script setup>`), **markup**
(`<template>`) and **styles** (`<style>`) into one `.vue` file. Components are the building blocks
of every Vue app: the roster is a grid of cards, the card is a component, and later the whole page
will be a component too.

We organize components by feature. Create the folder `src/components/minions/` and, inside it,
`MinionCard.vue`:

```vue
<script setup lang="ts">
// For now, every value is hard-coded. In chapter 2 these constants become props,
// so that each card can show a different minion.
const name = 'Grizzle Snaggletooth'
const speciesLabel = 'Goblin'
const icon = '👺'
const hp = 18
const maxHp = 24
const threatLevel = 2
const salary = 120
const isUnionized = true

// Plain arithmetic, evaluated once when the component is created.
const hpPercent = Math.round((hp / maxHp) * 100)
</script>

<template>
  <article
    class="minion-card rounded-2xl border border-crypt-700 bg-crypt-900/80 p-5 shadow-lg shadow-black/40"
  >
    <header class="flex items-start gap-4">
      <span
        class="grid size-14 shrink-0 place-items-center rounded-xl bg-crypt-800 text-3xl"
        aria-hidden="true"
      >
        {{ icon }}
      </span>

      <div class="min-w-0 flex-1">
        <h3 class="text-lg leading-snug font-semibold text-crypt-50">{{ name }}</h3>
        <p class="text-sm text-crypt-400">{{ speciesLabel }}</p>
      </div>

      <span
        v-if="isUnionized"
        class="rounded-full border border-ichor-600/50 bg-ichor-500/10 px-2.5 py-0.5 text-xs font-medium text-ichor-300"
      >
        Union
      </span>
    </header>

    <dl class="mt-5 space-y-4 text-sm">
      <div>
        <div class="flex justify-between">
          <dt class="text-crypt-400">Hit points</dt>
          <dd class="font-medium text-crypt-100">{{ hp }} / {{ maxHp }}</dd>
        </div>
        <div
          class="mt-1.5 h-2 overflow-hidden rounded-full bg-crypt-800"
          role="meter"
          aria-label="Hit points"
          :aria-valuenow="hp"
          aria-valuemin="0"
          :aria-valuemax="maxHp"
        >
          <div class="h-full rounded-full bg-ichor-500" :style="{ width: `${hpPercent}%` }"></div>
        </div>
      </div>

      <div class="flex justify-between">
        <dt class="text-crypt-400">Threat level</dt>
        <dd class="font-medium text-blood-400">{{ threatLevel }} / 5</dd>
      </div>

      <div class="flex justify-between">
        <dt class="text-crypt-400">Salary</dt>
        <dd class="font-medium text-gold-400">{{ salary }} gp / month</dd>
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
    translate 200ms ease;
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

Let's walk through it block by block.

### 6.1 `<script setup lang="ts">`

- `setup` means: this code runs once for every instance of the component, when it is created. Every
  top-level binding (`const`, `function`, `import`) is automatically available in the template. No
  `export default`, no `return { ... }`.
- `lang="ts"` turns on TypeScript. `vue-tsc` and your editor type-check the script _and_ the
  expressions inside the template.
- The values are plain constants. They are not reactive: if `hp` could change, the card would not
  notice. That is fine for now, because nothing changes yet. Chapter 2 introduces reactivity.

### 6.2 `<template>`

The template is HTML extended with a few Vue features. This card uses these:

| Syntax | Name | Meaning |
| --- | --- | --- |
| `{{ name }}` | Text interpolation | Insert the value of a JavaScript expression as text. The value is HTML-escaped, so `<script>` in a name would show up as text, not run. |
| `:aria-valuenow="hp"` | Attribute binding (`v-bind`, shorthand `:`) | The attribute value is a JavaScript expression, not a string. Without the colon, `aria-valuenow="hp"` would literally be the text `hp`. |
| `:style="{ width: … }"` | Style binding | A special case of `v-bind`: pass an object of CSS properties. |
| `v-if="isUnionized"` | Conditional rendering | The element exists in the DOM only when the expression is truthy. |

**Pitfall:** Notice `aria-valuemin="0"` has no colon and `:aria-valuemax="maxHp"` does. Use the
colon when the value comes from your script; leave it out for fixed strings. Forgetting the colon
is the most common beginner mistake in Vue templates, and it fails silently: the attribute just
contains the variable name as text.

The markup also pays attention to semantics and accessibility:

- `<article>` marks the card as a self-contained piece of content.
- `<dl>`, `<dt>`, `<dd>` (a description list) is the semantic element for label/value pairs.
- The emoji avatar is decorative, so `aria-hidden="true"` keeps screen readers from announcing
  "goblin face" before the name.
- The HP bar has `role="meter"` plus `aria-value*` attributes, so assistive technology can read it.

### 6.3 `<style scoped>`

`scoped` means these rules only affect elements rendered by _this_ component. If another component
also uses a class called `minion-card`, the two do not interfere. The concept guide shows how Vue
achieves this with generated `data-v-…` attributes.

Tailwind and scoped styles work well together. The rule of thumb used throughout DungeonHR:

- **Tailwind utilities** for layout, spacing, colors and typography (almost everything).
- **Scoped CSS** for things that read badly as utilities: multi-property transitions, keyframe
  animations, complex selectors.

The scoped block uses `var(--color-ember-600)`, a variable defined by our `@theme`. That is what
the `static` keyword in `main.css` is for: without it, Tailwind only emits variables that some
utility class actually uses, and `var(--color-ember-500)` in a scoped style would silently resolve
to nothing.

## 7. Use the component in `App.vue`

Replace `src/App.vue` with:

```vue
<script setup lang="ts">
import MinionCard from '@/components/minions/MinionCard.vue'
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
      <h2 class="mb-6 text-2xl font-semibold text-crypt-100">Minion Roster</h2>

      <!-- Three cards, but they all show the same goblin. Chapter 2 fixes that with props. -->
      <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <MinionCard />
        <MinionCard />
        <MinionCard />
      </div>
    </main>
  </div>
</template>
```

Using a component takes two steps: import it in `<script setup>`, then use it as a tag in the
template. With `<script setup>` there is no separate registration step; the import is enough.

- `@/components/...` uses the alias from `vite.config.ts`. `@` always means `src/`, no matter how
  deep the importing file is nested, so you never write `../../../components`.
- Component tags are written in PascalCase (`<MinionCard />`), which makes them easy to tell apart
  from native HTML elements.
- The grid is responsive: one column on phones, two from the `sm` breakpoint (640 px), three from
  `lg` (1024 px). Tailwind is mobile-first: unprefixed classes apply everywhere, prefixed classes
  apply from that breakpoint upwards.

**Checkpoint:** The browser shows the DungeonHR header and three identical cards for Grizzle
Snaggletooth. Hovering a card makes its border glow orange. Resize the window: the grid switches
between one, two and three columns. A Vue logo floats at the bottom of the page; click it to open
the Vue DevTools and find `MinionCard` three times in the component tree.

## 8. Run the quality checks

Get into the habit of running these before every commit:

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

```bash
npx vitest run
```

`npx vitest run` runs the test suite once instead of in watch mode. It reports that there are no
test files yet and exits successfully, thanks to `passWithNoTests`.

**Checkpoint:** All five commands succeed. `npm run build` prints a list of files written to
`dist/`, including the Cinzel font files and one CSS and one JavaScript bundle.

Commit your work:

```bash
git add -A
```

```bash
git commit -m "feat: scaffold DungeonHR and add a static MinionCard"
```

## 9. Try it yourself

Small experiments that make the concepts stick. Undo them afterwards.

1. Set `isUnionized` to `false` in `MinionCard.vue` and watch the badge disappear. Open the browser's
   element inspector: the `<span>` is gone from the DOM entirely, not just hidden. That is what
   `v-if` does.
2. Remove the colon from `:aria-valuemax="maxHp"` and inspect the HP bar. The attribute now
   contains the text `maxHp`.
3. Add `<style scoped>h3 { color: red; }</style>` to the end of `App.vue`. Nothing turns red:
   `App.vue`'s scoped styles cannot reach elements inside `MinionCard`. Now change the selector to
   `.minion-card { outline: 2px solid red; }`. This time all three cards get an outline. Inspect a
   card's root `<article>`: it carries _two_ `data-v-…` attributes, one from `MinionCard` and one
   from `App`. Vue deliberately applies the parent's scope to a child's **root** element, so a parent
   can position its children (margins, grid placement) without reaching into their internals. The
   concept guide explains the mechanism.

## Recap

- `create-vue` scaffolds a Vite project with exactly the features you ask for. We added Router and
  Pinia later on purpose.
- An SFC has up to three blocks: `<script setup>` (logic that runs once per instance), `<template>`
  (declarative markup) and `<style scoped>` (CSS that only affects this component).
- In the template, `{{ }}` inserts text, `:attr` binds an attribute to an expression, and `v-if`
  adds or removes elements.
- Tailwind v4 is configured in CSS with `@theme`; every token becomes utilities and a CSS variable.
- `npm run type-check`, `lint`, `format` and `build` are your safety net.

The card has a problem, though: all three cards show Grizzle. A component that can only ever show
one thing is just a fancy copy-and-paste. In
[Chapter 2: Reactivity and Props](./02-reactivity-and-props.md) we give each card its own minion
and make the roster react to changes.

**Go deeper:** [Anatomy of an SFC](../concepts/01-anatomy-of-an-sfc.md) shows what the compiler
turns your `.vue` file into, how `<script setup>` works, and how scoped styles are implemented.
