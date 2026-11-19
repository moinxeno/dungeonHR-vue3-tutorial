# The DungeonHR Tutorial

This tutorial builds DungeonHR, a Vue 3 application, from an empty folder to a tested, persisted,
multi-page app. It is written for developers who already know JavaScript (and ideally a bit of
TypeScript) but are new to Vue, or who have used Vue without ever asking _why_ it works the way it
does.

## Two tracks, one app

The material is split into two complementary tracks. Use them together.

| Track | Folder | Purpose | Read it when… |
| --- | --- | --- | --- |
| **Build** | [`build/`](./build) | Step-by-step, hands-on instructions. Every code change is shown in full. | …you want to write code. |
| **Concepts** | [`concepts/`](./concepts) | Mental models: why a concept exists, what problem it solves, how it works under the hood. | …something "just works" and you want to know why, or something breaks and you don't know why. |

Each build chapter links to the concept guides it relies on. You can read a concept guide before
the chapter (to know what you are about to do) or after it (to understand what you just did). Both
orders work; pick the one that suits you.

## Chapters and branches

Every chapter has a matching git branch. The branch contains the **finished state** of that
chapter: all code and all tutorial pages up to and including it.

| # | Branch | Build chapter | Concept guides |
| --- | --- | --- | --- |
| 0 | tag `step-00-start` | [Getting started](./build/00-getting-started.md) | — |
| 1 | `step-01-scaffolding-and-first-sfc` | [Scaffolding and your first SFC](./build/01-scaffolding-and-first-sfc.md) | [Anatomy of an SFC](./concepts/01-anatomy-of-an-sfc.md) |
| 2 | `step-02-reactivity-and-props` | [Reactivity and props](./build/02-reactivity-and-props.md) | [Reactivity under the hood](./concepts/02-reactivity-under-the-hood.md), [Typing components with TypeScript](./concepts/03-typing-components-with-typescript.md) |
| 3 | `step-03-events-and-forms` | [Events and forms](./build/03-events-and-forms.md) | [Props down, events up](./concepts/04-props-down-events-up.md), [Two-way binding demystified](./concepts/05-two-way-binding-demystified.md) |
| 4 | `step-04-routing-and-views` | [Routing and views](./build/04-routing-and-views.md) | [Client-side routing](./concepts/06-client-side-routing.md) |
| 5 | `step-05-pinia-state-management` | [Pinia state management](./build/05-pinia-state-management.md) | [State management with Pinia](./concepts/07-state-management-with-pinia.md) |
| 6 | `step-06-composables-and-persistence` | [Composables and persistence](./build/06-composables-and-persistence.md) | [Composables and lifecycle](./concepts/08-composables-and-lifecycle.md) |
| 7 | `main` | [Testing and polish](./build/07-testing-and-polish.md) | [Testing Vue applications](./concepts/09-testing-vue-applications.md) |

## How to use the branches

The branches form a straight line: each one starts where the previous one ended.

```text
step-00-start ── step-01 ── step-02 ── step-03 ── step-04 ── step-05 ── step-06 ── main
```

`step-00-start` is a tag on the very first commit: an empty project with only this tutorial in it.
All other entries are branches.

To work through chapter _N_, start from the branch of chapter _N − 1_ and build on top of it:

```bash
git switch step-02-reactivity-and-props
git switch -c my-step-03
```

When you are done, or when you are stuck, compare your work with the reference solution:

```bash
git diff step-03-events-and-forms
```

To see exactly what a chapter changed, diff two consecutive reference branches:

```bash
git diff step-02-reactivity-and-props step-03-events-and-forms
```

## Conventions used in this tutorial

- Code blocks are complete. When a file changes, the chapter shows the whole file (or clearly marks
  the one block that changes), never `// ...rest of the code`.
- Shell commands assume you are in the repository root.
- Callouts:
  - **Why?** explains the reasoning behind a decision.
  - **Pitfall:** describes a mistake that is easy to make and how to recognize it.
  - **Checkpoint:** tells you what you should see before moving on.
