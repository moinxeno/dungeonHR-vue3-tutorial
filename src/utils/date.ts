import type { IsoDate } from '@/types/dungeon'

/**
 * Formats a date as `YYYY-MM-DD` in the user's local time zone.
 *
 * `date.toISOString().slice(0, 10)` looks equivalent but uses UTC, so shortly after midnight it
 * returns yesterday's date for everyone east of Greenwich.
 */
export function toIsoDate(date: Date): IsoDate {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
