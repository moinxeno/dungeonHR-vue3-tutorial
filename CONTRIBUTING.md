# Contributing to DungeonHR

Thank you for helping. DungeonHR is two things at once, an app and a tutorial, and every change has
to keep both of them correct. This guide explains how.

## Setup

```bash
npm install
npm run dev
```

Before opening a pull request, run the same checks as CI:

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
npm test
```

```bash
npm run build
```

## How the repository is organized

- `src/` is the application on `main`: the finished state after the last chapter.
- `tutorial/build/` contains the hands-on chapters, `tutorial/concepts/` the mental-model guides.
- Every chapter has a git reference with its finished state: the tag `step-00-start`, then the branches
  `step-01-…` to `step-06-…`, then `main`. They form a straight line: each one starts where the previous
  one ended.

```text
step-00-start ── step-01 ── step-02 ── step-03 ── step-04 ── step-05 ── step-06 ── main
```

## Where to make a change

| You want to… | Change it on |
| --- | --- |
| Fix a typo or wording in a chapter | The branch where that chapter was introduced, then carry it forward (see below) |
| Fix a bug in code that a chapter shows | The branch where that code was introduced, update the chapter's code block, then carry it forward |
| Improve the finished app without touching the tutorial | `main` |
| Add a new chapter | Discuss it in an issue first |

### Carrying a change forward

Learners check out the step branches, so a fix on `step-03-…` must also reach `step-04-…`, `step-05-…`,
`step-06-…` and `main`. Commit the fix on the earliest branch that needs it, then cherry-pick it onto
each later branch in order:

```bash
git switch step-04-routing-and-views
```

```bash
git cherry-pick <commit>
```

Resolve conflicts where later chapters changed the same lines, and repeat for every later branch.

## Rules for tutorial content

- **English, plain and precise.** Explain the why before the how.
- **Code blocks are complete.** When a chapter shows a file, it shows the whole file, or one clearly
  marked block of it. No `// ...rest of the code`.
- **Code blocks match the repository byte for byte.** If you change a file that a chapter shows, update
  the chapter in the same commit. A quick way to check: every fenced code block that claims to be a file
  must be identical to that file on the chapter's branch.
- **Every claim is checked.** Compiler output, error messages and behavior described in the text should
  be reproduced, not remembered.
- **Checkpoints are observable.** Tell the learner exactly what they should see.

## Code conventions

- `<script setup lang="ts">` and the Composition API only.
- Domain types come from `src/types/dungeon.ts`. Value lists are `as const` arrays with derived unions.
- Business rules go into pure functions or store actions, never into templates.
- Tailwind utilities for styling; scoped CSS only where utilities hurt readability.
- Tests live in `__tests__/` folders next to the code they test.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/): `feat(step-03): …`, `fix(step-02): …`,
`docs(step-05): …`, `test: …`. Mention the step when a commit belongs to a chapter.
