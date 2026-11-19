import { acceptHMRUpdate, defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { useAggroCalculator } from '@/composables/useAggroCalculator'
import { useLocalStorage } from '@/composables/useLocalStorage'
import { seedAssignments } from '@/data/seedAssignments'
import { seedMinions } from '@/data/seedMinions'
import { seedSectors } from '@/data/seedSectors'
import type {
  Assignment,
  DungeonSector,
  Gold,
  Minion,
  MinionDraft,
  MinionId,
  SectorId,
  Shift,
} from '@/types/dungeon'
import { toIsoDate } from '@/utils/date'
import { createId } from '@/utils/id'

/** How much stress a rest removes. */
export const REST_STRESS_RELIEF = 25

/** The outcome of an action that the store may refuse, with a reason the UI can show. */
export type ActionResult = { ok: true } | { ok: false; reason: string }

/** Key for one sector-and-shift slot, e.g. `"s-gatehouse:midnight"`. */
function slotKey(sectorId: SectorId, shift: Shift): string {
  return `${sectorId}:${shift}`
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

  // Minions and assignments change while the app runs, so they are saved in the browser and
  // restored on the next visit. `useLocalStorage` returns a ref, so the rest of the store does not
  // care whether a piece of state is persisted or not.
  const minions = useLocalStorage<Minion[]>('dungeonhr:minions', structuredClone(seedMinions))
  const assignments = useLocalStorage<Assignment[]>(
    'dungeonhr:assignments',
    structuredClone(seedAssignments),
  )
  // Sectors never change at runtime. Not persisting them means an update to the seed data reaches
  // every user immediately.
  const sectors = ref<DungeonSector[]>(structuredClone(seedSectors))

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

  /** Everything the Aggro & Burnout Monitor warns about. The rules live in the composable. */
  const { alerts } = useAggroCalculator(minions, sectors, assignments)

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

  /** Throws away all changes and restores the dungeon as the Dark Lord left it. */
  function resetToSeed(): void {
    minions.value = structuredClone(seedMinions)
    assignments.value = structuredClone(seedAssignments)
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
    resetToSeed,
  }
})

// Keep the store's state when Vite hot-reloads this file during development.
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useDungeonStore, import.meta.hot))
}
