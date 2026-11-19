import type { Species, SpeciesProfile } from '@/types/dungeon'

/**
 * One profile per species.
 *
 * Typing this as `Record<Species, SpeciesProfile>` makes the compiler enforce completeness:
 * add a species to `SPECIES` and forget its profile here, and type checking fails.
 */
export const SPECIES_PROFILES: Record<Species, SpeciesProfile> = {
  goblin: {
    species: 'goblin',
    label: 'Goblin',
    pluralLabel: 'Goblins',
    icon: '👺',
    baseHp: 22,
    baseSalary: 100,
    description: 'Small, fast and unreasonably good at finding the snack cupboard.',
  },
  skeleton: {
    species: 'skeleton',
    label: 'Skeleton',
    pluralLabel: 'Skeletons',
    icon: '💀',
    baseHp: 28,
    baseSalary: 85,
    description: 'Never sleeps, never eats, never stops talking about the good old days.',
  },
  orc: {
    species: 'orc',
    label: 'Orc',
    pluralLabel: 'Orcs',
    icon: '👹',
    baseHp: 60,
    baseSalary: 280,
    description: 'Reliable muscle. Insists on a proper lunch break.',
  },
  minotaur: {
    species: 'minotaur',
    label: 'Minotaur',
    pluralLabel: 'Minotaurs',
    icon: '🐂',
    baseHp: 140,
    baseSalary: 600,
    description: 'Born for labyrinth duty. Gets territorial about corridors.',
  },
  beholder: {
    species: 'beholder',
    label: 'Beholder',
    pluralLabel: 'Beholders',
    icon: '👁️',
    baseHp: 190,
    baseSalary: 1400,
    description: 'Sees everything. Mostly your expense reports.',
  },
  werewolf: {
    species: 'werewolf',
    label: 'Werewolf',
    pluralLabel: 'Werewolves',
    icon: '🐺',
    baseHp: 85,
    baseSalary: 450,
    description: 'A model employee for twenty-eight days a month.',
  },
}
