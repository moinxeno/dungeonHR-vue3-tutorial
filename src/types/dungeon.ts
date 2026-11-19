/**
 * DungeonHR domain model.
 *
 * Every other module derives its types from this file.
 *
 * Conventions:
 * - Value lists (`SPECIES`, `THREAT_LEVELS`, ...) are runtime arrays declared `as const`.
 *   Their union types are derived from them, so the type checker and the UI
 *   (select options, filters, validation) share a single source of truth.
 * - Dates are ISO-8601 strings, never `Date` objects. The entire state tree
 *   therefore survives a `JSON.stringify` / `JSON.parse` round-trip, which
 *   matters once we persist it to localStorage (step 06).
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** Calendar date in `YYYY-MM-DD` format, e.g. `2026-11-24`. */
export type IsoDate = string

/** An amount of gold coins. Always a non-negative integer. */
export type Gold = number

export type MinionId = string

// ---------------------------------------------------------------------------
// Species & minions
// ---------------------------------------------------------------------------

export const SPECIES = ['goblin', 'skeleton', 'orc', 'minotaur', 'beholder', 'werewolf'] as const
export type Species = (typeof SPECIES)[number]

/** 1 = mildly inconvenient, 5 = adventurers write ballads about it. */
export const THREAT_LEVELS = [1, 2, 3, 4, 5] as const
export type ThreatLevel = (typeof THREAT_LEVELS)[number]

/** Static facts about a species, used for display and form defaults. */
export interface SpeciesProfile {
  species: Species
  /** Singular display name, e.g. "Beholder". */
  label: string
  /** Plural display name, e.g. "Beholders". */
  pluralLabel: string
  /** Emoji used as a lightweight avatar. */
  icon: string
  /** Suggested `maxHp` when recruiting a new minion of this species. */
  baseHp: number
  /** Suggested monthly salary when recruiting a new minion of this species. */
  baseSalary: Gold
  /** One-line HR description shown in tooltips. */
  description: string
}

/** A dungeon employee. */
export interface Minion {
  id: MinionId
  name: string
  species: Species
  /** Current hit points. Invariant: `0 <= hp <= maxHp`. */
  hp: number
  maxHp: number
  threatLevel: ThreatLevel
  /** Monthly salary in gold coins. */
  salary: Gold
  /** Union members get extra vacation days and cannot be fired without a hearing. */
  isUnionized: boolean
  /** Accumulated stress from 0 (well rested) to 100 (burned out). */
  stress: number
  hiredOn: IsoDate
  /** Optional flavor text for the detail page. */
  bio?: string
}
