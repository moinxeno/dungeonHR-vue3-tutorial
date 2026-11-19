# Testing Vue Applications

> **Used in:** [Chapter 7: Testing and Polish](../build/07-testing-and-polish.md)

Most people agree that tests are good. Fewer agree on _which_ tests, and many test suites end up slow,
brittle and ignored. This guide is about writing tests that stay useful: what to test at which level,
how to keep tests independent of implementation details, and how Vue's asynchronous rendering, the DOM
and test doubles fit together.

---

## 1. What tests are for

A test suite is worth its maintenance cost when it gives you three things:

1. **Confidence to change code.** You can refactor (as chapter 6 did) and know within seconds whether
   behavior changed.
2. **Executable documentation.** `it('allows non-union staff 10 days and union members 14')` states a
   rule more precisely than any comment, and it cannot go stale without failing.
3. **Fast feedback while you work.** Watch mode re-runs the affected tests on every save, long before
   you would have clicked through the app.

Notice what is _not_ on the list: proving the code has no bugs, or reaching a coverage number. Tests
check the cases someone thought of. Their value comes from choosing those cases well.

## 2. Test behavior, not implementation

The single most important rule: **a test should fail when behavior breaks, and only then.**

```ts
// ✗ Tests implementation: breaks when the variable is renamed, though nothing visible changed.
expect(wrapper.vm.isConfirmingFire).toBe(true)

// ✓ Tests behavior: what a user sees and what the parent receives.
expect(wrapper.text()).toContain('Fire Snikkit Two-Knives?')
expect(wrapper.emitted('fire')).toBeUndefined()
```

For a component, its **public interface** is:

- the **props** it accepts (inputs),
- what it **renders** (output a user sees),
- the **events** it emits (output a parent receives),
- the **slots** it renders, and any **stores** it reads or calls (side channels).

Test through those. Anything else (internal refs, private functions, CSS class names, the exact DOM
structure) is implementation, and tests that depend on it turn every refactoring into a chore of
updating tests that were never wrong.

The same rule applies elsewhere. A store's public interface is its returned state, getters and
actions; DungeonHR's tests never touch the private `minionsById` lookup. A pure function's interface is
its arguments and return value.

## 3. Choosing the level

Different kinds of tests have different costs and catch different bugs:

```text
                   ▲ slower, broader, more realistic, more brittle
   end-to-end      │  a real browser, the whole app        "recruit, assign, reload, check"
   views           │  a page with real stores               MinionDetailView
   components      │  one component in jsdom                MinionCard, MinionForm
   stores          │  state and actions, no DOM             useDungeonStore
   composables     │  reactive logic in an effect scope     useLocalStorage
   pure functions  │  data in, data out                     validateLeaveRequest, calculateAlerts
                   ▼ faster, narrower, more precise, more stable
```

A good default: **test every rule at the lowest level where it lives**, and test each higher level only
for what that level adds.

- The rule "union members get 14 vacation days" lives in `validateLeaveRequest`. It is tested there,
  with boundary values. The form test does not repeat it.
- What the form adds is the wiring: fields per request type, errors shown after submit, the right
  draft emitted. That is what the form tests check.

This is why the architecture matters so much for testing. DungeonHR keeps its rules in pure functions
and store actions, so most of its 112 tests need neither a DOM nor a component.

## 4. Pure functions: the easy part

```ts
it.each([
  [69, undefined],
  [70, 'warning'],
  [89, 'warning'],
  [90, 'critical'],
])('rates a minion at %d stress as %s', (stress, severity) => {
  expect(calculateAlerts([makeMinion({ stress })], [], [])[0]?.severity).toBe(severity)
})
```

Techniques worth keeping:

- **Table-driven tests** (`it.each`) for rules with several cases. A new case is a new row.
- **Boundary values.** Test both sides of every threshold: 69 and 70, 89 and 90, 10 and 11 days.
- **Independent expected values.** The expected full moons come from astronomers, not from running the
  function and pasting its output. Otherwise the test only proves the code returns what it returns.
- **Inject what varies.** `validateLeaveRequest` takes `today` as a parameter, so tests choose the day.
  Code that reads the clock, the network or random numbers internally is harder to test; push those to
  the edges and pass the results in.

## 5. Test doubles

Sometimes the real thing is slow, unpredictable or unavailable in a test. A **test double** stands in
for it. The vocabulary is a little loose in practice, but the distinctions are useful:

| Double | What it does | In DungeonHR |
| --- | --- | --- |
| **Stub** | Replaces something with a simple version that returns fixed answers | `RouterLinkStub` instead of `RouterLink` |
| **Spy** | Wraps a real function to record calls, optionally changing its behavior | `vi.spyOn(Math, 'random').mockReturnValue(0.999)` |
| **Mock** | A replacement with programmed behavior, often checked for how it was called | `setItem` that throws a quota error |
| **Fake** | A working, simplified implementation | jsdom's `localStorage`; Vitest's fake timers |

Guidelines:

- **Double the boundaries, not your own code.** Randomness, time, storage, the router, the network:
  yes. Your own store inside a view test: usually no. A real store is fast and catches real
  integration problems.
- **Restore what you replace.** `vi.restoreAllMocks()` and `vi.useRealTimers()` in `afterEach`, so one
  test's double never leaks into the next.
- **Prefer fakes to elaborate mocks.** A mock that scripts every call couples the test to the exact
  sequence of calls, which is implementation.

## 6. Vue is asynchronous; tests must wait

Vue batches DOM updates (the [scheduler](./02-reactivity-under-the-hood.md#6-scheduling-why-24-writes-cause-one-render)).
After a state change, the DOM is updated in the next flush, not immediately. Tests must wait for it:

```ts
dungeon.getMinion('m-001')!.hp = 0
await nextTick() // wait for the re-render
expect(wrapper.text()).toContain('Knocked out')
```

`@vue/test-utils` helps: `trigger`, `setValue` and `setProps` return promises that resolve after the
next render. **Always `await` them.** A missing `await` is the most common reason for a test that fails
for no visible reason, or, worse, passes for the wrong one.

Watchers follow the same rhythm: `useLocalStorage`'s `watch` runs in the flush after the change, so the
storage tests `await nextTick()` before reading `localStorage`.

Other kinds of asynchrony need their own tools:

| Waiting for | Tool |
| --- | --- |
| Vue's re-render or watchers | `await nextTick()`, or `await` the test-utils action |
| Resolved promises (e.g. a mocked API call) | `await flushPromises()` from `@vue/test-utils` |
| Timers (`setInterval`, `setTimeout`) | Fake timers: `vi.useFakeTimers()` and `vi.advanceTimersByTimeAsync(ms)` |
| The current date | `vi.setSystemTime(date)`, or `vi.useFakeTimers({ toFake: ['Date'] })` to fake only the date |

## 7. Testing what users see

Component tests read best, and break least, when they interact with the component the way a user
would:

- **Find elements by what users perceive**: visible text, labels, roles. DungeonHR's tests find buttons
  by their label (`'Heal'`, `'Yes, fire'`) and inputs by their type. Selectors like `.bg-ember-600` break
  whenever the design changes.
- **Interact through events**: `trigger('click')`, `setValue(…)`, `trigger('submit')`. Calling a
  component's internal function from a test skips exactly the wiring you wanted to test.
- **Check outcomes**: rendered text, attributes such as `disabled` and `aria-invalid`, emitted events.

Testing accessibility attributes is a nice side effect of this style. If a test can find the error by
`aria-invalid="true"`, so can a screen reader.

(The [Testing Library](https://testing-library.com/docs/vue-testing-library/intro/) family takes this
idea further, with queries such as `getByRole('button', { name: 'Heal' })`. DungeonHR uses plain
`@vue/test-utils` to keep the toolchain small; the principles are the same.)

### Mount and shallow mount

`mount` renders a component with all its children. `shallowMount` replaces every child component with a
stub. Shallow mounting isolates a component, but it also tests less: the parent's interaction with its
real children disappears, and tests start asserting on stubs, which is implementation. Prefer `mount`,
and stub selectively (as DungeonHR does with `RouterLink`) where a child needs infrastructure the test
does not want to set up.

## 8. Isolation: every test starts from zero

Tests must not depend on each other. A test that passes alone and fails after another test (or the other
way round) is **flaky**, and flaky tests get ignored, which defeats the point of having tests.

Shared state is the usual culprit. DungeonHR resets all of it before each test:

```ts
beforeEach(() => {
  localStorage.clear() // persisted state from the previous test
  setActivePinia(createPinia()) // stores from the previous test
})
```

…and restores replaced globals after each test (`vi.restoreAllMocks()`, `vi.useRealTimers()`). Components
mounted with `attachTo: document.body` are unmounted at the end of their test.

## 9. Regression tests

When you fix a bug, first write a test that fails because of it, then fix it and watch the test pass.
The test documents the bug and makes sure it never returns. DungeonHR has several, each tied to a
lesson from earlier chapters:

| Test | Guards against |
| --- | --- |
| "spares knocked-out minions" (dungeon store) | The step-02 raid bug: stress rising for unconscious minions |
| "finds the known problems in the seed data" (aggro) | Behavior changes when chapter 6 moved the alert rules |
| "follows a changing id without being re-created" (detail view) | Chapter 4's component reuse pitfall |
| "follows the prop when it changes while the form stays open" (leave form) | The gap closed with `watch` in chapter 6 |
| "starts its timer on mount and stops it on unmount" (shift clock) | Leaking timers |

## 10. Coverage, snapshots and other tools

**Coverage** reports which lines the tests execute. It is useful for finding code that no test touches,
such as an untested branch in a validation rule. It is a poor target: 100% coverage says every line ran,
not that any result was checked. Add it with `@vitest/coverage-v8` when you want the map, and read it as
"what did we forget?", not as a grade.

**Snapshot tests** (`expect(wrapper.html()).toMatchSnapshot()`) record a component's output and fail when
it changes. They are cheap to write and catch accidental changes, but they also fail on every intended
change, and reviewers tend to approve updated snapshots without reading them. Use them sparingly, for
output that really should not change.

**End-to-end tests** run the built app in a real browser (Playwright, Cypress). They are the only tests
that see real CSS, real routing and real storage together. They are also the slowest and most brittle,
so a few that cover the most important user journeys complement a large base of fast unit tests.

## Summary

| Principle | In practice |
| --- | --- |
| Test behavior | Through props, rendered output, events and store APIs; never internals. |
| Lowest level first | Each rule is tested where it lives; higher levels test only their own wiring. |
| Inject what varies | Pass dates and other changing inputs in; fake time and randomness at the edges. |
| Doubles at boundaries | Stub the router, fake timers and storage, spy on randomness; use real stores. |
| Await Vue | `await` every interaction; `nextTick`, `flushPromises` and fake timers for the rest. |
| Find like a user | By text, label and role, not by CSS classes. |
| Isolate | Reset storage and Pinia before each test, restore mocks after it. |
| Regression tests | Every fixed bug and every hard-won lesson gets a test. |
| Coverage | A map of what is untested, not a goal. |

## Check your understanding

1. A teammate proposes testing the "Only werewolves can request full-moon leave" rule in
   `LeaveRequestForm.spec.ts` for every species. Where should those cases go instead, and what should
   the form test check?
2. A component test sets a store value, then immediately checks `wrapper.text()`, and fails, although
   the app works in the browser. What is the likely cause?

<details>
<summary>Answers</summary>

1. The rule lives in `validateLeaveRequest`, so the per-species cases belong in `validation.spec.ts`,
   where each one is a fast function call (a table with `it.each` works well). The form test should
   check only what the form adds: that the validation error is shown after submitting, and that no
   `submit` event is emitted while the request is invalid. One species is enough for that.
2. The test does not wait for Vue's re-render. Changing the store schedules an update; the DOM changes in
   the next flush. Add `await nextTick()` (or `await wrapper.vm.$nextTick()`) between the change and the
   assertion.

</details>

## Further reading

- [Vue docs: Testing](https://vuejs.org/guide/scaling-up/testing.html)
- [Vitest docs](https://vitest.dev/guide/)
- [Vue Test Utils docs](https://test-utils.vuejs.org/guide/)
- [Pinia docs: Testing stores](https://pinia.vuejs.org/cookbook/testing.html)
- [Testing Library: Guiding principles](https://testing-library.com/docs/guiding-principles)
