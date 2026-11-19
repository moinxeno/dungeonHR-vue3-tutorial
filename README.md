# DungeonHR

> The Dark Lord is on sabbatical. Somebody has to keep the dungeon running.

**DungeonHR** is the internal staff and resource portal for the dungeon workforce: goblins, skeletons,
orcs, minotaurs, beholders and one very punctual werewolf. It is also a complete, open-source
**Vue 3 reference project** with a step-by-step tutorial that builds the app from an empty folder.

## What the app does

- **Minion Roster**: overview cards for every employee with HP, threat level, salary in gold coins
  and union membership.
- **Sector Planner**: post minions to dungeon sectors such as _Treasury Guard_, _Catacombs_ or
  _Torture Chamber 3_.
- **Aggro & Burnout Monitor**: live warnings when incompatible creatures share a room, a sector
  blows its payroll budget, or someone is about to burn out.
- **Leave Requests**: a dynamic, validated form for vacation, shift swaps and full-moon leave
  (werewolves only).

## Tech stack

Vue 3 (Single File Components, `<script setup>`, Composition API) · TypeScript · Vite · Pinia ·
Vue Router · Tailwind CSS · Vitest.

## Learn by building it

The [`tutorial/`](./tutorial/README.md) folder contains two tracks:

- **`tutorial/build/`**: hands-on chapters. Follow along and rebuild the app step by step.
- **`tutorial/concepts/`**: mental-model guides. Why each concept exists and how it works under
  the hood.

Every chapter has a matching git branch that holds the finished state of that chapter, so you can
always compare your code with a working reference.

## License

[MIT](./LICENSE)
