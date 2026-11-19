import { acceptHMRUpdate, defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { INCOMPATIBILITY_RULES } from '@/data/incompatibilityRules'
import { seedAssignments } from '@/data/seedAssignments'
import { seedMinions } from '@/data/seedMinions'
import { seedSectors } from '@/data/seedSectors'
import {
  SHIFTS,
  type Assignment,
  type DungeonAlert,
  type DungeonSector,
  type Gold,
  type Minion,
  type MinionDraft,
  type MinionId,
  type SectorId,
  type Severity,
  type Shift,
  type Species,
} from '@/types/dungeon'
import { toIsoDate } from '@/utils/date'
import { formatGold } from '@/utils/gold'
import { createId } from '@/utils/id'

/** How much stress a rest removes. */
export const REST_STRESS_RELIEF = 25
/** Stress at which the burnout monitor warns, and at which it gets loud. */
export const BURNOUT_WARNING_STRESS = 70
export const BURNOUT_CRITICAL_STRESS = 90
/** A payroll above this share of the budget is critical rather than just a warning. */
const BUDGET_CRITICAL_RATIO = 1.25

/** The outcome of an action that the store may refuse, with a reason the UI can show. */
export type ActionResult = { ok: true } | { ok: false; reason: string }

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, warning: 1, info: 2 }

/** Key for one sector-and-shift slot, e.g. `"s-gatehouse:midnight"`. */
function slotKey(sectorId: SectorId, shift: Shift): string {
  return `${sectorId}:${shift}`
}

/** The rule that forbids these two species from working together, if any. Order does not matter. */
function findIncompatibility(first: Species, second: Species) {
  return INCOMPATIBILITY_RULES.find(
    ({ between: [a, b] }) => (a === first && b === second) || (a === second && b === first),
  )
}

/** Random integer between `min` and `max`, both inclusive. */
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/**
 * The dungeon's single source of truth: who works here, where, and what is going wrong.
 *
 * This is a "setup store". The function body works exactly like `<script setup>`: `ref` is state,
 * `computed` is a getter, a function is an action. Whatever the function returns is the store's
 * public API. The function runs once per app, the first time any component calls
 * `useDungeonStore()`, and the store lives on until the app is closed.
 */
export const useDungeonStore = defineStore('dungeon', () => {
  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  const minions = ref<Minion[]>(structuredClone(seedMinions))
  const sectors = ref<DungeonSector[]>(structuredClone(seedSectors))
  const assignments = ref<Assignment[]>(structuredClone(seedAssignments))

  // -------------------------------------------------------------------------
  // Getters
  // -------------------------------------------------------------------------

  // Lookup tables. They are not returned, so they are private to the store. Rebuilding them is
  // cheap, and `computed` only does it when the underlying arrays change.
  const minionsById = computed(() => new Map(minions.value.map((minion) => [minion.id, minion])))
  const sectorsById = computed(() => new Map(sectors.value.map((sector) => [sector.id, sector])))
  const assignmentsByMinion = computed(
    () => new Map(assignments.value.map((assignment) => [assignment.minionId, assignment])),
  )

  /** Who works where: one list of minions per sector-and-shift slot. */
  const crewsBySlot = computed(() => {
    const crews = new Map<string, Minion[]>()
    for (const assignment of assignments.value) {
      const minion = minionsById.value.get(assignment.minionId)
      if (!minion) continue
      const key = slotKey(assignment.sectorId, assignment.shift)
      crews.set(key, [...(crews.get(key) ?? []), minion])
    }
    return crews
  })

  const payrollBySector = computed(() => {
    const totals = new Map<SectorId, Gold>()
    for (const assignment of assignments.value) {
      const minion = minionsById.value.get(assignment.minionId)
      if (!minion) continue
      totals.set(assignment.sectorId, (totals.get(assignment.sectorId) ?? 0) + minion.salary)
    }
    return totals
  })

  const unassignedMinions = computed(() =>
    minions.value.filter((minion) => !assignmentsByMinion.value.has(minion.id)),
  )

  const totalPayroll = computed(() => minions.value.reduce((sum, minion) => sum + minion.salary, 0))
  const unionCount = computed(() => minions.value.filter((minion) => minion.isUnionized).length)
  const woundedCount = computed(
    () => minions.value.filter((minion) => minion.hp < minion.maxHp).length,
  )

  // Getters that take an argument are plain functions. They are not cached themselves, but they
  // read from the cached lookup tables above, so calling them is cheap.
  function getMinion(id: MinionId): Minion | undefined {
    return minionsById.value.get(id)
  }

  function getSector(id: SectorId): DungeonSector | undefined {
    return sectorsById.value.get(id)
  }

  function getAssignment(minionId: MinionId): Assignment | undefined {
    return assignmentsByMinion.value.get(minionId)
  }

  function getCrew(sectorId: SectorId, shift: Shift): readonly Minion[] {
    return crewsBySlot.value.get(slotKey(sectorId, shift)) ?? []
  }

  function getSectorPayroll(sectorId: SectorId): Gold {
    return payrollBySector.value.get(sectorId) ?? 0
  }

  /** Everything the Aggro & Burnout Monitor warns about, most severe first. */
  const alerts = computed<DungeonAlert[]>(() => {
    const found: DungeonAlert[] = []

    for (const sector of sectors.value) {
      for (const shift of SHIFTS) {
        const crew = getCrew(sector.id, shift)

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

      const payroll = getSectorPayroll(sector.id)
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

    for (const minion of minions.value) {
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
  })

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  function recruitMinion(draft: MinionDraft): void {
    minions.value.unshift({
      ...draft,
      id: createId('m'),
      hp: draft.maxHp,
      stress: 0,
      hiredOn: toIsoDate(new Date()),
    })
  }

  function healMinion(id: MinionId): void {
    const minion = getMinion(id)
    if (minion) minion.hp = minion.maxHp
  }

  /** Lowers a minion's stress by `amount`, but never below zero. */
  function relieveStress(id: MinionId, amount: number): void {
    const minion = getMinion(id)
    if (minion) minion.stress = Math.max(0, minion.stress - amount)
  }

  function restMinion(id: MinionId): void {
    const minion = getMinion(id)
    // Knocked-out minions cannot rest; they need the healer first.
    if (!minion || minion.hp === 0) return
    relieveStress(id, REST_STRESS_RELIEF)
  }

  function fireMinion(id: MinionId): ActionResult {
    const minion = getMinion(id)
    if (!minion) return { ok: false, reason: 'HR has no file for this minion.' }
    if (minion.isUnionized) {
      return { ok: false, reason: `${minion.name} is a union member. Firing needs a hearing.` }
    }
    minions.value = minions.value.filter((other) => other.id !== id)
    // A fired minion also leaves their post.
    assignments.value = assignments.value.filter((assignment) => assignment.minionId !== id)
    return { ok: true }
  }

  /** Posts a minion to a sector and shift. A minion who already has a post is moved. */
  function assignMinion(minionId: MinionId, sectorId: SectorId, shift: Shift): ActionResult {
    const minion = getMinion(minionId)
    const sector = getSector(sectorId)
    if (!minion || !sector) return { ok: false, reason: 'Unknown minion or sector.' }

    // The minimum threat level is a hard rule. Capacity and budget are soft: they raise alerts.
    if (minion.threatLevel < sector.minThreatLevel) {
      return {
        ok: false,
        reason: `${minion.name} (threat level ${minion.threatLevel}) is not scary enough for ${sector.name}, which needs level ${sector.minThreatLevel}.`,
      }
    }

    assignments.value = [
      ...assignments.value.filter((assignment) => assignment.minionId !== minionId),
      { minionId, sectorId, shift },
    ]
    return { ok: true }
  }

  function unassignMinion(minionId: MinionId): void {
    assignments.value = assignments.value.filter((assignment) => assignment.minionId !== minionId)
  }

  /** Adventurers storm the dungeon: everyone still standing takes damage and gets more stressed. */
  function simulateRaid(): void {
    for (const minion of minions.value) {
      // Knocked-out minions are out of the fight: no further damage, no further stress.
      if (minion.hp === 0) continue

      const damage = randomInt(0, Math.ceil(minion.maxHp * 0.4))
      minion.hp = Math.max(0, minion.hp - damage)
      minion.stress = Math.min(100, minion.stress + randomInt(5, 15))
    }
  }

  /** The dungeon healer patches everyone up. Stress, sadly, is not covered. */
  function callHealer(): void {
    for (const minion of minions.value) {
      minion.hp = minion.maxHp
    }
  }

  return {
    // State
    minions,
    sectors,
    assignments,
    // Getters
    unassignedMinions,
    totalPayroll,
    unionCount,
    woundedCount,
    alerts,
    getMinion,
    getSector,
    getAssignment,
    getCrew,
    getSectorPayroll,
    // Actions
    recruitMinion,
    healMinion,
    relieveStress,
    restMinion,
    fireMinion,
    assignMinion,
    unassignMinion,
    simulateRaid,
    callHealer,
  }
})

// Keep the store's state when Vite hot-reloads this file during development.
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useDungeonStore, import.meta.hot))
}
