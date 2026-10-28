import type { Item, TodayState } from '../db/schema'

// DESIGN Flow C, "Today's outfit stays put": decides whether the saved outfit can be
// shown as-is or a new one must be picked. Editing an item never forces a pick.

export function localDate(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export interface DailyPlan {
  state: TodayState // today with gone items removed from the outfit and its locks
  repick: boolean
}

export function planToday(today: TodayState | undefined, items: Item[], date: string): DailyPlan {
  // A new day replaces `today` as a whole, which also clears the locks.
  if (!today || today.date !== date) return { state: { date, itemIds: [], locked: [] }, repick: true }

  const byId = new Map(items.map((i) => [i.id, i]))

  // Once worn (rule 16), the outfit stays as it is for the day, even with pieces now in
  // the hamper. Only deleted items drop out.
  if (today.worn) {
    const itemIds = today.itemIds.filter((id) => byId.has(id))
    return { state: itemIds.length === today.itemIds.length ? today : { ...today, itemIds }, repick: false }
  }

  // Sending a shown item to the hamper, marking it Not today or deleting it unlocks it
  // and re-picks, keeping the other locks.
  const stillThere = (id: number) => {
    const i = byId.get(id)
    return !!i && !i.inHamper && i.skipDate !== date
  }
  const itemIds = today.itemIds.filter(stillThere)
  const locked = today.locked.filter(stillThere)
  const changed = itemIds.length !== today.itemIds.length
  return {
    state: changed ? { ...today, itemIds, locked } : today,
    repick: changed || itemIds.length === 0,
  }
}
