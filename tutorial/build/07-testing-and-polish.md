# Chapter 7: Testing and Polish

In chapter 6 you moved the dungeon's most important rules from one file to another, and then checked
by clicking through the planner and comparing numbers. It worked, this time. The next refactoring will
be done by someone else, or by you in six months, and nobody will remember which numbers to compare.

This final chapter gives DungeonHR a safety net: 112 automated tests that check the rules, the
composables, the stores and the components in about four seconds. Then it adds the last finishing
touches: focus management after navigation, continuous integration, and documentation for
contributors.

**You will:**

- set up Vitest for a project that uses `localStorage`, Pinia, the router and timers,
- test pure functions with table-driven tests,
- test composables inside an effect scope, with mocks and fake timers,
- test Pinia stores in isolation, including persistence across a simulated reload,
- test components the way users use them: find, click, type, check what is shown and emitted,
- write regression tests for bugs and lessons from earlier chapters,
- move focus to the new page after each navigation,
- run every check in CI on each push.

**Start from:** branch `step-06-composables-and-persistence` · **Reference solution:** branch `main` ·
**Time:** about 2 to 3 hours.

**Concept guide:** [Testing Vue applications](../concepts/09-testing-vue-applications.md) explains
what to test, what not to test, and how test doubles, the DOM and Vue's asynchronous updates fit
together.

```bash
git switch -c my-step-07 step-06-composables-and-persistence
```

---

## 1. What to test

DungeonHR has layers, and each layer is tested differently. The lower the layer, the cheaper and more
precise its tests:

| Layer | Example | Test style | Count in this chapter |
| --- | --- | --- | --- |
| Pure functions | `validateLeaveRequest`, `calculateAlerts`, `isFullMoon` | Call with data, check the result | Most |
| Composables | `useLocalStorage`, `useShiftClock` | Run in an effect scope or a tiny component | Some |
| Stores | `useDungeonStore`, `useRequestsStore` | Fresh Pinia per test, call actions, check state | Some |
| Components | `MinionCard`, `MinionForm` | Mount, interact, check DOM and emitted events | A few per component |
| Views | `MinionDetailView` | Mount with a real store | Few |
| Whole app in a browser | "recruit, assign, reload" | End-to-end tests (not covered here) | None |

This is the payoff of the architecture from the previous chapters. Because the rules live in pure
functions, most tests need no DOM, no Vue and no setup at all.

## 2. Configure Vitest

Vitest was installed in chapter 1 and configured to tolerate an empty test suite. Now it needs one more
setting. Replace `vitest.config.ts`:

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
      // Recent Node.js versions ship their own `localStorage` global, which is `undefined` unless
      // Node is started with `--localstorage-file`, and which hides jsdom's working implementation.
      // Turning Node's version off lets the tests use jsdom's, like a browser would.
      execArgv: ['--no-experimental-webstorage'],
    },
  }),
)
```

- `passWithNoTests` is gone. From now on, a run without tests is a mistake worth noticing.
- `execArgv` passes a flag to the Node.js processes that run the tests. Recent Node.js versions define
  their own global `localStorage`, which is `undefined` unless Node is started with a storage file. In a
  jsdom test environment, that global hides jsdom's working `localStorage`, and every test that touches
  storage fails with _"Cannot read properties of undefined"_. Turning off Node's version fixes it.

Add a script that runs the suite once, for CI and pre-commit checks. In `package.json`, add `"test"`
next to `"test:unit"`:

```json
"test:unit": "vitest",
"test": "vitest run",
```

`npm run test:unit` keeps running in watch mode, re-running affected tests whenever you save a file.
`npm test` runs everything once and exits with an error code if anything fails.

### Anatomy of a test file

```ts
import { describe, expect, it } from 'vitest'

describe('isFullMoon', () => {
  // a group
  it('accepts the night of the full moon', () => {
    // one test
    expect(isFullMoon('2026-11-24')).toBe(true) // one assertion
  })
})
```

Tests live in `__tests__/` folders next to the code they test, and their names end in `.spec.ts`. The
TypeScript setup from chapter 1 already treats those folders separately (`tsconfig.vitest.json`), so
test-only types never leak into the app.

## 3. Test data factories

Most tests need a minion, and a minion has eleven fields. Writing all of them in every test buries the
one field the test is about. Create `src/__tests__/factories.ts`:

```ts
import type { DungeonSector, Minion, MinionDraft } from '@/types/dungeon'

/**
 * Test data factories. Each returns a complete, valid object, and a test overrides only the fields
 * it is about. That keeps tests short and makes their intent obvious:
 * `makeMinion({ stress: 95 })` says "a minion whose stress matters here".
 */

let nextId = 1

export function makeMinion(overrides: Partial<Minion> = {}): Minion {
  const id = `test-m-${nextId++}`
  return {
    id,
    name: `Minion ${id}`,
    species: 'goblin',
    hp: 20,
    maxHp: 20,
    threatLevel: 2,
    salary: 100,
    isUnionized: false,
    stress: 0,
    hiredOn: '2020-01-01',
    ...overrides,
  }
}

export function makeSector(overrides: Partial<DungeonSector> = {}): DungeonSector {
  return {
    id: `test-s-${nextId++}`,
    name: 'Test Sector',
    kind: 'catacombs',
    capacity: 3,
    minThreatLevel: 1,
    payrollBudget: 1000,
    ...overrides,
  }
}

export function makeMinionDraft(overrides: Partial<MinionDraft> = {}): MinionDraft {
  return {
    name: 'Nibbles',
    species: 'goblin',
    maxHp: 22,
    threatLevel: 1,
    salary: 100,
    isUnionized: false,
    ...overrides,
  }
}
```

`makeMinion({ stress: 95 })` reads as "a minion whose stress matters here". Every other field has a
sensible default. Each call gets a fresh ID, so minions from the same test never collide.

The file sits in `__tests__/` but does not end in `.spec.ts`, so Vitest does not run it; it is only
imported.

## 4. Pure functions

### 4.1 Moon phases

Create `src/utils/__tests__/moonPhase.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { isFullMoon, moonAge, nextFullMoon, SYNODIC_MONTH_DAYS } from '@/utils/moonPhase'

describe('moonAge', () => {
  it('always stays within one lunar cycle', () => {
    for (const date of ['1999-12-31', '2000-01-06', '2026-11-19', '2087-06-01']) {
      const age = moonAge(date)
      expect(age).toBeGreaterThanOrEqual(0)
      expect(age).toBeLessThan(SYNODIC_MONTH_DAYS)
    }
  })
})

describe('nextFullMoon', () => {
  // Real full moons of late 2026 and early 2027, as published by astronomers.
  it.each([
    ['2026-11-19', '2026-11-24'],
    ['2026-11-24', '2026-11-24'],
    ['2026-11-25', '2026-12-24'],
    ['2026-12-25', '2027-01-22'],
  ])('from %s finds the full moon on %s', (from, expected) => {
    expect(nextFullMoon(from)).toBe(expected)
  })
})

describe('isFullMoon', () => {
  it('accepts the night of the full moon and one day either side', () => {
    expect(isFullMoon('2026-11-23')).toBe(true)
    expect(isFullMoon('2026-11-24')).toBe(true)
    expect(isFullMoon('2026-11-25')).toBe(true)
  })

  it('rejects dates further away', () => {
    expect(isFullMoon('2026-11-22')).toBe(false)
    expect(isFullMoon('2026-11-26')).toBe(false)
    expect(isFullMoon('2026-12-09')).toBe(false)
  })

  it('can be made stricter', () => {
    expect(isFullMoon('2026-11-24', 0)).toBe(true)
    expect(isFullMoon('2026-11-23', 0)).toBe(false)
  })
})
```

**`it.each`** runs the same test for every row of a table. `%s` in the name is replaced by the row's
values, so each row shows up as its own test: _"from 2026-11-19 finds the full moon on 2026-11-24"_.
Adding a case is adding a row.

The expected dates are real astronomical full moons, not values copied from the function's output. A
test that only repeats what the code currently returns cannot catch a bug in that code.

### 4.2 Validation

Create `src/utils/__tests__/validation.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { makeMinion, makeMinionDraft } from '@/__tests__/factories'
import type { LeaveRequestDraft } from '@/types/dungeon'
import { validateLeaveRequest, validateMinionDraft } from '@/utils/validation'

describe('validateMinionDraft', () => {
  it('accepts a complete draft', () => {
    expect(validateMinionDraft(makeMinionDraft())).toEqual({ valid: true, errors: {} })
  })

  it.each([
    ['', 'Every minion needs a name.'],
    ['   ', 'Every minion needs a name.'],
    ['G', 'Names need at least 2 characters.'],
    ['G'.repeat(41), 'Names can have at most 40 characters.'],
  ])('rejects the name %j', (name, message) => {
    const result = validateMinionDraft(makeMinionDraft({ name }))
    expect(result.valid).toBe(false)
    expect(result.errors.name).toBe(message)
  })

  it('rejects names that are already taken, ignoring case and surrounding spaces', () => {
    const result = validateMinionDraft(makeMinionDraft({ name: '  grizzle snaggletooth ' }), [
      'Grizzle Snaggletooth',
    ])
    expect(result.errors.name).toBe('A minion with this name already works here.')
  })

  it('rejects an empty number field, which arrives as an empty string', () => {
    // A cleared <input type="number"> gives '' at runtime, whatever the type says.
    const draft = { ...makeMinionDraft(), maxHp: '' as unknown as number }
    expect(validateMinionDraft(draft).errors.maxHp).toBe(
      'Max HP must be a whole number from 1 to 999.',
    )
  })

  it.each([0, 1.5, 1000])('rejects %d as max HP', (maxHp) => {
    expect(validateMinionDraft(makeMinionDraft({ maxHp })).errors.maxHp).toBeDefined()
  })

  it('accepts unpaid interns but no negative salaries', () => {
    expect(validateMinionDraft(makeMinionDraft({ salary: 0 })).valid).toBe(true)
    expect(validateMinionDraft(makeMinionDraft({ salary: -10 })).errors.salary).toBeDefined()
  })

  it('limits the bio to 280 characters', () => {
    expect(validateMinionDraft(makeMinionDraft({ bio: 'x'.repeat(280) })).valid).toBe(true)
    expect(validateMinionDraft(makeMinionDraft({ bio: 'x'.repeat(281) })).errors.bio).toBeDefined()
  })
})

describe('validateLeaveRequest', () => {
  // `today` is a parameter, so every test can pretend it is the same day.
  const today = '2026-11-19'
  const goblin = makeMinion({ species: 'goblin', isUnionized: false })
  const unionGoblin = makeMinion({ species: 'goblin', isUnionized: true })
  const werewolf = makeMinion({ species: 'werewolf' })

  function vacation(startDate: string, endDate: string): LeaveRequestDraft {
    return { type: 'vacation', minionId: goblin.id, note: '', startDate, endDate }
  }

  it('requires an applicant', () => {
    const result = validateLeaveRequest(vacation('2026-12-01', '2026-12-02'), {
      applicant: undefined,
      today,
    })
    expect(result.errors.minionId).toBe('Pick the minion this request is for.')
  })

  describe('vacation', () => {
    it('accepts a valid vacation', () => {
      expect(
        validateLeaveRequest(vacation('2026-12-01', '2026-12-10'), { applicant: goblin, today })
          .valid,
      ).toBe(true)
    })

    it('rejects missing dates', () => {
      const { errors } = validateLeaveRequest(vacation('', ''), { applicant: goblin, today })
      expect(errors.startDate).toBe('Pick the first day of the vacation.')
      expect(errors.endDate).toBe('Pick the last day of the vacation.')
    })

    it('rejects a start in the past, but allows starting today', () => {
      const past = validateLeaveRequest(vacation('2026-11-18', '2026-11-20'), {
        applicant: goblin,
        today,
      })
      expect(past.errors.startDate).toBe('Vacations cannot start in the past.')
      expect(validateLeaveRequest(vacation(today, today), { applicant: goblin, today }).valid).toBe(
        true,
      )
    })

    it('rejects an end before the start', () => {
      const { errors } = validateLeaveRequest(vacation('2026-12-10', '2026-12-01'), {
        applicant: goblin,
        today,
      })
      expect(errors.endDate).toBe('The vacation must end on or after its first day.')
    })

    it('allows non-union staff 10 days and union members 14', () => {
      const elevenDays = vacation('2026-12-01', '2026-12-11')
      const fifteenDays = vacation('2026-12-01', '2026-12-15')
      const fourteenDays = vacation('2026-12-01', '2026-12-14')

      expect(validateLeaveRequest(elevenDays, { applicant: goblin, today }).errors.endDate).toBe(
        'Non-union staff can take at most 10 days in a row. This request covers 11.',
      )
      expect(validateLeaveRequest(fourteenDays, { applicant: unionGoblin, today }).valid).toBe(true)
      expect(
        validateLeaveRequest(fifteenDays, { applicant: unionGoblin, today }).errors.endDate,
      ).toBe('Union members can take at most 14 days in a row. This request covers 15.')
    })
  })

  describe('full-moon leave', () => {
    function fullMoonLeave(minionId: string, fullMoonDate: string): LeaveRequestDraft {
      return { type: 'full-moon-leave', minionId, note: '', fullMoonDate }
    }

    it('accepts a werewolf on the night of a full moon', () => {
      expect(
        validateLeaveRequest(fullMoonLeave(werewolf.id, '2026-11-24'), {
          applicant: werewolf,
          today,
        }).valid,
      ).toBe(true)
    })

    it('is for werewolves only', () => {
      const { errors } = validateLeaveRequest(fullMoonLeave(goblin.id, '2026-11-24'), {
        applicant: goblin,
        today,
      })
      expect(errors.minionId).toBe('Only werewolves can request full-moon leave.')
    })

    it('rejects dates that are not a full moon and names the next one', () => {
      const { errors } = validateLeaveRequest(fullMoonLeave(werewolf.id, '2026-12-05'), {
        applicant: werewolf,
        today,
      })
      expect(errors.fullMoonDate).toBe('That is not a full moon. The next one is on 24 Nov 2026.')
    })

    it('rejects full moons in the past', () => {
      const { errors } = validateLeaveRequest(fullMoonLeave(werewolf.id, '2026-10-26'), {
        applicant: werewolf,
        today,
      })
      expect(errors.fullMoonDate).toBe('That full moon has already passed.')
    })
  })

  describe('shift swap', () => {
    function shiftSwap(overrides: Partial<Extract<LeaveRequestDraft, { type: 'shift-swap' }>>) {
      return {
        type: 'shift-swap' as const,
        minionId: goblin.id,
        note: '',
        date: '2026-11-28',
        fromShift: 'dusk' as const,
        toShift: 'midnight' as const,
        swapPartnerId: null,
        ...overrides,
      }
    }

    it('accepts a swap without a partner', () => {
      expect(validateLeaveRequest(shiftSwap({}), { applicant: goblin, today }).valid).toBe(true)
    })

    it('rejects swapping a shift for the same shift', () => {
      const { errors } = validateLeaveRequest(shiftSwap({ toShift: 'dusk' }), {
        applicant: goblin,
        today,
      })
      expect(errors.toShift).toBe('Pick a different shift than the current one.')
    })

    it('rejects swapping with yourself', () => {
      const { errors } = validateLeaveRequest(shiftSwap({ swapPartnerId: goblin.id }), {
        applicant: goblin,
        today,
      })
      expect(errors.swapPartnerId).toBe('Minions cannot swap shifts with themselves.')
    })
  })

  it('limits the note to 500 characters', () => {
    const draft = { ...vacation('2026-12-01', '2026-12-02'), note: 'x'.repeat(501) }
    expect(validateLeaveRequest(draft, { applicant: goblin, today }).errors.note).toBeDefined()
  })
})
```

Notice how `today` is just a constant. `validateLeaveRequest` takes the current date as a parameter
(chapter 4 made that choice for exactly this moment), so the tests are independent of the day they
run on. A test suite that passes in November and fails in December is worse than none.

**Boundary values.** The vacation tests check 10 and 11 days for non-union staff, 14 and 15 for union
members. Off-by-one errors hide at boundaries, so that is where tests look.

**The type gap.** `maxHp: '' as unknown as number` builds a draft that TypeScript would normally
reject, because that is what a cleared number input really produces at runtime. Tests are a good place
to check that code handles reality, not just the types.

## 5. Composables

### 5.1 The alert rules

Create `src/composables/__tests__/useAggroCalculator.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { nextTick, ref } from 'vue'

import { makeMinion, makeSector } from '@/__tests__/factories'
import { calculateAlerts, useAggroCalculator } from '@/composables/useAggroCalculator'
import { seedAssignments } from '@/data/seedAssignments'
import { seedMinions } from '@/data/seedMinions'
import { seedSectors } from '@/data/seedSectors'
import type { Assignment } from '@/types/dungeon'

describe('calculateAlerts', () => {
  const sector = makeSector({ id: 's-1', name: 'Pit', capacity: 2, payrollBudget: 1000 })

  it('reports nothing for a peaceful, affordable dungeon', () => {
    const goblin = makeMinion({ species: 'goblin' })
    const assignments: Assignment[] = [{ minionId: goblin.id, sectorId: 's-1', shift: 'dawn' }]
    expect(calculateAlerts([goblin], [sector], assignments)).toEqual([])
  })

  it('flags incompatible species on the same shift, in either order', () => {
    const goblin = makeMinion({ species: 'goblin', name: 'Gob' })
    const orc = makeMinion({ species: 'orc', name: 'Orky' })
    const assignments: Assignment[] = [
      { minionId: orc.id, sectorId: 's-1', shift: 'dusk' },
      { minionId: goblin.id, sectorId: 's-1', shift: 'dusk' },
    ]

    const [alert] = calculateAlerts([goblin, orc], [sector], assignments)

    expect(alert).toMatchObject({
      kind: 'incompatible-species',
      severity: 'warning',
      sectorId: 's-1',
      shift: 'dusk',
    })
    expect(alert?.message).toContain('Long-standing lunch-table dispute.')
  })

  it('ignores incompatible species on different shifts', () => {
    const goblin = makeMinion({ species: 'goblin' })
    const orc = makeMinion({ species: 'orc' })
    const assignments: Assignment[] = [
      { minionId: goblin.id, sectorId: 's-1', shift: 'dawn' },
      { minionId: orc.id, sectorId: 's-1', shift: 'dusk' },
    ]
    expect(calculateAlerts([goblin, orc], [sector], assignments)).toEqual([])
  })

  it('gives an alert the same ID no matter who was assigned first', () => {
    const a = makeMinion({ species: 'minotaur' })
    const b = makeMinion({ species: 'minotaur' })
    const forward: Assignment[] = [
      { minionId: a.id, sectorId: 's-1', shift: 'dawn' },
      { minionId: b.id, sectorId: 's-1', shift: 'dawn' },
    ]
    const backward = [...forward].reverse()

    const first = calculateAlerts([a, b], [sector], forward)[0]
    const second = calculateAlerts([a, b], [sector], backward)[0]

    expect(first?.severity).toBe('critical')
    expect(first?.id).toBe(second?.id)
  })

  it('warns when a shift has more minions than posts', () => {
    const crew = [makeMinion(), makeMinion(), makeMinion()]
    const assignments = crew.map((minion): Assignment => ({
      minionId: minion.id,
      sectorId: 's-1',
      shift: 'midnight',
    }))
    const alerts = calculateAlerts(crew, [sector], assignments)
    expect(alerts).toContainEqual(
      expect.objectContaining({ kind: 'over-capacity', assigned: 3, capacity: 2 }),
    )
  })

  it('warns over budget and turns critical above 125% of it', () => {
    const pricey = makeMinion({ salary: 1100 })
    const veryPricey = makeMinion({ salary: 1300 })
    const assign = (id: string): Assignment[] => [{ minionId: id, sectorId: 's-1', shift: 'dawn' }]

    expect(calculateAlerts([pricey], [sector], assign(pricey.id))[0]).toMatchObject({
      kind: 'over-budget',
      severity: 'warning',
      payroll: 1100,
    })
    expect(calculateAlerts([veryPricey], [sector], assign(veryPricey.id))[0]?.severity).toBe(
      'critical',
    )
  })

  it.each([
    [69, undefined],
    [70, 'warning'],
    [89, 'warning'],
    [90, 'critical'],
  ])('rates a minion at %d stress as %s', (stress, severity) => {
    const alerts = calculateAlerts([makeMinion({ stress })], [], [])
    expect(alerts[0]?.severity).toBe(severity)
  })

  it('lists critical alerts first', () => {
    const minions = [makeMinion({ stress: 75 }), makeMinion({ stress: 95 })]
    const severities = calculateAlerts(minions, [], []).map((alert) => alert.severity)
    expect(severities).toEqual(['critical', 'warning'])
  })

  // A regression test: chapter 6 moved these rules out of the store. The seed data must still
  // produce exactly the alerts it produced before the move.
  it('finds the known problems in the seed data', () => {
    const alerts = calculateAlerts(seedMinions, seedSectors, seedAssignments)
    const count = (severity: string) => alerts.filter((a) => a.severity === severity).length

    expect(count('critical')).toBe(4)
    expect(count('warning')).toBe(5)
    expect(alerts.map((alert) => alert.id)).toContain(
      'incompatible:s-gatehouse:midnight:m-004:m-011',
    )
  })
})

describe('useAggroCalculator', () => {
  it('updates its alerts when the inputs change', async () => {
    const minions = ref([makeMinion({ stress: 10 })])
    const { alerts } = useAggroCalculator(minions, [], [])

    expect(alerts.value).toHaveLength(0)

    minions.value[0]!.stress = 95
    await nextTick()

    expect(alerts.value).toHaveLength(1)
    expect(alerts.value[0]?.kind).toBe('burnout-risk')
  })

  it('accepts getter functions as inputs', () => {
    const minions = ref([makeMinion({ stress: 80 })])
    const { alerts } = useAggroCalculator(
      () => minions.value,
      () => [],
      () => [],
    )
    expect(alerts.value).toHaveLength(1)
  })
})
```

Most tests call the pure `calculateAlerts` with a handful of minions. Only the last two check the
reactive wrapper: change a ref, wait for Vue, check that the alerts followed.

**`await nextTick()`** waits until Vue has processed pending reactive updates. A `computed` is lazy and
would recompute on the next read anyway, but waiting makes the test independent of such details.

**A regression test.** _"finds the known problems in the seed data"_ pins down the exact behavior that
chapter 6 had to preserve: 4 critical alerts and 5 warnings for the seed data. Had this test existed
then, the refactoring would have been verified in milliseconds instead of by clicking.

**Accessing array elements.** The project's strict TypeScript setting `noUncheckedIndexedAccess` types
`alerts[0]` as possibly `undefined`. Tests use `alerts[0]?.severity` to read it, and `minions.value[0]!`
(a non-null assertion) where the test itself just created the element.

### 5.2 Storage

Create `src/composables/__tests__/useLocalStorage.spec.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick } from 'vue'

import { useLocalStorage } from '@/composables/useLocalStorage'

const KEY = 'test:items'

/**
 * `useLocalStorage` registers a watcher and a cleanup callback, which need an active effect scope.
 * In a component that is the component; in a test we create one ourselves and stop it afterwards.
 */
function setup<T>(initialValue: T, options?: { version?: number }) {
  const scope = effectScope()
  const state = scope.run(() => useLocalStorage(KEY, initialValue, options))!
  return { state, scope }
}

/** What another browser tab would do: write to storage and fire a `storage` event here. */
function simulateOtherTab(value: unknown, version = 1): void {
  const raw = JSON.stringify({ version, data: value })
  localStorage.setItem(KEY, raw)
  window.dispatchEvent(
    new StorageEvent('storage', { key: KEY, newValue: raw, storageArea: localStorage }),
  )
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useLocalStorage', () => {
  it('starts with the initial value when nothing is stored', () => {
    const { state } = setup(['a'])
    expect(state.value).toEqual(['a'])
  })

  it('restores a previously stored value', () => {
    localStorage.setItem(KEY, JSON.stringify({ version: 1, data: ['saved'] }))
    const { state } = setup(['initial'])
    expect(state.value).toEqual(['saved'])
  })

  it('ignores data stored with a different version', () => {
    localStorage.setItem(KEY, JSON.stringify({ version: 1, data: ['old shape'] }))
    const { state } = setup(['initial'], { version: 2 })
    expect(state.value).toEqual(['initial'])
  })

  it('ignores malformed JSON instead of crashing', () => {
    localStorage.setItem(KEY, '{not json')
    const { state } = setup(['initial'])
    expect(state.value).toEqual(['initial'])
  })

  it('saves replacements and deep changes', async () => {
    const { state } = setup([{ hp: 10 }])

    state.value = [{ hp: 5 }]
    await nextTick() // watchers run asynchronously, batched before the next render
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ version: 1, data: [{ hp: 5 }] })

    state.value[0]!.hp = 1
    await nextTick()
    expect(JSON.parse(localStorage.getItem(KEY)!).data).toEqual([{ hp: 1 }])
  })

  it('picks up changes made in another tab', () => {
    const { state } = setup(['mine'])
    simulateOtherTab(['theirs'])
    expect(state.value).toEqual(['theirs'])
  })

  it('stops listening when its scope is stopped', () => {
    const { state, scope } = setup(['mine'])
    scope.stop()
    simulateOtherTab(['theirs'])
    expect(state.value).toEqual(['mine'])
  })

  it('keeps working when storage refuses to save', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError')
    })
    const { state } = setup(['a'])

    state.value = ['b']
    await nextTick()

    expect(state.value).toEqual(['b'])
  })
})
```

**An effect scope as a stand-in for a component.** `useLocalStorage` creates a watcher and registers
cleanup with `onScopeDispose`, both of which need an active effect scope. `effectScope().run(…)` provides
one without mounting anything, and `scope.stop()` simulates the owner going away.

**Simulating another tab.** `new StorageEvent('storage', { … })` dispatched on `window` is exactly what
the browser does when another tab writes to `localStorage`.

**Mocks.** `vi.spyOn(Storage.prototype, 'setItem').mockImplementation(…)` replaces `setItem` with a
function that throws, as a full storage quota would. `vi.restoreAllMocks()` in `afterEach` puts the
original back, so the next test is unaffected.

**Isolation.** `localStorage.clear()` before each test. Tests that share state pass or fail depending on
the order they run in, which is the most frustrating kind of flaky test.

### 5.3 The clock

Create `src/composables/__tests__/useShiftClock.spec.ts`:

```ts
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'

import { minutesUntilShiftChange, shiftAt, useShiftClock } from '@/composables/useShiftClock'

/** Local time on 19 November 2026. The clock works in the user's time zone, and so does this. */
function at(hours: number, minutes = 0, seconds = 0): Date {
  return new Date(2026, 10, 19, hours, minutes, seconds)
}

describe('shiftAt', () => {
  it.each([
    [at(5, 59), 'midnight'],
    [at(6, 0), 'dawn'],
    [at(13, 59), 'dawn'],
    [at(14, 0), 'dusk'],
    [at(21, 59), 'dusk'],
    [at(22, 0), 'midnight'],
    [at(0, 0), 'midnight'],
  ])('at %s the %s shift is on duty', (date, shift) => {
    expect(shiftAt(date)).toBe(shift)
  })
})

describe('minutesUntilShiftChange', () => {
  it('counts to the next shift on the same day', () => {
    expect(minutesUntilShiftChange(at(13, 30))).toBe(30)
  })

  it('counts across midnight', () => {
    expect(minutesUntilShiftChange(at(23, 0))).toBe(7 * 60)
  })

  it('rounds partial minutes up', () => {
    expect(minutesUntilShiftChange(at(5, 59, 30))).toBe(1)
  })
})

describe('useShiftClock', () => {
  // Fake timers replace setInterval and Date, so a test can move time forward instantly.
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(at(13, 59, 30))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // The composable uses lifecycle hooks, so it needs a component around it.
  const ClockProbe = defineComponent({
    setup() {
      const clock = useShiftClock(1000)
      return () => h('p', clock.currentShift.value)
    },
  })

  it('moves to the next shift as time passes', async () => {
    const wrapper = mount(ClockProbe)
    expect(wrapper.text()).toBe('dawn')

    await vi.advanceTimersByTimeAsync(30_000)

    expect(wrapper.text()).toBe('dusk')
  })

  it('starts its timer on mount and stops it on unmount', () => {
    expect(vi.getTimerCount()).toBe(0)

    const wrapper = mount(ClockProbe)
    expect(vi.getTimerCount()).toBe(1)

    wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
```

**Pure helpers first.** `shiftAt` and `minutesUntilShiftChange` take a `Date` and are tested with fixed
dates, including the boundaries at 06:00, 14:00 and 22:00. The `at()` helper uses the local-time `Date`
constructor, because the clock works in the user's time zone; the tests pass in any time zone.

**Fake timers.** `vi.useFakeTimers()` replaces `setInterval`, `setTimeout` and `Date` with controllable
versions. `vi.setSystemTime(…)` sets "now", and `vi.advanceTimersByTimeAsync(30_000)` moves time forward
by 30 seconds instantly, running every timer that would have fired.

**A probe component.** `useShiftClock` uses `onMounted` and `onUnmounted`, so it needs a real component
around it. `defineComponent` with a render function (`h('p', …)`) is the smallest possible one: it
exists only to call the composable and show its result.

**Testing cleanup.** `vi.getTimerCount()` counts active fake timers: zero before mounting, one while
mounted, zero again after `wrapper.unmount()`. This is the test that would catch the leaked timer from
chapter 6's "Try it yourself".

## 6. Stores

### 6.1 The dungeon store

Create `src/stores/__tests__/dungeon.spec.ts`:

```ts
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { makeMinionDraft } from '@/__tests__/factories'
import { REST_STRESS_RELIEF, useDungeonStore } from '@/stores/dungeon'

// Seed minions used below:
// m-001 Grizzle   goblin,  threat 2, union,     stress 35, posted to Torture Chamber 3 (dawn)
// m-007 Snikkit   goblin,  threat 1, non-union, stress 81, unassigned
// m-009 Urzula    orc,     threat 3, non-union, posted to the Gatehouse (dusk)
// m-011 Hrothgar  minotaur, threat 4, posted to the Gatehouse (midnight), next to m-004

beforeEach(() => {
  // A fresh Pinia and empty storage for every test, so no test sees another test's changes.
  localStorage.clear()
  setActivePinia(createPinia())
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('dungeon store', () => {
  it('starts from the seed data', () => {
    const dungeon = useDungeonStore()
    expect(dungeon.minions).toHaveLength(12)
    expect(dungeon.assignments).toHaveLength(11)
    expect(dungeon.unassignedMinions.map((minion) => minion.id)).toEqual(['m-007'])
  })

  it('recruits a minion at full health and without stress', () => {
    const dungeon = useDungeonStore()
    dungeon.recruitMinion(makeMinionDraft({ name: 'Nibbles', maxHp: 30 }))

    expect(dungeon.minions[0]).toMatchObject({ name: 'Nibbles', hp: 30, maxHp: 30, stress: 0 })
    expect(dungeon.minions).toHaveLength(13)
  })

  describe('resting', () => {
    it(`removes ${REST_STRESS_RELIEF} stress`, () => {
      const dungeon = useDungeonStore()
      dungeon.restMinion('m-007')
      expect(dungeon.getMinion('m-007')?.stress).toBe(81 - REST_STRESS_RELIEF)
    })

    it('never goes below zero', () => {
      const dungeon = useDungeonStore()
      dungeon.relieveStress('m-001', 1000)
      expect(dungeon.getMinion('m-001')?.stress).toBe(0)
    })

    it('is not possible while knocked out', () => {
      const dungeon = useDungeonStore()
      dungeon.getMinion('m-007')!.hp = 0
      dungeon.restMinion('m-007')
      expect(dungeon.getMinion('m-007')?.stress).toBe(81)
    })
  })

  describe('firing', () => {
    it('refuses to fire union members', () => {
      const dungeon = useDungeonStore()
      const result = dungeon.fireMinion('m-001')
      expect(result).toEqual({
        ok: false,
        reason: 'Grizzle Snaggletooth is a union member. Firing needs a hearing.',
      })
      expect(dungeon.getMinion('m-001')).toBeDefined()
    })

    it('removes the minion and their assignment', () => {
      const dungeon = useDungeonStore()
      expect(dungeon.fireMinion('m-009')).toEqual({ ok: true })
      expect(dungeon.getMinion('m-009')).toBeUndefined()
      expect(dungeon.getAssignment('m-009')).toBeUndefined()
    })
  })

  describe('assignments', () => {
    it('refuses minions below the sector minimum threat level', () => {
      const dungeon = useDungeonStore()
      const result = dungeon.assignMinion('m-007', 's-treasury', 'dawn')
      expect(result.ok).toBe(false)
      expect(dungeon.getAssignment('m-007')).toBeUndefined()
    })

    it('moves a minion who already has a post', () => {
      const dungeon = useDungeonStore()
      dungeon.assignMinion('m-011', 's-treasury', 'dusk')

      expect(dungeon.getAssignment('m-011')).toEqual({
        minionId: 'm-011',
        sectorId: 's-treasury',
        shift: 'dusk',
      })
      expect(dungeon.assignments.filter((a) => a.minionId === 'm-011')).toHaveLength(1)
      expect(dungeon.getCrew('s-gatehouse', 'midnight').map((m) => m.id)).toEqual(['m-004'])
    })

    it('clears the related alerts', () => {
      const dungeon = useDungeonStore()
      const before = dungeon.alerts.length

      dungeon.unassignMinion('m-011') // the second minotaur leaves the gatehouse

      // Both the minotaur clash and the gatehouse's budget overrun disappear.
      expect(dungeon.alerts).toHaveLength(before - 2)
    })
  })

  describe('raids', () => {
    it('spares knocked-out minions', () => {
      // Make the raid predictable: Math.random() is always just below 1, so every hit is maximal.
      vi.spyOn(Math, 'random').mockReturnValue(0.999)
      const dungeon = useDungeonStore()
      const snikkit = dungeon.getMinion('m-007')!
      snikkit.hp = 0

      dungeon.simulateRaid()

      expect(snikkit.stress).toBe(81)
      expect(dungeon.getMinion('m-001')!.stress).toBeGreaterThan(35)
    })

    it('can be undone by the healer, except for the stress', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.999)
      const dungeon = useDungeonStore()
      dungeon.simulateRaid()
      dungeon.callHealer()

      expect(dungeon.woundedCount).toBe(0)
      expect(dungeon.getMinion('m-001')!.stress).toBeGreaterThan(35)
    })
  })

  describe('persistence', () => {
    it('survives a restart of the app', async () => {
      const dungeon = useDungeonStore()
      dungeon.recruitMinion(makeMinionDraft({ name: 'Persistent Pete' }))
      await nextTick() // let useLocalStorage's watcher save

      // A new Pinia is what a page reload gives you: brand-new stores.
      setActivePinia(createPinia())
      const reloaded = useDungeonStore()

      expect(reloaded.minions[0]?.name).toBe('Persistent Pete')
    })

    it('can be reset to the seed data', async () => {
      const dungeon = useDungeonStore()
      dungeon.fireMinion('m-009')
      dungeon.resetToSeed()
      await nextTick()

      expect(dungeon.getMinion('m-009')).toBeDefined()
      expect(dungeon.assignments).toHaveLength(11)
    })
  })
})
```

**A fresh Pinia per test.** `setActivePinia(createPinia())` makes a new, empty Pinia the active one.
The next `useDungeonStore()` call creates a brand-new store from the seed data. Combined with
`localStorage.clear()`, every test starts from the same known state.

**Making randomness predictable.** Raids roll dice with `Math.random()`. `vi.spyOn(Math, 'random')
.mockReturnValue(0.999)` makes every roll the highest possible, so the test knows that the raid hurts.

**Simulating a reload.** The persistence test changes the store, waits for `useLocalStorage`'s watcher to
save, then creates a new Pinia and a new store, which is exactly what a page reload does. The recruit is
still there because the new store read it back from storage.

**A comment with the cast.** The top of the file lists the seed minions the tests use and their relevant
values. Tests that depend on seed data are easier to read when the data is in view.

### 6.2 The requests store

Create `src/stores/__tests__/requests.spec.ts`:

```ts
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useDungeonStore } from '@/stores/dungeon'
import { useRequestsStore } from '@/stores/requests'

// Seed requests: r-001 vacation for m-003 (pending), r-002 full-moon leave for m-006 (approved),
// r-003 shift swap for m-012 (pending).

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
})

describe('requests store', () => {
  it('counts pending requests', () => {
    expect(useRequestsStore().pendingCount).toBe(2)
  })

  it('files new requests as pending, newest first', () => {
    const requests = useRequestsStore()
    requests.submitRequest({
      type: 'full-moon-leave',
      minionId: 'm-012',
      note: '',
      fullMoonDate: '2026-11-24',
    })

    expect(requests.requests[0]).toMatchObject({ type: 'full-moon-leave', status: 'pending' })
    expect(requests.requests[0]?.id).toMatch(/^r-/)
    expect(requests.pendingCount).toBe(3)
  })

  it('clears all stress when a vacation is approved', () => {
    const dungeon = useDungeonStore()
    const requests = useRequestsStore()
    expect(dungeon.getMinion('m-003')?.stress).toBe(55)

    requests.approveRequest('r-001')

    expect(requests.requests.find((r) => r.id === 'r-001')?.status).toBe('approved')
    expect(dungeon.getMinion('m-003')?.stress).toBe(0)
  })

  it('takes 40 stress off for approved full-moon leave', () => {
    const dungeon = useDungeonStore()
    const requests = useRequestsStore()
    requests.submitRequest({
      type: 'full-moon-leave',
      minionId: 'm-012',
      note: '',
      fullMoonDate: '2026-11-24',
    })

    requests.approveRequest(requests.requests[0]!.id)

    expect(dungeon.getMinion('m-012')?.stress).toBe(58 - 40)
  })

  it('does not change stress for an approved shift swap', () => {
    const dungeon = useDungeonStore()
    useRequestsStore().approveRequest('r-003')
    expect(dungeon.getMinion('m-012')?.stress).toBe(58)
  })

  it('rejects requests without touching stress', () => {
    const dungeon = useDungeonStore()
    const requests = useRequestsStore()
    requests.rejectRequest('r-001')

    expect(requests.requests.find((r) => r.id === 'r-001')?.status).toBe('rejected')
    expect(dungeon.getMinion('m-003')?.stress).toBe(55)
  })

  it('only decides pending requests', () => {
    const requests = useRequestsStore()
    requests.rejectRequest('r-002') // already approved
    expect(requests.requests.find((r) => r.id === 'r-002')?.status).toBe('approved')
  })
})
```

These tests check the cross-store rule from chapter 5: approving a vacation clears the applicant's
stress in the _dungeon_ store. Both stores share the active Pinia, so `useDungeonStore()` in the test and
inside the requests store return the same instance.

## 7. Components

Component tests mount a component in jsdom, interact with it like a user, and check what it renders and
emits. They should not reach into the component's internals: a test that reads
`wrapper.vm.isConfirmingFire` breaks when the variable is renamed, even though nothing a user can see
changed.

### 7.1 `MinionCard`

Create `src/components/minions/__tests__/MinionCard.spec.ts`:

```ts
import { mount, RouterLinkStub } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { makeMinion } from '@/__tests__/factories'
import MinionCard from '@/components/minions/MinionCard.vue'
import type { Minion } from '@/types/dungeon'

function mountCard(overrides: Partial<Minion> = {}) {
  const minion = makeMinion({ name: 'Snikkit Two-Knives', hp: 10, maxHp: 20, ...overrides })
  const wrapper = mount(MinionCard, {
    props: { minion },
    // The card links to the profile page. A stub renders the link without needing a real router,
    // and remembers the `to` prop so we can check it.
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
  return { wrapper, minion }
}

/** Finds a button by its visible text, the way a user would. */
function button(wrapper: ReturnType<typeof mountCard>['wrapper'], text: string) {
  const match = wrapper.findAll('button').find((candidate) => candidate.text() === text)
  if (!match) throw new Error(`No button with text "${text}"`)
  return match
}

describe('MinionCard', () => {
  it('shows the minion and links to the profile', () => {
    const { wrapper, minion } = mountCard({ salary: 1500 })

    expect(wrapper.text()).toContain('Snikkit Two-Knives')
    expect(wrapper.text()).toContain('1,500 gp / month')
    expect(wrapper.findComponent(RouterLinkStub).props('to')).toEqual({
      name: 'minion',
      params: { id: minion.id },
    })
  })

  it('marks union members and knocked-out minions', () => {
    const { wrapper } = mountCard({ isUnionized: true, hp: 0 })
    expect(wrapper.text()).toContain('Union')
    expect(wrapper.text()).toContain('Knocked out')
  })

  it('asks its parent to heal the minion', async () => {
    const { wrapper, minion } = mountCard()
    await button(wrapper, 'Heal').trigger('click')
    // The card does not heal anyone itself. It only reports the request.
    expect(wrapper.emitted('heal')).toEqual([[minion.id]])
  })

  it('disables actions that make no sense', () => {
    expect(button(mountCard({ hp: 20 }).wrapper, 'Heal').attributes('disabled')).toBeDefined()
    expect(
      button(mountCard({ hp: 0, stress: 50 }).wrapper, 'Send to rest').attributes('disabled'),
    ).toBeDefined()
    expect(
      button(mountCard({ stress: 0 }).wrapper, 'Send to rest').attributes('disabled'),
    ).toBeDefined()
  })

  it('asks for confirmation before firing', async () => {
    const { wrapper, minion } = mountCard()

    await button(wrapper, 'Fire').trigger('click')
    expect(wrapper.emitted('fire')).toBeUndefined()
    expect(wrapper.text()).toContain('Fire Snikkit Two-Knives?')

    await button(wrapper, 'Yes, fire').trigger('click')
    expect(wrapper.emitted('fire')).toEqual([[minion.id]])
  })

  it('can cancel firing', async () => {
    const { wrapper } = mountCard()
    await button(wrapper, 'Fire').trigger('click')
    await button(wrapper, 'Cancel').trigger('click')

    expect(wrapper.emitted('fire')).toBeUndefined()
    expect(wrapper.text()).toContain('Heal')
  })

  it('offers no way to fire union members', () => {
    const { wrapper } = mountCard({ isUnionized: true })
    expect(wrapper.findAll('button').map((b) => b.text())).not.toContain('Fire')
    expect(wrapper.text()).toContain('Firing needs a union hearing')
  })
})
```

- **`mount(Component, { props })`** renders the component and returns a wrapper with methods to query and
  interact with it.
- **`RouterLinkStub`** replaces `RouterLink`. The card links to the profile page, but a test of the card
  should not need a router. The stub renders a plain link and records its `to` prop, so the test can
  still check where it points.
- **`trigger('click')`** dispatches a DOM event and returns a promise that resolves after Vue has
  re-rendered. Always `await` it.
- **`wrapper.emitted('heal')`** returns every emitted `heal` event with its arguments: `[[minion.id]]`
  means "emitted once, with one argument". This is how you test _events up_: the card does not heal
  anyone, it asks, and the test checks that it asked correctly.
- **Finding by text.** The `button(wrapper, 'Heal')` helper finds buttons by their visible label, the
  way a user would, rather than by CSS classes that may change with the design.

### 7.2 `MinionForm`

Create `src/components/minions/__tests__/MinionForm.spec.ts`:

```ts
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import MinionForm from '@/components/minions/MinionForm.vue'

function mountForm(existingNames: string[] = []) {
  // `attachTo` puts the component into the real document, which focus behavior needs.
  return mount(MinionForm, { props: { existingNames }, attachTo: document.body })
}

describe('MinionForm', () => {
  it('focuses the name field when it opens', () => {
    const wrapper = mountForm()
    expect(document.activeElement).toBe(wrapper.find('input[type="text"]').element)
    wrapper.unmount()
  })

  it('shows errors only after the first submit, and emits nothing while invalid', async () => {
    const wrapper = mountForm()
    expect(wrapper.text()).not.toContain('Every minion needs a name.')

    await wrapper.find('form').trigger('submit')

    expect(wrapper.text()).toContain('Every minion needs a name.')
    expect(wrapper.find('input[type="text"]').attributes('aria-invalid')).toBe('true')
    expect(wrapper.emitted('submit')).toBeUndefined()
    wrapper.unmount()
  })

  it('updates errors live once they are visible', async () => {
    const wrapper = mountForm()
    await wrapper.find('form').trigger('submit')

    await wrapper.find('input[type="text"]').setValue('Nibbles')

    expect(wrapper.text()).not.toContain('Every minion needs a name.')
    wrapper.unmount()
  })

  it('rejects names that are already taken', async () => {
    const wrapper = mountForm(['Grizzle Snaggletooth'])
    await wrapper.find('input[type="text"]').setValue('grizzle snaggletooth')
    await wrapper.find('form').trigger('submit')

    expect(wrapper.text()).toContain('A minion with this name already works here.')
    wrapper.unmount()
  })

  it('pre-fills HP and salary from the chosen species', async () => {
    const wrapper = mountForm()
    await wrapper.find('select').setValue('beholder')

    const [maxHp, salary] = wrapper.findAll('input[type="number"]')
    expect((maxHp!.element as HTMLInputElement).value).toBe('190')
    expect((salary!.element as HTMLInputElement).value).toBe('1400')
    wrapper.unmount()
  })

  it('emits a tidy draft and resets itself', async () => {
    const wrapper = mountForm()
    await wrapper.find('input[type="text"]').setValue('  Nibbles  ')
    await wrapper.find('input[type="checkbox"]').setValue(true)
    await wrapper.find('form').trigger('submit')

    expect(wrapper.emitted('submit')).toEqual([
      [
        {
          name: 'Nibbles',
          species: 'goblin',
          maxHp: 22,
          threatLevel: 1,
          salary: 100,
          isUnionized: true,
          // No `bio`: an empty bio is left out rather than stored as ''.
        },
      ],
    ])
    expect((wrapper.find('input[type="text"]').element as HTMLInputElement).value).toBe('')
    wrapper.unmount()
  })

  it('lets the parent decide what cancel means', async () => {
    const wrapper = mountForm()
    const cancel = wrapper.findAll('button').find((button) => button.text() === 'Cancel')!
    await cancel.trigger('click')

    expect(wrapper.emitted('cancel')).toHaveLength(1)
    wrapper.unmount()
  })
})
```

- **`setValue('Nibbles')`** sets an input's value and fires the events `v-model` listens to. On a
  checkbox, `setValue(true)` checks it; on a select, it picks the option.
- **`trigger('submit')`** on the form runs the same `@submit.prevent` handler as clicking the submit
  button.
- **`attachTo: document.body`** mounts the component into the real document. Focus only works for
  elements that are in the document, so the autofocus test needs it. Components mounted this way must be
  unmounted at the end of each test, or they pile up in `document.body`.
- **Checking what is emitted, exactly.** `toEqual` on the emitted draft verifies the trimming, the
  checkbox, the species defaults, and that an empty `bio` is left out entirely.

### 7.3 `LeaveRequestForm`

Create `src/components/requests/__tests__/LeaveRequestForm.spec.ts`:

```ts
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import LeaveRequestForm from '@/components/requests/LeaveRequestForm.vue'
import { seedMinions } from '@/data/seedMinions'

// The form reads today's date when it is created. Faking only `Date` pins "today" to
// 19 November 2026 without touching timers or Vue's internals.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 19, 12, 0))
})

afterEach(() => {
  vi.useRealTimers()
})

function mountForm(preselectedMinionId?: string) {
  return mount(LeaveRequestForm, { props: { minions: seedMinions, preselectedMinionId } })
}

function errors(wrapper: ReturnType<typeof mountForm>): string[] {
  return wrapper.findAll('p.text-blood-300').map((p) => p.text())
}

describe('LeaveRequestForm', () => {
  it('pre-selects the applicant from the prop', () => {
    const wrapper = mountForm('m-006')
    expect((wrapper.find('select').element as HTMLSelectElement).value).toBe('m-006')
  })

  it('follows the prop when it changes while the form stays open', async () => {
    const wrapper = mountForm('m-006')
    await wrapper.setProps({ preselectedMinionId: 'm-012' })
    expect((wrapper.find('select').element as HTMLSelectElement).value).toBe('m-012')
  })

  it('shows only the fields of the selected request type', async () => {
    const wrapper = mountForm()
    expect(wrapper.findAll('input[type="date"]')).toHaveLength(2) // vacation: first and last day

    await wrapper.find('input[value="full-moon-leave"]').setValue(true)

    expect(wrapper.findAll('input[type="date"]')).toHaveLength(1)
    expect(wrapper.text()).toContain('The next full moon is on 24 Nov 2026.')
  })

  it('refuses full-moon leave for non-werewolves', async () => {
    const wrapper = mountForm('m-001') // Grizzle, a goblin
    await wrapper.find('input[value="full-moon-leave"]').setValue(true)
    await wrapper.find('input[type="date"]').setValue('2026-11-24')
    await wrapper.find('form').trigger('submit')

    expect(errors(wrapper)).toContain('Only werewolves can request full-moon leave.')
    expect(wrapper.emitted('submit')).toBeUndefined()
  })

  it('emits a draft with exactly the fields of its type', async () => {
    const wrapper = mountForm('m-006') // Fenric, a werewolf
    await wrapper.find('input[value="full-moon-leave"]').setValue(true)
    const useNextFullMoon = wrapper.findAll('button').find((b) => b.text().startsWith('Use'))!
    await useNextFullMoon.trigger('click')
    await wrapper.find('textarea').setValue('  Family tradition.  ')
    await wrapper.find('form').trigger('submit')

    expect(wrapper.emitted('submit')).toEqual([
      [
        {
          type: 'full-moon-leave',
          minionId: 'm-006',
          note: 'Family tradition.',
          fullMoonDate: '2026-11-24',
        },
      ],
    ])
  })
})
```

**Faking only the date.** The form computes `today` and the next full moon when it is created.
`vi.useFakeTimers({ toFake: ['Date'] })` replaces only `Date`, so "today" is 19 November 2026, while real
timers keep working for Vue and the test runner.

**`setProps`** changes a prop on a mounted component, which is how the router passes a new query to a
reused view. The second test is the regression test for the `watch` added in chapter 6.

### 7.4 `MinionDetailView`

Create `src/views/__tests__/MinionDetailView.spec.ts`:

```ts
import { mount, RouterLinkStub } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useDungeonStore } from '@/stores/dungeon'
import MinionDetailView from '@/views/MinionDetailView.vue'

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
})

function mountView(id: string) {
  // The view reads the active Pinia set up in beforeEach. Only the router links are stubbed.
  return mount(MinionDetailView, {
    props: { id },
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
}

describe('MinionDetailView', () => {
  it('shows the minion from the store, including their post', () => {
    const wrapper = mountView('m-001')

    expect(wrapper.find('h1').text()).toBe('Grizzle Snaggletooth')
    expect(wrapper.text()).toContain('Torture Chamber 3, dawn shift')
  })

  it('shows live data, not the seed data', async () => {
    const dungeon = useDungeonStore()
    const wrapper = mountView('m-001')

    dungeon.getMinion('m-001')!.hp = 0
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Knocked out')
  })

  // Regression test for chapter 4's lesson: going from one profile to the next only changes the
  // `id` prop. The router reuses the component, so everything must be derived from `id`.
  it('follows a changing id without being re-created', async () => {
    const wrapper = mountView('m-001')
    await wrapper.setProps({ id: 'm-002' })

    expect(wrapper.find('h1').text()).toBe('Rattlebones McGee')
  })

  it('explains when there is no such minion', () => {
    const wrapper = mountView('m-999')
    expect(wrapper.find('h1').text()).toBe('No such minion')
    expect(wrapper.text()).toContain('m-999')
  })
})
```

**A real store.** The view uses `useDungeonStore()`, which finds the Pinia activated in `beforeEach`.
The test then changes the store directly, the way another page would, and checks that the view follows.

**The lesson from chapter 4, as a test.** _"follows a changing id without being re-created"_ calls
`setProps({ id: 'm-002' })` on a mounted view, exactly what the router does when you click "next
minion". If anyone ever replaces the `computed` with a one-time lookup, this test fails.

## 8. Polish

### 8.1 Focus management after navigation

The [routing guide](../concepts/06-client-side-routing.md#9-accessibility-in-a-single-page-app) listed
one thing a full page load does that DungeonHR did not: move focus to the new page. Without it, a screen
reader user who activates "Sectors" hears nothing change, because focus stays on the link they clicked.

Replace `src/router/index.ts`:

```ts
import { nextTick } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'

import RosterView from '@/views/RosterView.vue'

// Teach TypeScript which fields our routes put into `meta`. This merges into the router's own
// `RouteMeta` interface ("module augmentation"), so `route.meta.section` is typed everywhere.
declare module 'vue-router' {
  interface RouteMeta {
    /** Shown in the browser tab, followed by "· DungeonHR". */
    title?: string
    /** Which entry of the main navigation to highlight. */
    section?: 'roster' | 'sectors' | 'requests'
  }
}

const router = createRouter({
  // HTML5 history mode: real URLs like /minion/m-001 instead of /#/minion/m-001.
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: { name: 'roster' },
    },
    {
      path: '/roster',
      name: 'roster',
      // The landing page is imported normally, so it is part of the main bundle.
      component: RosterView,
      meta: { title: 'Minion Roster', section: 'roster' },
    },
    {
      path: '/minion/:id',
      name: 'minion',
      // All other pages are loaded on demand: Vite puts each into its own file.
      component: () => import('@/views/MinionDetailView.vue'),
      // Pass the `:id` route parameter to the view as a prop.
      props: true,
      meta: { title: 'Minion Profile', section: 'roster' },
    },
    {
      path: '/sectors',
      name: 'sectors',
      component: () => import('@/views/SectorPlannerView.vue'),
      meta: { title: 'Sector Planner', section: 'sectors' },
    },
    {
      path: '/requests',
      name: 'requests',
      component: () => import('@/views/RequestsView.vue'),
      // Map `?minion=m-006` to a typed prop. Query values can be strings, arrays or null.
      props: (route) => ({
        preselectedMinionId:
          typeof route.query.minion === 'string' ? route.query.minion : undefined,
      }),
      meta: { title: 'Leave Requests', section: 'requests' },
    },
    {
      // Matches everything the routes above did not. Must stay last.
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/views/NotFoundView.vue'),
      meta: { title: 'Page Not Found' },
    },
  ],
  scrollBehavior(_to, _from, savedPosition) {
    // Back and forward restore the previous scroll position; every other navigation starts at the top.
    return savedPosition ?? { top: 0 }
  },
})

router.afterEach((to, from) => {
  document.title = to.meta.title ? `${to.meta.title} · DungeonHR` : 'DungeonHR'

  // Accessibility: a full page load starts reading at the top of the new page. In a single-page app,
  // focus would stay on the link that was clicked, so screen reader users would not notice that the
  // page changed. Move focus to the main content instead, once the new page has rendered.
  // Skipped on the first load (nothing to move from) and when only the query string changes.
  if (from.matched.length === 0 || to.path === from.path) return
  void nextTick(() => document.getElementById('main')?.focus({ preventScroll: true }))
})

export default router
```

After each navigation to a different path, the `afterEach` hook waits for the new page to render
(`nextTick`) and moves focus to `<main>`. It skips the first page load, where there is nothing to move
from, and query-only changes, where the user is still on the same page and might be in the middle of a
form. `preventScroll: true` leaves scrolling to `scrollBehavior`.

`<main>` must be focusable for that. Replace `src/App.vue`:

```vue
<script setup lang="ts">
import AppFooter from '@/components/layout/AppFooter.vue'
import AppHeader from '@/components/layout/AppHeader.vue'
</script>

<template>
  <!-- Lets keyboard users jump past the navigation, which repeats on every page. -->
  <a
    href="#main"
    class="sr-only rounded-lg bg-ember-600 px-4 py-2 font-semibold text-crypt-950 focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
  >
    Skip to content
  </a>

  <AppHeader />

  <!-- tabindex="-1": focusable from code (see router/index.ts), but not a stop when tabbing. -->
  <main id="main" tabindex="-1" class="mx-auto max-w-6xl px-4 py-10 outline-none sm:px-6 lg:px-8">
    <!-- The component of the current route is rendered here. -->
    <RouterView />
  </main>

  <AppFooter />
</template>
```

`tabindex="-1"` makes an element focusable from code without adding it to the Tab order. `outline-none`
hides the focus ring on `<main>`, which is not an interactive element and would otherwise be outlined
after every navigation. (As a bonus, the skip link now moves focus reliably in every browser, not just
the scroll position.)

### 8.2 Continuous integration

Tests only protect you if they run. Create `.github/workflows/ci.yml`:

```yaml
# Runs the same checks as the tutorial's "quality checks" on every push and pull request.
name: CI

on:
  push:
    branches: [main, 'step-*']
  pull_request:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm

      - run: npm ci
      - run: npm run type-check
      - run: npx oxlint .
      - run: npx eslint .
      - run: npx prettier --check src/
      - run: npm test
      - run: npm run build-only
```

On every push to `main` or a step branch, and on every pull request, GitHub runs the same checks you
run locally. The linters run without `--fix`, so CI reports problems instead of silently fixing them on
a throwaway machine. `build-only` skips the second type-check that `npm run build` would do.

### 8.3 Documentation for others

The repository now has a complete [`README.md`](../../README.md) with the feature list, the architecture
and the chapter map, and a [`CONTRIBUTING.md`](../../CONTRIBUTING.md) that explains how to fix something
in an early chapter and carry the fix forward through the later branches. Read both; they summarize the
whole project from the outside.

## 9. Checkpoint

Run the suite:

```bash
npm test
```

```text
 Test Files  11 passed (11)
      Tests  112 passed (112)
```

Now break something on purpose. In `src/composables/useAggroCalculator.ts`, change
`BURNOUT_WARNING_STRESS` from `70` to `75` and run `npm test` again. Two tests fail: the 70-stress row
of the stress table, and the seed-data regression test (Asterion's 72 stress no longer counts). Each
failure shows the expected and the actual value. Change it back.

In the browser:

- Click through the navigation with a screen reader or just watch `document.activeElement` in the
  DevTools console: after every page change, it is `<main id="main">`.
- Everything from the previous chapters still works.

## 10. Run the quality checks

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

Commit your work:

```bash
git add -A
```

```bash
git commit -m "test: add the test suite, focus management and CI"
```

## 11. Where to go from here

DungeonHR is complete, but there is plenty of room to keep practicing:

- **End-to-end tests.** [Playwright](https://playwright.dev/) drives a real browser through real
  scenarios: recruit, assign, reload, check. They complement the unit tests rather than replace them.
- **Coverage.** `@vitest/coverage-v8` shows which lines the tests never execute. Use it to find
  untested rules, not to chase a percentage.
- **A real backend.** Replace the seed data with an API. Store actions become `async`, and loading and
  error states appear. [Pinia Colada](https://pinia-colada.esm.dev/) handles caching and refetching.
- **Server-side rendering.** [Nuxt](https://nuxt.com/) renders pages on the server. Notice how the
  decisions in this tutorial (timers in `onMounted`, stores instead of module state) already fit.
- **Internationalization.** Every user-facing string is in a template or a data file; extracting them
  with [vue-i18n](https://vue-i18n.intlify.dev/) is a good exercise in finding them all.
- **The "Try it yourself" sections.** Each chapter ends with exercises that extend the app: shift swaps
  that move assignments, off-duty stress recovery, a `useMediaQuery` composable, and more.

## Recap of the whole tutorial

| Chapter | What you learned |
| --- | --- |
| 1 | What an SFC is, Vite, Tailwind, and the anatomy of `<script setup>`, `<template>` and `<style scoped>` |
| 2 | Typed domain models, props, `ref`, `computed`, `v-for` with keys, and how reactivity tracks changes |
| 3 | Events with `defineEmits`, _props down, events up_, `v-model` and `defineModel`, forms and validation |
| 4 | Vue Router, views, route props, lazy loading, discriminated unions, and why component state dies on navigation |
| 5 | Pinia stores, getters, actions, cross-store rules, connected vs presentational components |
| 6 | Composables, persistence, effect scopes, lifecycle hooks, template refs and `watch` |
| 7 | Testing every layer, regression tests, accessibility polish and CI |

The Dark Lord will be back from sabbatical soon. The dungeon has never run better.

**Go deeper:** [Testing Vue applications](../concepts/09-testing-vue-applications.md)
