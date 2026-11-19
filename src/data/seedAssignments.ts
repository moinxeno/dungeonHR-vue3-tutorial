import type { Assignment } from '@/types/dungeon'

/**
 * The duty roster as the Dark Lord left it. It has problems: two beholders guard the treasury
 * together, both minotaurs share the midnight shift at the gatehouse, and the gatehouse is over
 * budget. Sorting this out is HR's first job.
 */
export const seedAssignments: Assignment[] = [
  { minionId: 'm-005', sectorId: 's-treasury', shift: 'dawn' },
  { minionId: 'm-010', sectorId: 's-treasury', shift: 'dawn' },
  { minionId: 'm-002', sectorId: 's-catacombs', shift: 'midnight' },
  { minionId: 'm-008', sectorId: 's-catacombs', shift: 'midnight' },
  { minionId: 'm-012', sectorId: 's-catacombs', shift: 'midnight' },
  { minionId: 'm-001', sectorId: 's-torture-3', shift: 'dawn' },
  { minionId: 'm-003', sectorId: 's-torture-3', shift: 'dawn' },
  { minionId: 'm-009', sectorId: 's-gatehouse', shift: 'dusk' },
  { minionId: 'm-006', sectorId: 's-gatehouse', shift: 'dusk' },
  { minionId: 'm-004', sectorId: 's-gatehouse', shift: 'midnight' },
  { minionId: 'm-011', sectorId: 's-gatehouse', shift: 'midnight' },
]
