import { describe, expect, it } from 'vitest'

import { makeMinion, makeMinionDraft } from '@/__tests__/factories'
import type { LeaveRequestDraft } from '@/types/dungeon'
import { validateLeaveRequest, validateMinionDraft } from '@/utils/validation'

describe('validateMinionDraft', () => {
  it('accepts a complete draft', () => {
    expect(validateMinionDraft(makeMinionDraft())).toEqual({ valid: true, errors: {} })
  })

  it.each([
    ['', 'Every minion needs a name.'],
    ['   ', 'Every minion needs a name.'],
    ['G', 'Names need at least 2 characters.'],
    ['G'.repeat(41), 'Names can have at most 40 characters.'],
  ])('rejects the name %j', (name, message) => {
    const result = validateMinionDraft(makeMinionDraft({ name }))
    expect(result.valid).toBe(false)
    expect(result.errors.name).toBe(message)
  })

  it('rejects names that are already taken, ignoring case and surrounding spaces', () => {
    const result = validateMinionDraft(makeMinionDraft({ name: '  grizzle snaggletooth ' }), [
      'Grizzle Snaggletooth',
    ])
    expect(result.errors.name).toBe('A minion with this name already works here.')
  })

  it('rejects an empty number field, which arrives as an empty string', () => {
    // A cleared <input type="number"> gives '' at runtime, whatever the type says.
    const draft = { ...makeMinionDraft(), maxHp: '' as unknown as number }
    expect(validateMinionDraft(draft).errors.maxHp).toBe(
      'Max HP must be a whole number from 1 to 999.',
    )
  })

  it.each([0, 1.5, 1000])('rejects %d as max HP', (maxHp) => {
    expect(validateMinionDraft(makeMinionDraft({ maxHp })).errors.maxHp).toBeDefined()
  })

  it('accepts unpaid interns but no negative salaries', () => {
    expect(validateMinionDraft(makeMinionDraft({ salary: 0 })).valid).toBe(true)
    expect(validateMinionDraft(makeMinionDraft({ salary: -10 })).errors.salary).toBeDefined()
  })

  it('limits the bio to 280 characters', () => {
    expect(validateMinionDraft(makeMinionDraft({ bio: 'x'.repeat(280) })).valid).toBe(true)
    expect(validateMinionDraft(makeMinionDraft({ bio: 'x'.repeat(281) })).errors.bio).toBeDefined()
  })
})

describe('validateLeaveRequest', () => {
  // `today` is a parameter, so every test can pretend it is the same day.
  const today = '2026-11-19'
  const goblin = makeMinion({ species: 'goblin', isUnionized: false })
  const unionGoblin = makeMinion({ species: 'goblin', isUnionized: true })
  const werewolf = makeMinion({ species: 'werewolf' })

  function vacation(startDate: string, endDate: string): LeaveRequestDraft {
    return { type: 'vacation', minionId: goblin.id, note: '', startDate, endDate }
  }

  it('requires an applicant', () => {
    const result = validateLeaveRequest(vacation('2026-12-01', '2026-12-02'), {
      applicant: undefined,
      today,
    })
    expect(result.errors.minionId).toBe('Pick the minion this request is for.')
  })

  describe('vacation', () => {
    it('accepts a valid vacation', () => {
      expect(
        validateLeaveRequest(vacation('2026-12-01', '2026-12-10'), { applicant: goblin, today })
          .valid,
      ).toBe(true)
    })

    it('rejects missing dates', () => {
      const { errors } = validateLeaveRequest(vacation('', ''), { applicant: goblin, today })
      expect(errors.startDate).toBe('Pick the first day of the vacation.')
      expect(errors.endDate).toBe('Pick the last day of the vacation.')
    })

    it('rejects a start in the past, but allows starting today', () => {
      const past = validateLeaveRequest(vacation('2026-11-18', '2026-11-20'), {
        applicant: goblin,
        today,
      })
      expect(past.errors.startDate).toBe('Vacations cannot start in the past.')
      expect(validateLeaveRequest(vacation(today, today), { applicant: goblin, today }).valid).toBe(
        true,
      )
    })

    it('rejects an end before the start', () => {
      const { errors } = validateLeaveRequest(vacation('2026-12-10', '2026-12-01'), {
        applicant: goblin,
        today,
      })
      expect(errors.endDate).toBe('The vacation must end on or after its first day.')
    })

    it('allows non-union staff 10 days and union members 14', () => {
      const elevenDays = vacation('2026-12-01', '2026-12-11')
      const fifteenDays = vacation('2026-12-01', '2026-12-15')
      const fourteenDays = vacation('2026-12-01', '2026-12-14')

      expect(validateLeaveRequest(elevenDays, { applicant: goblin, today }).errors.endDate).toBe(
        'Non-union staff can take at most 10 days in a row. This request covers 11.',
      )
      expect(validateLeaveRequest(fourteenDays, { applicant: unionGoblin, today }).valid).toBe(true)
      expect(
        validateLeaveRequest(fifteenDays, { applicant: unionGoblin, today }).errors.endDate,
      ).toBe('Union members can take at most 14 days in a row. This request covers 15.')
    })
  })

  describe('full-moon leave', () => {
    function fullMoonLeave(minionId: string, fullMoonDate: string): LeaveRequestDraft {
      return { type: 'full-moon-leave', minionId, note: '', fullMoonDate }
    }

    it('accepts a werewolf on the night of a full moon', () => {
      expect(
        validateLeaveRequest(fullMoonLeave(werewolf.id, '2026-11-24'), {
          applicant: werewolf,
          today,
        }).valid,
      ).toBe(true)
    })

    it('is for werewolves only', () => {
      const { errors } = validateLeaveRequest(fullMoonLeave(goblin.id, '2026-11-24'), {
        applicant: goblin,
        today,
      })
      expect(errors.minionId).toBe('Only werewolves can request full-moon leave.')
    })

    it('rejects dates that are not a full moon and names the next one', () => {
      const { errors } = validateLeaveRequest(fullMoonLeave(werewolf.id, '2026-12-05'), {
        applicant: werewolf,
        today,
      })
      expect(errors.fullMoonDate).toBe('That is not a full moon. The next one is on 24 Nov 2026.')
    })

    it('rejects full moons in the past', () => {
      const { errors } = validateLeaveRequest(fullMoonLeave(werewolf.id, '2026-10-26'), {
        applicant: werewolf,
        today,
      })
      expect(errors.fullMoonDate).toBe('That full moon has already passed.')
    })
  })

  describe('shift swap', () => {
    function shiftSwap(overrides: Partial<Extract<LeaveRequestDraft, { type: 'shift-swap' }>>) {
      return {
        type: 'shift-swap' as const,
        minionId: goblin.id,
        note: '',
        date: '2026-11-28',
        fromShift: 'dusk' as const,
        toShift: 'midnight' as const,
        swapPartnerId: null,
        ...overrides,
      }
    }

    it('accepts a swap without a partner', () => {
      expect(validateLeaveRequest(shiftSwap({}), { applicant: goblin, today }).valid).toBe(true)
    })

    it('rejects swapping a shift for the same shift', () => {
      const { errors } = validateLeaveRequest(shiftSwap({ toShift: 'dusk' }), {
        applicant: goblin,
        today,
      })
      expect(errors.toShift).toBe('Pick a different shift than the current one.')
    })

    it('rejects swapping with yourself', () => {
      const { errors } = validateLeaveRequest(shiftSwap({ swapPartnerId: goblin.id }), {
        applicant: goblin,
        today,
      })
      expect(errors.swapPartnerId).toBe('Minions cannot swap shifts with themselves.')
    })
  })

  it('limits the note to 500 characters', () => {
    const draft = { ...vacation('2026-12-01', '2026-12-02'), note: 'x'.repeat(501) }
    expect(validateLeaveRequest(draft, { applicant: goblin, today }).errors.note).toBeDefined()
  })
})
