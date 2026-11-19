/**
 * DungeonHR domain model.
 *
 * Every other module derives its types from this file.
 *
 * Conventions:
 * - Value lists (`SPECIES`, `SHIFTS`, ...) are runtime arrays declared `as const`.
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

/** Full ISO-8601 timestamp, e.g. `2026-11-19T18:00:00.000Z`. */
export type IsoDateTime = string

/** An amount of gold coins. Always a non-negative integer. */
export type Gold = number

export type MinionId = string
export type SectorId = string
export type RequestId = string

/** How loudly the Aggro Monitor shouts about something. */
export type Severity = 'info' | 'warning' | 'critical'

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

/**
 * The fields a user fills in on the "Recruit a minion" form.
 * `id` and `hiredOn` are generated; a fresh recruit starts at full HP and zero stress.
 */
export type MinionDraft = Omit<Minion, 'id' | 'hiredOn' | 'hp' | 'stress'>

// ---------------------------------------------------------------------------
// Sectors, shifts & assignments
// ---------------------------------------------------------------------------

export const SECTOR_KINDS = [
  'treasury',
  'catacombs',
  'torture-chamber',
  'gatehouse',
  'lair',
] as const
export type SectorKind = (typeof SECTOR_KINDS)[number]

/** An area of the dungeon that needs staffing, e.g. "Torture Chamber 3". */
export interface DungeonSector {
  id: SectorId
  name: string
  kind: SectorKind
  /** Maximum number of minions per shift. Soft limit: exceeding it raises an alert. */
  capacity: number
  /** Minimum threat level required to be posted here. Hard limit: enforced on assignment. */
  minThreatLevel: ThreatLevel
  /** Monthly payroll budget for everyone posted to this sector. */
  payrollBudget: Gold
}

export const SHIFTS = ['dawn', 'dusk', 'midnight'] as const
export type Shift = (typeof SHIFTS)[number]

/**
 * A minion's posting to a sector and shift.
 * Invariant: each minion holds at most one assignment at a time.
 */
export interface Assignment {
  minionId: MinionId
  sectorId: SectorId
  shift: Shift
}

/**
 * Two species that must not share the same sector during the same shift.
 * The pair is unordered: `['orc', 'goblin']` also matches a goblin next to an orc.
 * Both entries may be the same species (two minotaurs fight over territory).
 */
export interface IncompatibilityRule {
  between: readonly [Species, Species]
  severity: Exclude<Severity, 'info'>
  reason: string
}

// ---------------------------------------------------------------------------
// Aggro & burnout monitor
// ---------------------------------------------------------------------------

interface AlertBase {
  /** Deterministic key derived from the alert's content; stable across recomputations. */
  id: string
  severity: Severity
  /** Human-readable summary, ready to render. */
  message: string
}

export interface IncompatibleSpeciesAlert extends AlertBase {
  kind: 'incompatible-species'
  sectorId: SectorId
  shift: Shift
  minionIds: readonly [MinionId, MinionId]
}

export interface OverCapacityAlert extends AlertBase {
  kind: 'over-capacity'
  sectorId: SectorId
  shift: Shift
  capacity: number
  assigned: number
}

export interface OverBudgetAlert extends AlertBase {
  kind: 'over-budget'
  sectorId: SectorId
  budget: Gold
  payroll: Gold
}

export interface BurnoutRiskAlert extends AlertBase {
  kind: 'burnout-risk'
  minionId: MinionId
  stress: number
}

/** Discriminated union: narrow on `kind` to access the specific fields. */
export type DungeonAlert =
  IncompatibleSpeciesAlert | OverCapacityAlert | OverBudgetAlert | BurnoutRiskAlert

export type AlertKind = DungeonAlert['kind']

// ---------------------------------------------------------------------------
// Leave & shift requests
// ---------------------------------------------------------------------------

export const REQUEST_TYPES = ['vacation', 'full-moon-leave', 'shift-swap'] as const
export type RequestType = (typeof REQUEST_TYPES)[number]

export const REQUEST_STATUSES = ['pending', 'approved', 'rejected'] as const
export type RequestStatus = (typeof REQUEST_STATUSES)[number]

interface RequestBase {
  id: RequestId
  minionId: MinionId
  status: RequestStatus
  submittedAt: IsoDateTime
  /** Free-text justification from the applicant. May be empty. */
  note: string
}

export interface VacationRequest extends RequestBase {
  type: 'vacation'
  startDate: IsoDate
  /** Inclusive. */
  endDate: IsoDate
}

/** Werewolves only. `fullMoonDate` must fall on a full moon. */
export interface FullMoonLeaveRequest extends RequestBase {
  type: 'full-moon-leave'
  fullMoonDate: IsoDate
}

export interface ShiftSwapRequest extends RequestBase {
  type: 'shift-swap'
  date: IsoDate
  fromShift: Shift
  toShift: Shift
  /** Colleague who covers the original shift, or `null` if nobody volunteered yet. */
  swapPartnerId: MinionId | null
}

/** Discriminated union: narrow on `type` to access the specific fields. */
export type LeaveRequest = VacationRequest | FullMoonLeaveRequest | ShiftSwapRequest

// ---------------------------------------------------------------------------
// Form helpers
// ---------------------------------------------------------------------------

/**
 * `Omit` that distributes over a union.
 * Plain `Omit<A | B, K>` collapses the union to its shared keys and loses the
 * discriminant-specific fields; this version applies `Omit` to each member.
 */
export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

/** Every key that appears in at least one member of a union. */
export type KeysOfUnion<T> = T extends unknown ? keyof T : never

/** What the request form edits: everything except the system-managed fields. */
export type LeaveRequestDraft = DistributiveOmit<LeaveRequest, 'id' | 'status' | 'submittedAt'>

/** One error message per invalid field. Missing key = field is valid. */
export type FieldErrors<T> = Partial<Record<KeysOfUnion<T> & string, string>>

export interface ValidationResult<T> {
  valid: boolean
  errors: FieldErrors<T>
}
