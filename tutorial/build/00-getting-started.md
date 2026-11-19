# Chapter 0: Getting Started

Welcome to the night shift. Before we write a single line of Vue, this chapter makes sure your
machine is ready and explains how the tutorial and the repository fit together.

**You will:**

- install and verify the tools used throughout the tutorial,
- get a copy of the repository,
- learn how to move between chapters with git.

**Time:** about 15 minutes.

---

## 1. What we are building

DungeonHR is the HR portal of a dungeon whose owner, the Dark Lord, is on sabbatical. By the end of
the tutorial it has four areas:

| Area | What it does | Vue concepts it teaches |
| --- | --- | --- |
| Minion Roster | Cards for every employee with HP, threat level, salary and union status | Single File Components, props, `computed` |
| Sector Planner | Post minions to sectors like _Treasury Guard_ or _Torture Chamber 3_ | Pinia stores, derived global state |
| Aggro & Burnout Monitor | Warns about incompatible roommates, blown budgets and burnout | `computed`, composables, discriminated unions |
| Leave Requests | Validated, dynamic form (full-moon leave is for werewolves only) | `v-model`, `defineEmits`, form validation |

Every feature is introduced at the moment it becomes the natural answer to a problem we ran into in
the previous chapter. That is deliberate: the tutorial is ordered by _need_, not by API reference.

## 2. Prerequisites

### Knowledge

You should be comfortable with modern JavaScript: modules, arrow functions, destructuring,
`Array.prototype.map/filter/reduce`, promises. Basic TypeScript (type annotations, interfaces,
union types) helps but is not required; the concept guides explain everything Vue-specific.

You do **not** need prior Vue experience.

### Tools

| Tool | Version | Check with |
| --- | --- | --- |
| Node.js | `22.18` or newer, or `24.12` or newer | `node -v` |
| npm | ships with Node.js | `npm -v` |
| git | any recent version | `git --version` |
| A code editor | VS Code recommended | — |

Run the three checks now:

```bash
node -v
npm -v
git --version
```

**Pitfall:** If `node -v` prints something older than `v22.18.0`, the project scaffolder in
chapter 1 will refuse to run or will produce a project that fails to start. Upgrade Node.js first,
for example through [the official installer](https://nodejs.org/) or a version manager such as
`fnm` or `nvm`.

### Editor setup (VS Code)

Install these extensions. The repository recommends them automatically once you open it, but it is
good to know what each one does:

| Extension | Why you want it |
| --- | --- |
| **Vue - Official** (`Vue.volar`) | Syntax highlighting, type checking and autocompletion inside `.vue` files. Without it, VS Code treats `.vue` files as plain text. |
| **ESLint** (`dbaeumer.vscode-eslint`) | Shows lint errors inline. |
| **Prettier** (`esbenp.prettier-vscode`) | Formats files on save, so you never think about indentation. |
| **Tailwind CSS IntelliSense** (`bradlc.vscode-tailwindcss`) | Autocompletes utility classes and previews their CSS on hover. |

**Pitfall:** Old Vue tutorials recommend an extension called _Vetur_. It is for Vue 2 and conflicts
with Vue - Official. If you have it installed, disable it for this workspace.

### Browser

Any evergreen browser works. The project includes the **Vue DevTools** as a Vite plugin, so you do
not need to install a browser extension: once the dev server runs, a small Vue logo appears at the
bottom of the page and opens an inspector for components, state and routes.

## 3. Get the repository

Clone the repository and enter it:

```bash
git clone <repository-url> dungeon-hr
cd dungeon-hr
```

Replace `<repository-url>` with the URL of this repository (or of your fork, if you want to push
your own progress).

## 4. How chapters map to git

Every chapter has a git reference that contains its finished state:

| Reference | Contains |
| --- | --- |
| tag `step-00-start` | Only the README, license and the tutorial index. This is where chapter 1 begins. |
| branch `step-01-scaffolding-and-first-sfc` | The finished state of chapter 1. |
| branch `step-02-reactivity-and-props` | The finished state of chapter 2. |
| … | … |
| branch `main` | The finished, tested application. |

There are two ways to work through the tutorial. Pick one.

### Option A: Follow along on a branch of your own (recommended)

Start from the end state of the previous chapter, then do the chapter's work on your own branch:

```bash
git switch -c my-step-01 step-00-start
```

When you finish the chapter (or get stuck), compare your work with the reference:

```bash
git diff step-01-scaffolding-and-first-sfc
```

For the next chapter, start fresh from the reference so that small differences in your code do not
pile up:

```bash
git switch -c my-step-02 step-01-scaffolding-and-first-sfc
```

**Why?** Starting every chapter from the reference branch means the instructions always match the
code in front of you. If you would rather keep building on your own code, that works too; just
expect to adapt the occasional detail.

### Option B: Read and explore

If you prefer to read first, check out any reference branch and run it:

```bash
git switch step-01-scaffolding-and-first-sfc
npm install
npm run dev
```

You can see exactly what a chapter changed by diffing two consecutive branches:

```bash
git diff step-01-scaffolding-and-first-sfc step-02-reactivity-and-props
```

## 5. How to read a chapter

Each build chapter has the same shape:

1. **Goal**: what you will have at the end and how long it takes.
2. **Steps**: numbered, each with complete code.
3. **Checkpoints**: what you should see in the browser or terminal before moving on.
4. **Recap**: the ideas worth keeping, with links to the concept guides that explain them in depth.

Three kinds of callouts appear throughout:

- **Why?** explains a design decision.
- **Pitfall:** describes a common mistake and how to recognize it.
- **Checkpoint:** a moment to stop and verify.

**Checkpoint:** `node -v`, `npm -v` and `git --version` all print a version, your editor has the
Vue - Official extension, and you are inside the cloned repository. You are ready for
[Chapter 1: Scaffolding and Your First SFC](./01-scaffolding-and-first-sfc.md).
