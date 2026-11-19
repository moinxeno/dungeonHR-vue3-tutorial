import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'

import { minutesUntilShiftChange, shiftAt, useShiftClock } from '@/composables/useShiftClock'

/** Local time on 19 November 2026. The clock works in the user's time zone, and so does this. */
function at(hours: number, minutes = 0, seconds = 0): Date {
  return new Date(2026, 10, 19, hours, minutes, seconds)
}

describe('shiftAt', () => {
  it.each([
    [at(5, 59), 'midnight'],
    [at(6, 0), 'dawn'],
    [at(13, 59), 'dawn'],
    [at(14, 0), 'dusk'],
    [at(21, 59), 'dusk'],
    [at(22, 0), 'midnight'],
    [at(0, 0), 'midnight'],
  ])('at %s the %s shift is on duty', (date, shift) => {
    expect(shiftAt(date)).toBe(shift)
  })
})

describe('minutesUntilShiftChange', () => {
  it('counts to the next shift on the same day', () => {
    expect(minutesUntilShiftChange(at(13, 30))).toBe(30)
  })

  it('counts across midnight', () => {
    expect(minutesUntilShiftChange(at(23, 0))).toBe(7 * 60)
  })

  it('rounds partial minutes up', () => {
    expect(minutesUntilShiftChange(at(5, 59, 30))).toBe(1)
  })
})

describe('useShiftClock', () => {
  // Fake timers replace setInterval and Date, so a test can move time forward instantly.
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(at(13, 59, 30))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // The composable uses lifecycle hooks, so it needs a component around it.
  const ClockProbe = defineComponent({
    setup() {
      const clock = useShiftClock(1000)
      return () => h('p', clock.currentShift.value)
    },
  })

  it('moves to the next shift as time passes', async () => {
    const wrapper = mount(ClockProbe)
    expect(wrapper.text()).toBe('dawn')

    await vi.advanceTimersByTimeAsync(30_000)

    expect(wrapper.text()).toBe('dusk')
  })

  it('starts its timer on mount and stops it on unmount', () => {
    expect(vi.getTimerCount()).toBe(0)

    const wrapper = mount(ClockProbe)
    expect(vi.getTimerCount()).toBe(1)

    wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
