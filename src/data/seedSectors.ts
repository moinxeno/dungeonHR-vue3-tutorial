import type { DungeonSector } from '@/types/dungeon'

/** The parts of the dungeon that need staff, around the clock. */
export const seedSectors: DungeonSector[] = [
  {
    id: 's-treasury',
    name: 'Treasury Guard',
    kind: 'treasury',
    capacity: 3,
    minThreatLevel: 4,
    payrollBudget: 4000,
  },
  {
    id: 's-catacombs',
    name: 'Catacombs',
    kind: 'catacombs',
    capacity: 4,
    minThreatLevel: 1,
    payrollBudget: 900,
  },
  {
    id: 's-torture-3',
    name: 'Torture Chamber 3',
    kind: 'torture-chamber',
    capacity: 2,
    minThreatLevel: 2,
    payrollBudget: 700,
  },
  {
    id: 's-gatehouse',
    name: 'Gatehouse',
    kind: 'gatehouse',
    capacity: 4,
    minThreatLevel: 3,
    payrollBudget: 1600,
  },
  {
    id: 's-lair',
    name: 'Beholder Lair',
    kind: 'lair',
    capacity: 2,
    minThreatLevel: 5,
    payrollBudget: 2600,
  },
]
