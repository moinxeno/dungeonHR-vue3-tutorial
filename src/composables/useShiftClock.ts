import { computed, onMounted, onUnmounted, readonly, ref } from 'vue'

import type { Shift } from '@/types/dungeon'
import { daysBetween, toIsoDate } from '@/utils/date'
import { nextFullMoon } from '@/utils/moonPhase'

/** The local hour at which each shift starts. Midnight runs from 22:00 to 06:00. */
export const SHIFT_START_HOURS: Record<Shift, number> = { dawn: 6, dusk: 14, midnight: 22 }

const NEXT_SHIFT: Record<Shift, Shift> = { dawn: 'dusk', dusk: 'midnight', midnight: 'dawn' }

/** Which shift is on duty at a given moment. */
export function shiftAt(date: Date): Shift {
  const hour = date.getHours()
  if (hour >= SHIFT_START_HOURS.midnight || hour < SHIFT_START_HOURS.dawn) return 'midnight'
  if (hour >= SHIFT_START_HOURS.dusk) return 'dusk'
  return 'dawn'
}

/** Whole minutes from `date` until the next shift starts. */
export function minutesUntilShiftChange(date: Date): number {
  const next = new Date(date)
  next.setHours(SHIFT_START_HOURS[NEXT_SHIFT[shiftAt(date)]], 0, 0, 0)
  // The next start hour may already have passed today (e.g. dawn after midnight): then it is tomorrow.
  if (next <= date) next.setDate(next.getDate() + 1)
  return Math.ceil((next.getTime() - date.getTime()) / 60_000)
}

const timeFormat = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' })

/**
 * A live clock for the dungeon: the current time, the shift on duty, and the next full moon.
 *
 * It uses lifecycle hooks, so call it from a component's `<script setup>`. The timer starts when the
 * component is mounted and is stopped when it is unmounted. Without the cleanup, every component
 * instance that ever used the clock would leave a timer running forever.
 *
 * @param intervalMs How often the clock ticks.
 */
export function useShiftClock(intervalMs = 1000) {
  const now = ref(new Date())
  let timer: ReturnType<typeof setInterval> | undefined

  // Not started during setup: timers belong to a component that is actually on screen. (During
  // server-side rendering, `onMounted` never runs, so no timer leaks on the server either.)
  onMounted(() => {
    timer = setInterval(() => {
      now.value = new Date()
    }, intervalMs)
  })

  onUnmounted(() => {
    clearInterval(timer)
  })

  const currentShift = computed(() => shiftAt(now.value))
  const nextShift = computed(() => NEXT_SHIFT[currentShift.value])
  const minutesUntilNextShift = computed(() => minutesUntilShiftChange(now.value))
  const clockTime = computed(() => timeFormat.format(now.value))

  // `today` only changes once a day, so the moon arithmetic below runs once a day, not every second.
  const today = computed(() => toIsoDate(now.value))
  const daysUntilFullMoon = computed(() => daysBetween(today.value, nextFullMoon(today.value)))

  return {
    // `readonly`: callers may read the time, but setting it is the clock's job.
    now: readonly(now),
    clockTime,
    currentShift,
    nextShift,
    minutesUntilNextShift,
    daysUntilFullMoon,
  }
}
