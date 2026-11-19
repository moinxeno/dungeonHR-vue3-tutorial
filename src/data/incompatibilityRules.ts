import type { IncompatibilityRule } from '@/types/dungeon'

/** Pairs of species that must not work the same shift in the same sector. */
export const INCOMPATIBILITY_RULES: readonly IncompatibilityRule[] = [
  {
    between: ['goblin', 'orc'],
    severity: 'warning',
    reason: 'Long-standing lunch-table dispute.',
  },
  {
    between: ['minotaur', 'minotaur'],
    severity: 'critical',
    reason: 'Minotaurs are fiercely territorial about corridors.',
  },
  {
    between: ['beholder', 'beholder'],
    severity: 'critical',
    reason: 'Each insists the other is a cheap knockoff.',
  },
  {
    between: ['skeleton', 'werewolf'],
    severity: 'warning',
    reason: 'Bones are not chew toys.',
  },
]
