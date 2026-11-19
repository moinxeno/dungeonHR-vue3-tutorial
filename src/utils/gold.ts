import type { Gold } from '@/types/dungeon'

// Creating an `Intl.NumberFormat` is comparatively expensive, so we create it once and reuse it.
const goldFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

/** Formats an amount of gold for display: `formatGold(1500)` returns `"1,500 gp"`. */
export function formatGold(amount: Gold): string {
  return `${goldFormat.format(amount)} gp`
}
