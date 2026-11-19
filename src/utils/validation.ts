import {
  SPECIES,
  THREAT_LEVELS,
  type FieldErrors,
  type MinionDraft,
  type ValidationResult,
} from '@/types/dungeon'

export const MINION_NAME_MIN_LENGTH = 2
export const MINION_NAME_MAX_LENGTH = 40
export const MINION_BIO_MAX_LENGTH = 280
export const MAX_HP_LIMIT = 999
export const SALARY_LIMIT = 10_000

/**
 * Checks a "Recruit a minion" draft.
 *
 * This is a pure function: no Vue, no side effects. It takes data and returns data, which makes it
 * easy to reuse and to test. `existingNames` lets the caller enforce unique names without this
 * module knowing where the roster lives.
 */
export function validateMinionDraft(
  draft: MinionDraft,
  existingNames: readonly string[] = [],
): ValidationResult<MinionDraft> {
  const errors: FieldErrors<MinionDraft> = {}

  const name = draft.name.trim()
  if (name.length === 0) {
    errors.name = 'Every minion needs a name.'
  } else if (name.length < MINION_NAME_MIN_LENGTH) {
    errors.name = `Names need at least ${MINION_NAME_MIN_LENGTH} characters.`
  } else if (name.length > MINION_NAME_MAX_LENGTH) {
    errors.name = `Names can have at most ${MINION_NAME_MAX_LENGTH} characters.`
  } else if (existingNames.some((existing) => existing.toLowerCase() === name.toLowerCase())) {
    errors.name = 'A minion with this name already works here.'
  }

  if (!SPECIES.includes(draft.species)) {
    errors.species = 'Pick a species.'
  }

  if (!isIntegerInRange(draft.maxHp, 1, MAX_HP_LIMIT)) {
    errors.maxHp = `Max HP must be a whole number from 1 to ${MAX_HP_LIMIT}.`
  }

  if (!THREAT_LEVELS.includes(draft.threatLevel)) {
    errors.threatLevel = 'Pick a threat level from 1 to 5.'
  }

  if (!isIntegerInRange(draft.salary, 0, SALARY_LIMIT)) {
    errors.salary = `Salary must be a whole number from 0 to ${SALARY_LIMIT.toLocaleString('en-US')} gp.`
  }

  if (draft.bio !== undefined && draft.bio.trim().length > MINION_BIO_MAX_LENGTH) {
    errors.bio = `Keep the bio to ${MINION_BIO_MAX_LENGTH} characters or fewer.`
  }

  return { valid: Object.keys(errors).length === 0, errors }
}

/**
 * Number inputs can produce `''` when they are empty, even though the draft's type says `number`.
 * Checking `typeof` at runtime protects us from that gap between the type and reality.
 */
function isIntegerInRange(value: unknown, min: number, max: number): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
}
