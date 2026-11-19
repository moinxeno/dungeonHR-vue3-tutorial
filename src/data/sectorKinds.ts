import type { SectorKind } from '@/types/dungeon'

/** Display information per kind of sector, the sector counterpart to `SPECIES_PROFILES`. */
export const SECTOR_KIND_PROFILES: Record<SectorKind, { label: string; icon: string }> = {
  treasury: { label: 'Treasury', icon: '💰' },
  catacombs: { label: 'Catacombs', icon: '⚰️' },
  'torture-chamber': { label: 'Torture chamber', icon: '⛓️' },
  gatehouse: { label: 'Gatehouse', icon: '🏰' },
  lair: { label: 'Lair', icon: '🕳️' },
}
