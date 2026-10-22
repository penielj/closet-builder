import type { Table } from 'dexie'
import {
  type ClosetDB, type Item, type ItemId, type Settings,
  SETTINGS_KEY, defaultSettings, outfitKey, roundCoord, sortIds,
} from './schema'

// The only write path in the app (BACKUP-IMPLEMENTATION §3.6). Meaningful changes bump
// changesSinceBackup in the same transaction as the write. Temporary state (hamper,
// "not today", remembered occasion and color mode) is written without counting.

async function tracked<T>(db: ClosetDB, tables: Table[], fn: () => Promise<T>): Promise<T> {
  return db.transaction('rw', [...tables, db.settings], async () => {
    const result = await fn()
    const s = (await db.settings.get(SETTINGS_KEY)) ?? defaultSettings()
    await db.settings.put({ ...s, changesSinceBackup: s.changesSinceBackup + 1 }, SETTINGS_KEY)
    return result
  })
}

export type NewItem = Omit<Item, 'id' | 'inHamper' | 'createdAt'>
export type ItemPatch = Partial<Omit<Item, 'id' | 'inHamper' | 'skipDate' | 'createdAt'>>

export const addItem = (db: ClosetDB, item: NewItem, now = new Date()) =>
  tracked(db, [db.items], () =>
    db.items.add({ ...item, inHamper: false, createdAt: now.toISOString() }))

export const updateItem = (db: ClosetDB, id: ItemId, patch: ItemPatch) =>
  tracked(db, [db.items], async () => { await db.items.update(id, patch) })

export const deleteItem = (db: ClosetDB, id: ItemId) =>
  tracked(db, [db.items, db.outfits], async () => {
    await db.items.delete(id)
    await db.outfits.filter((o) => o.itemIds.includes(id)).delete() // ratings for a deleted item are now orphans
  })

export const rateOutfit = (db: ClosetDB, ids: ItemId[], rating: 'like' | 'dislike') =>
  tracked(db, [db.outfits], async () => {
    await db.outfits.put({ key: outfitKey(ids), itemIds: sortIds(ids), rating })
  })

export const setComfortOffset = (db: ClosetDB, value: Settings['comfortOffset']) =>
  tracked(db, [], async () => { await db.settings.update(SETTINGS_KEY, { comfortOffset: value }) })

// Untracked (temporary state):
export const setInHamper = (db: ClosetDB, id: ItemId, value: boolean) =>
  db.items.update(id, { inHamper: value })

export const laundryDone = (db: ClosetDB) =>
  db.items.filter((i) => i.inHamper).modify({ inHamper: false })

export const skipToday = (db: ClosetDB, id: ItemId, today: string) =>
  db.items.update(id, { skipDate: today })

export const rememberChoices = (db: ClosetDB, choices: Partial<Pick<Settings, 'lastOccasion' | 'lastColorMode'>>) =>
  db.settings.update(SETTINGS_KEY, choices)

export const setLocation = (db: ClosetDB, lat: number, lon: number, label?: string) =>
  db.settings.update(SETTINGS_KEY, { location: { lat: roundCoord(lat), lon: roundCoord(lon), label } })

// Creates the settings row with defaults on first launch and asks the browser not to
// evict the app's data under storage pressure.
export async function ensureSettings(db: ClosetDB): Promise<Settings> {
  const existing = await db.settings.get(SETTINGS_KEY)
  if (existing) return existing
  const s = defaultSettings()
  await db.settings.add(s, SETTINGS_KEY)
  await globalThis.navigator?.storage?.persist?.()
  return s
}
