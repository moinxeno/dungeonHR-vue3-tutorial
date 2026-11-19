import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue'

import { INCOMPATIBILITY_RULES } from '@/data/incompatibilityRules'
import {
  SHIFTS,
  type Assignment,
  type DungeonAlert,
  type DungeonSector,
  type Gold,
  type Minion,
  type Severity,
  type Species,
} from '@/types/dungeon'
import { formatGold } from '@/utils/gold'

/** Stress at which the burnout monitor warns, and at which it gets loud. */
export const BURNOUT_WARNING_STRESS = 70
export const BURNOUT_CRITICAL_STRESS = 90
/** A payroll above this share of the budget is critical rather than just a warning. */
export const BUDGET_CRITICAL_RATIO = 1.25

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, warning: 1, info: 2 }

/** The rule that forbids these two species from working together, if any. Order does not matter. */
function findIncompatibility(first: Species, second: Species) {
  return INCOMPATIBILITY_RULES.find(
    ({ between: [a, b] }) => (a === first && b === second) || (a === second && b === first),
  )
}

/**
 * Finds everything the Aggro & Burnout Monitor should warn about, most severe first.
 *
 * A plain function: data in, data out, no Vue involved. That makes the dungeon's rules easy to
 * test and reusable anywhere, with or without reactivity.
 */
export function calculateAlerts(
  minions: readonly Minion[],
  sectors: readonly DungeonSector[],
  assignments: readonly Assignment[],
): DungeonAlert[] {
  const minionsById = new Map(minions.map((minion) => [minion.id, minion]))
  const found: DungeonAlert[] = []

  for (const sector of sectors) {
    const posted = assignments.filter((assignment) => assignment.sectorId === sector.id)

    for (const shift of SHIFTS) {
      const crew = posted
        .filter((assignment) => assignment.shift === shift)
        .map((assignment) => minionsById.get(assignment.minionId))
        .filter((minion): minion is Minion => minion !== undefined)

      if (crew.length > sector.capacity) {
        found.push({
          kind: 'over-capacity',
          id: `over-capacity:${sector.id}:${shift}`,
          severity: 'warning',
          message: `${sector.name} has ${crew.length} minions on the ${shift} shift, but only ${sector.capacity} posts.`,
          sectorId: sector.id,
          shift,
          capacity: sector.capacity,
          assigned: crew.length,
        })
      }

      // Check every pair in the crew exactly once.
      crew.forEach((first, index) => {
        for (const second of crew.slice(index + 1)) {
          const rule = findIncompatibility(first.species, second.species)
          if (!rule) continue
          // Sort the IDs so the alert ID does not depend on who was assigned first.
          const pair =
            first.id < second.id
              ? ([first.id, second.id] as const)
              : ([second.id, first.id] as const)
          found.push({
            kind: 'incompatible-species',
            id: `incompatible:${sector.id}:${shift}:${pair[0]}:${pair[1]}`,
            severity: rule.severity,
            message: `${first.name} and ${second.name} share the ${shift} shift at ${sector.name}. ${rule.reason}`,
            sectorId: sector.id,
            shift,
            minionIds: pair,
          })
        }
      })
    }

    const payroll: Gold = posted.reduce(
      (sum, assignment) => sum + (minionsById.get(assignment.minionId)?.salary ?? 0),
      0,
    )
    if (payroll > sector.payrollBudget) {
      found.push({
        kind: 'over-budget',
        id: `over-budget:${sector.id}`,
        severity: payroll > sector.payrollBudget * BUDGET_CRITICAL_RATIO ? 'critical' : 'warning',
        message: `${sector.name} pays ${formatGold(payroll)} a month on a budget of ${formatGold(sector.payrollBudget)}.`,
        sectorId: sector.id,
        budget: sector.payrollBudget,
        payroll,
      })
    }
  }

  for (const minion of minions) {
    if (minion.stress < BURNOUT_WARNING_STRESS) continue
    found.push({
      kind: 'burnout-risk',
      id: `burnout:${minion.id}`,
      severity: minion.stress >= BURNOUT_CRITICAL_STRESS ? 'critical' : 'warning',
      message: `${minion.name} is at ${minion.stress} stress. Time for a rest.`,
      minionId: minion.id,
      stress: minion.stress,
    })
  }

  return found.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
}

/**
 * The reactive version of `calculateAlerts`: alerts that update whenever the inputs change.
 *
 * Each input may be a plain value, a ref, a computed or a getter function (`MaybeRefOrGetter`).
 * `toValue` reads whichever it is. Because it reads inside `computed`, refs and getters are tracked.
 */
export function useAggroCalculator(
  minions: MaybeRefOrGetter<readonly Minion[]>,
  sectors: MaybeRefOrGetter<readonly DungeonSector[]>,
  assignments: MaybeRefOrGetter<readonly Assignment[]>,
): { alerts: ComputedRef<DungeonAlert[]> } {
  const alerts = computed(() =>
    calculateAlerts(toValue(minions), toValue(sectors), toValue(assignments)),
  )
  return { alerts }
}
