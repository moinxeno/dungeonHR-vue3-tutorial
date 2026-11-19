import {
  SPECIES,
  THREAT_LEVELS,
  type FieldErrors,
  type IsoDate,
  type LeaveRequestDraft,
  type Minion,
  type MinionDraft,
  type ValidationResult,
} from '@/types/dungeon'
import { daysBetween, formatDate, isIsoDate } from '@/utils/date'
import { isFullMoon, nextFullMoon } from '@/utils/moonPhase'

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

export const REQUEST_NOTE_MAX_LENGTH = 500
export const VACATION_MAX_DAYS = 10
export const VACATION_MAX_DAYS_UNIONIZED = 14

/** Everything besides the draft that the leave-request rules depend on. */
export interface LeaveRequestContext {
  /** The minion the request is for, or `undefined` if nobody is selected. */
  applicant: Minion | undefined
  /** Today's date. Passed in, rather than read from the clock, so the function stays pure. */
  today: IsoDate
}

/**
 * Checks a leave or shift request.
 *
 * The draft is a discriminated union: inside each `case`, TypeScript knows which fields exist.
 * ISO dates (`YYYY-MM-DD`) compare correctly as plain strings, so `<` works for "earlier than".
 */
export function validateLeaveRequest(
  draft: LeaveRequestDraft,
  { applicant, today }: LeaveRequestContext,
): ValidationResult<LeaveRequestDraft> {
  const errors: FieldErrors<LeaveRequestDraft> = {}

  if (!applicant) {
    errors.minionId = 'Pick the minion this request is for.'
  }

  if (draft.note.trim().length > REQUEST_NOTE_MAX_LENGTH) {
    errors.note = `Keep the note to ${REQUEST_NOTE_MAX_LENGTH} characters or fewer.`
  }

  switch (draft.type) {
    case 'vacation': {
      const hasStart = isIsoDate(draft.startDate)
      if (!hasStart) {
        errors.startDate = 'Pick the first day of the vacation.'
      } else if (draft.startDate < today) {
        errors.startDate = 'Vacations cannot start in the past.'
      }

      if (!isIsoDate(draft.endDate)) {
        errors.endDate = 'Pick the last day of the vacation.'
      } else if (hasStart && draft.endDate < draft.startDate) {
        errors.endDate = 'The vacation must end on or after its first day.'
      } else if (hasStart && applicant) {
        const days = daysBetween(draft.startDate, draft.endDate) + 1
        const maxDays = applicant.isUnionized ? VACATION_MAX_DAYS_UNIONIZED : VACATION_MAX_DAYS
        if (days > maxDays) {
          const who = applicant.isUnionized ? 'Union members' : 'Non-union staff'
          errors.endDate = `${who} can take at most ${maxDays} days in a row. This request covers ${days}.`
        }
      }
      break
    }

    case 'full-moon-leave': {
      if (applicant && applicant.species !== 'werewolf') {
        errors.minionId = 'Only werewolves can request full-moon leave.'
      }

      if (!isIsoDate(draft.fullMoonDate)) {
        errors.fullMoonDate = 'Pick the night of the full moon.'
      } else if (draft.fullMoonDate < today) {
        errors.fullMoonDate = 'That full moon has already passed.'
      } else if (!isFullMoon(draft.fullMoonDate)) {
        errors.fullMoonDate = `That is not a full moon. The next one is on ${formatDate(nextFullMoon(today))}.`
      }
      break
    }

    case 'shift-swap': {
      if (!isIsoDate(draft.date)) {
        errors.date = 'Pick the date of the shift.'
      } else if (draft.date < today) {
        errors.date = 'Shifts in the past cannot be swapped.'
      }

      if (draft.fromShift === draft.toShift) {
        errors.toShift = 'Pick a different shift than the current one.'
      }

      if (draft.swapPartnerId !== null && draft.swapPartnerId === draft.minionId) {
        errors.swapPartnerId = 'Minions cannot swap shifts with themselves.'
      }
      break
    }

    default: {
      // If a new request type is added to the union and not handled above, `draft` is no longer
      // `never` here, and this line fails to compile. The compiler finds the missing case for us.
      const unhandled: never = draft
      throw new Error(`Unhandled request type: ${JSON.stringify(unhandled)}`)
    }
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
