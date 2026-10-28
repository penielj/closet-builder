import type { Item } from '../db/schema'
import type { Category } from '../db/values'

// Wear tracking (DESIGN §5 rules 16 and 17): how many wears before a piece goes to the
// hamper on its own, and which pieces were worn too recently to suggest again.

export const NEVER = 0 // washAfter value: never goes to the hamper on its own
export const WASH_CHOICES = [1, 2, 3, 5, 10, NEVER] as const

const BY_CATEGORY: Record<Category, number> = {
  top: 1, bottom: 3, dress: 3, sweater: 3, shoes: NEVER, outerwear: NEVER, hat: NEVER, bag: NEVER,
}

// The item's own setting, else its category's default. Workout-only clothes go after one wear.
export function washAfter(i: Pick<Item, 'category' | 'occasions' | 'washAfter'>): number {
  if (i.washAfter !== undefined) return i.washAfter
  const byCategory = BY_CATEGORY[i.category]
  return byCategory !== NEVER && i.occasions.length === 1 && i.occasions[0] === 'workout' ? 1 : byCategory
}

export const defaultWashAfter = (i: Pick<Item, 'category' | 'occasions'>) => washAfter({ ...i, washAfter: undefined })

// Rule 17: worn on one of the last REST_DAYS days before `date` (both local YYYY-MM-DD).
export const REST_DAYS = 3
const DAY_MS = 86_400_000
export function wornRecently(i: Pick<Item, 'lastWorn'>, date: string): boolean {
  if (!i.lastWorn) return false
  const days = (Date.parse(date) - Date.parse(i.lastWorn)) / DAY_MS
  return days >= 0 && days <= REST_DAYS
}

// The pieces in `list` that weren't worn recently, or all of them when every one was.
export function rested<T extends Pick<Item, 'lastWorn'>>(list: T[], date: string): T[] {
  const fresh = list.filter((i) => !wornRecently(i, date))
  return fresh.length ? fresh : list
}

// "2/3 wears" toward the hamper, or "Worn 4×" for what never goes on its own.
export function wearLabel(i: Pick<Item, 'category' | 'occasions' | 'washAfter' | 'wears'>): string {
  const limit = washAfter(i)
  return limit === NEVER ? `Worn ${i.wears ?? 0}×` : `${i.wears ?? 0}/${limit} wears`
}
