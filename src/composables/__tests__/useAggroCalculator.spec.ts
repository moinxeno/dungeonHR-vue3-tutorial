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
