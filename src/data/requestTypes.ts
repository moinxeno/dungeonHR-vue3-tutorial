import type { RequestType } from '@/types/dungeon'
import { VACATION_MAX_DAYS, VACATION_MAX_DAYS_UNIONIZED } from '@/utils/validation'

/** Display information per request type. */
export const REQUEST_TYPE_PROFILES: Record<
  RequestType,
  { label: string; icon: string; description: string }
> = {
  vacation: {
    label: 'Vacation',
    icon: '🏖️',
    description: `Up to ${VACATION_MAX_DAYS} days in a row, ${VACATION_MAX_DAYS_UNIONIZED} for union members.`,
  },
  'full-moon-leave': {
    label: 'Full-moon leave',
    icon: '🌕',
    description: 'The night of a full moon off. Werewolves only.',
  },
  'shift-swap': {
    label: 'Shift swap',
    icon: '🔄',
    description: 'Trade one shift for another on a given day.',
  },
}
