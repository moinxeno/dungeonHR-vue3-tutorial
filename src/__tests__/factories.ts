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
