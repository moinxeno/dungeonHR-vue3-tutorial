import type { IsoDate } from '@/types/dungeon'
import { isoDateToUtcMs, utcMsToIsoDate } from '@/utils/date'

/**
 * Moon phase arithmetic for full-moon leave.
 *
 * We use the average length of a lunar cycle. Real cycles vary by several hours, so results can be
 * off by up to about a day. That is fine for HR purposes (requests accept a day either side), but do
 * not plan an eclipse expedition with it.
 */

/** Average length of a lunar cycle, from new moon to new moon, in days. */
export const SYNODIC_MONTH_DAYS = 29.530588853

const MS_PER_DAY = 86_400_000
const HALF_CYCLE_DAYS = SYNODIC_MONTH_DAYS / 2

/** A known new moon to count from: 6 January 2000, 18:14 UTC. */
const REFERENCE_NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14)

/** Noon UTC on the given date. Measuring at noon keeps us half a day away from both date edges. */
function noonUtcMs(date: IsoDate): number {
  return isoDateToUtcMs(date) + MS_PER_DAY / 2
}

/** Age of the moon in days at noon UTC: 0 is a new moon, about 14.77 is a full moon. */
export function moonAge(date: IsoDate): number {
  const daysSinceReference = (noonUtcMs(date) - REFERENCE_NEW_MOON_MS) / MS_PER_DAY
  // `%` keeps the sign of the left operand; adding a cycle and taking `%` again keeps it positive.
  return ((daysSinceReference % SYNODIC_MONTH_DAYS) + SYNODIC_MONTH_DAYS) % SYNODIC_MONTH_DAYS
}

/**
 * True if the date is the night of a full moon, or up to `toleranceDays` days before or after it.
 *
 * The extra half day accounts for measuring at noon: the full moon itself can happen at any time on
 * its calendar day, so that day's noon is up to half a day away from it.
 */
export function isFullMoon(date: IsoDate, toleranceDays = 1): boolean {
  return Math.abs(moonAge(date) - HALF_CYCLE_DAYS) <= toleranceDays + 0.5
}

/** The date of the next full moon on or after `from`. */
export function nextFullMoon(from: IsoDate): IsoDate {
  let daysUntil = HALF_CYCLE_DAYS - moonAge(from)
  // More than half a day in the past means this cycle's full moon was on an earlier date.
  if (daysUntil < -0.5) daysUntil += SYNODIC_MONTH_DAYS
  return utcMsToIsoDate(noonUtcMs(from) + daysUntil * MS_PER_DAY)
}
