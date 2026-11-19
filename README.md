# DungeonHR

> The Dark Lord is on sabbatical. Somebody has to keep the dungeon running.

**DungeonHR** is the internal staff and resource portal for the dungeon workforce: goblins, skeletons,
orcs, minotaurs, beholders and a few very punctual werewolves. It is also a complete, open-source
**Vue 3 reference project** with a step-by-step tutorial that builds the app from an empty folder.

## What the app does

- **Minion Roster**: cards for every employee with HP, stress, threat level, salary and union
  membership. Recruit, heal, rest, fire (unless the union objects), filter and search.
- **Minion profiles**: one page per minion at `/minion/:id`, with their current post.
- **Sector Planner**: post minions to sectors such as _Treasury Guard_, _Catacombs_ or
  _Torture Chamber 3_, one shift at a time.
- **Aggro & Burnout Monitor**: live warnings when incompatible creatures share a shift, a shift is
  overbooked, a sector blows its payroll budget, or someone is about to burn out.
- **Leave Requests**: a validated form for vacations, shift swaps and full-moon leave (werewolves only,
  and only on an actual full moon). Approved leave lowers a minion's stress.
- **Shift clock**: the shift on duty, the time until the next one, and the nights until the full moon.
- Everything is saved in the browser and synchronized between open tabs.

## Tech stack

| | |
| --- | --- |
| Framework | Vue 3: Single File Components, `<script setup>`, Composition API |
| Language | TypeScript, strict, type-checked templates (`vue-tsc`) |
| Build | Vite |
| Routing | Vue Router |
| State | Pinia (setup stores) |
| Styling | Tailwind CSS v4 with a custom dark theme |
| Tests | Vitest, `@vue/test-utils`, jsdom |
| Quality | ESLint, Oxlint, Prettier, GitHub Actions |

## Quick start

Requires Node.js `22.18+` or `24.12+`.

```bash
npm install
npm run dev
```

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the dev server with hot module replacement |
| `npm test` | Run the test suite once |
| `npm run test:unit` | Run the tests in watch mode |
| `npm run build` | Type-check and build for production into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run type-check` | Type-check `.ts` and `.vue` files with `vue-tsc` |
| `npm run lint` | Lint with Oxlint and ESLint (auto-fix) |
| `npm run format` | Format `src/` with Prettier |

## How it is built

```text
src/
├── types/dungeon.ts       The domain model: minions, sectors, assignments, alerts, requests
├── data/                  Seed data and static reference data
├── utils/                 Pure functions: dates, moon phases, validation, formatting
├── composables/           Reusable reactive logic: useLocalStorage, useAggroCalculator, useShiftClock
├── stores/                Pinia stores: dungeon (minions, sectors, assignments) and requests
├── router/                Routes, lazy-loaded views, titles, focus management
├── components/            UI building blocks, grouped by feature (minions, sectors, requests, ui, layout)
├── views/                 One component per page
└── **/__tests__/          Tests next to the code they test
```

The layers depend on each other in one direction only:

```text
views  ──▶  components  ──▶  stores  ──▶  composables  ──▶  utils / data / types
```

- **Business rules** live in pure functions (`utils/validation.ts`, `calculateAlerts` in
  `composables/useAggroCalculator.ts`) and in store actions. Components never change shared data
  directly.
- **Shared state** lives in two Pinia stores. Local UI state (filters, drafts, confirmations) stays in
  components.
- **Presentational components** (`MinionCard`, `AssignmentPicker`, the forms) get data through props
  and report through events. **Connected components** (`SectorColumn`, `AggroMonitor`, the views) use
  the stores.

## Learn by building it

The [`tutorial/`](./tutorial/README.md) folder contains two tracks:

- **[`tutorial/build/`](./tutorial/build)**: eight hands-on chapters. Follow along and rebuild the app
  step by step.
- **[`tutorial/concepts/`](./tutorial/concepts)**: nine mental-model guides. Why each concept exists and
  how it works under the hood.

Every chapter has a matching git reference that holds its finished state:

| Chapter | Reference |
| --- | --- |
| 0. Getting started | tag `step-00-start` |
| 1. Scaffolding and your first SFC | branch `step-01-scaffolding-and-first-sfc` |
| 2. Reactivity and props | branch `step-02-reactivity-and-props` |
| 3. Events and forms | branch `step-03-events-and-forms` |
| 4. Routing and views | branch `step-04-routing-and-views` |
| 5. Pinia state management | branch `step-05-pinia-state-management` |
| 6. Composables and persistence | branch `step-06-composables-and-persistence` |
| 7. Testing and polish | branch `main` |

## Contributing

Corrections and improvements are welcome, to the app and to the tutorial. See
[CONTRIBUTING.md](./CONTRIBUTING.md) for how the branches and chapters fit together.

## License

[MIT](./LICENSE)
