import { describe, expect, it } from 'vitest'

import { isFullMoon, moonAge, nextFullMoon, SYNODIC_MONTH_DAYS } from '@/utils/moonPhase'

describe('moonAge', () => {
  it('always stays within one lunar cycle', () => {
    for (const date of ['1999-12-31', '2000-01-06', '2026-11-19', '2087-06-01']) {
      const age = moonAge(date)
      expect(age).toBeGreaterThanOrEqual(0)
      expect(age).toBeLessThan(SYNODIC_MONTH_DAYS)
    }
  })
})

describe('nextFullMoon', () => {
  // Real full moons of late 2026 and early 2027, as published by astronomers.
  it.each([
    ['2026-11-19', '2026-11-24'],
    ['2026-11-24', '2026-11-24'],
    ['2026-11-25', '2026-12-24'],
    ['2026-12-25', '2027-01-22'],
  ])('from %s finds the full moon on %s', (from, expected) => {
    expect(nextFullMoon(from)).toBe(expected)
  })
})

describe('isFullMoon', () => {
  it('accepts the night of the full moon and one day either side', () => {
    expect(isFullMoon('2026-11-23')).toBe(true)
    expect(isFullMoon('2026-11-24')).toBe(true)
    expect(isFullMoon('2026-11-25')).toBe(true)
  })

  it('rejects dates further away', () => {
    expect(isFullMoon('2026-11-22')).toBe(false)
    expect(isFullMoon('2026-11-26')).toBe(false)
    expect(isFullMoon('2026-12-09')).toBe(false)
  })

  it('can be made stricter', () => {
    expect(isFullMoon('2026-11-24', 0)).toBe(true)
    expect(isFullMoon('2026-11-23', 0)).toBe(false)
  })
})
