import type { LeaveRequest } from '@/types/dungeon'

/** Requests that were already on HR's desk when the Dark Lord left. */
export const seedRequests: LeaveRequest[] = [
  {
    id: 'r-001',
    type: 'vacation',
    minionId: 'm-003',
    status: 'pending',
    submittedAt: '2026-11-12T09:30:00.000Z',
    note: 'Visiting my mother in the Ashen Wastes. She insists.',
    startDate: '2026-12-21',
    endDate: '2026-12-28',
  },
  {
    id: 'r-002',
    type: 'full-moon-leave',
    minionId: 'm-006',
    status: 'approved',
    submittedAt: '2025-11-20T22:15:00.000Z',
    note: 'Annual tradition. Biscuits will be provided the following Monday.',
    fullMoonDate: '2026-11-24',
  },
  {
    id: 'r-003',
    type: 'shift-swap',
    minionId: 'm-012',
    status: 'pending',
    submittedAt: '2026-11-18T03:05:00.000Z',
    note: 'Rattlebones agreed to cover dusk if I stop complaining about the rattling.',
    date: '2026-11-28',
    fromShift: 'dusk',
    toShift: 'midnight',
    swapPartnerId: 'm-002',
  },
]
