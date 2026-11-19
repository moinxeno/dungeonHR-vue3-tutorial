import type { IsoDate } from '@/types/dungeon'

const MS_PER_DAY = 86_400_000
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

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

/** True for a real calendar date in `YYYY-MM-DD` format. Rejects `''` and `2026-02-30`. */
export function isIsoDate(value: string): boolean {
  const match = ISO_DATE_PATTERN.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  )
}

/**
 * Midnight UTC of a calendar date, in milliseconds since the epoch.
 *
 * Calendar arithmetic is done in UTC on purpose: UTC has no daylight-saving time, so every day is
 * exactly 24 hours long.
 */
export function isoDateToUtcMs(date: IsoDate): number {
  if (!isIsoDate(date)) throw new Error(`Not a valid ISO date: "${date}"`)
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  return Date.UTC(year, month - 1, day)
}

/** The calendar date (in UTC) that contains the given instant. */
export function utcMsToIsoDate(ms: number): IsoDate {
  return new Date(ms).toISOString().slice(0, 10)
}

/** Whole days from `from` to `to`. Negative if `to` is earlier. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((isoDateToUtcMs(to) - isoDateToUtcMs(from)) / MS_PER_DAY)
}

const displayFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

/** Formats a date for display: `formatDate('2026-11-24')` returns `"24 Nov 2026"`. */
export function formatDate(date: IsoDate): string {
  return displayFormat.format(isoDateToUtcMs(date))
}
