import type { Table } from 'dexie'
import type { Backup, Snapshot } from '../backup/file'
import {
  type ClosetDB, type Forecast, type Item, type ItemId, type Settings, type TodayState,
  SETTINGS_KEY, defaultSettings, outfitKey, roundCoord, sortIds,
} from './schema'
import type { Occasion } from './values'

// The only write path in the app (DESIGN §7). Real changes bump changesSinceBackup in
// the same transaction as the write. Temporary state (hamper, "not today", occasion,
// location, today's outfit) is written without counting.

async function tracked<T>(db: ClosetDB, tables: Table[], fn: () => Promise<T>): Promise<T> {
  return db.transaction('rw', [...tables, db.settings], async () => {
    const result = await fn()
    const s = (await db.settings.get(SETTINGS_KEY)) ?? defaultSettings()
    await db.settings.put({ ...s, changesSinceBackup: s.changesSinceBackup + 1 }, SETTINGS_KEY)
    return result
  })
}

export type NewItem = Omit<Item, 'id' | 'inHamper' | 'createdAt'> & { photo?: Blob; mask?: Blob }
// `photo`: left out keeps the stored photo, null removes it, a Blob replaces it, together
// with its cutout `mask` if it has one.
export type ItemPatch = Partial<Omit<Item, 'id' | 'inHamper' | 'skipDate' | 'createdAt'>> & { photo?: Blob | null; mask?: Blob }

const photoRecord = (itemId: ItemId, blob: Blob, mask?: Blob) => ({ itemId, blob, ...(mask && { mask }) })

export const addItem = (db: ClosetDB, { photo, mask, ...item }: NewItem, now = new Date()) =>
  tracked(db, [db.items, db.photos], async () => {
    const id = await db.items.add({ ...item, inHamper: false, createdAt: now.toISOString() })
    if (photo) await db.photos.add(photoRecord(id, photo, mask))
    return id
  })

export const updateItem = (db: ClosetDB, id: ItemId, { photo, mask, ...patch }: ItemPatch) =>
  tracked(db, [db.items, db.photos], async () => {
    if (Object.keys(patch).length) await db.items.update(id, patch)
    if (photo === null) await db.photos.delete(id)
    else if (photo) await db.photos.put(photoRecord(id, photo, mask))
  })

export const deleteItem = (db: ClosetDB, id: ItemId) =>
  tracked(db, [db.items, db.photos, db.outfits], async () => {
    await db.items.delete(id)
    await db.photos.delete(id)
    await db.outfits.filter((o) => o.itemIds.includes(id)).delete() // dislikes for a deleted item are now orphans
  })

// `ids` is the outfit's base + shoes, never the coat (DESIGN §5, outfit identity).
export const dislikeOutfit = (db: ClosetDB, ids: ItemId[]) =>
  tracked(db, [db.outfits], async () => {
    await db.outfits.put({ key: outfitKey(ids), itemIds: sortIds(ids), rating: 'dislike' })
  })

// The way out when every outfit left has a 👎 (DESIGN §5 rule 10).
export const clearDislikes = (db: ClosetDB) =>
  tracked(db, [db.outfits], async () => { await db.outfits.clear() })

export const setComfortOffset = (db: ClosetDB, value: Settings['comfortOffset']) =>
  tracked(db, [], async () => { await db.settings.update(SETTINGS_KEY, { comfortOffset: value }) })

// Untracked (temporary state):
export const setInHamper = (db: ClosetDB, id: ItemId, value: boolean) =>
  db.items.update(id, { inHamper: value })

export const laundryDone = (db: ClosetDB) =>
  db.items.filter((i) => i.inHamper).modify({ inHamper: false })

export const skipToday = (db: ClosetDB, id: ItemId, today: string) =>
  db.items.update(id, { skipDate: today })

// Undoes Not today, from the "nothing fits" screen. Dexie deletes a field set to undefined.
export const wearToday = (db: ClosetDB, id: ItemId) =>
  db.items.update(id, { skipDate: undefined })

export const setLastOccasion = (db: ClosetDB, occasion: Occasion) =>
  db.settings.update(SETTINGS_KEY, { lastOccasion: occasion })

// A new place needs a new forecast, so today's saved one is dropped. The outfit stays.
export const setLocation = (db: ClosetDB, lat: number, lon: number, label?: string) =>
  db.transaction('rw', db.settings, async () => {
    const s = (await db.settings.get(SETTINGS_KEY))!
    const today = s.today && { ...s.today, forecast: undefined }
    await db.settings.update(SETTINGS_KEY, { location: { lat: roundCoord(lat), lon: roundCoord(lon), label }, today })
  })

// Saves today's outfit and locks. A forecast already saved for the same day is kept, so
// one arriving while an outfit is being picked isn't lost.
export const saveToday = (db: ClosetDB, next: Omit<TodayState, 'forecast'>) =>
  db.transaction('rw', db.settings, async () => {
    const s = (await db.settings.get(SETTINGS_KEY))!
    const today: TodayState = s.today?.date === next.date ? { ...s.today, ...next } : next
    await db.settings.update(SETTINGS_KEY, { today })
  })

// Keeps today's outfit when the date matches; on a new day `today` is replaced as a whole.
export const saveForecast = (db: ClosetDB, date: string, forecast: Forecast) =>
  db.transaction('rw', db.settings, async () => {
    const s = (await db.settings.get(SETTINGS_KEY))!
    const today = s.today?.date === date ? { ...s.today, forecast } : { date, itemIds: [], locked: [], forecast }
    await db.settings.update(SETTINGS_KEY, { today })
  })

// Backup (DESIGN Flow E and §7, "Backup file").

// Everything an export needs, read in one transaction so items, photos and dislikes agree.
// Each item carries its photo, as in the backup file.
export const readSnapshot = (db: ClosetDB): Promise<Snapshot> =>
  db.transaction('r', [db.items, db.photos, db.outfits, db.settings], async () => {
    const photos = new Map((await db.photos.toArray()).map((p) => [p.itemId, p]))
    const items = await db.items.orderBy('id').toArray()
    return {
      settings: (await db.settings.get(SETTINGS_KEY))!,
      items: items.map((i) => {
        const p = photos.get(i.id)
        return p ? { ...i, photo: p.blob, ...(p.mask && { mask: p.mask }) } : i
      }),
      outfits: await db.outfits.toArray(),
    }
  })

// After a save, only the changes made since the snapshot are left to back up.
export const markBackedUp = (db: ClosetDB, changesInBackup: number, now = new Date()) =>
  db.transaction('rw', db.settings, async () => {
    const s = (await db.settings.get(SETTINGS_KEY))!
    await db.settings.update(SETTINGS_KEY, {
      lastBackupAt: now.toISOString(),
      changesSinceBackup: Math.max(0, s.changesSinceBackup - changesInBackup),
    })
  })

// All or nothing: clears the closet and writes the backup with its original IDs, so
// dislikes still point at the right items. `today` is cleared.
export const importBackup = (db: ClosetDB, backup: Backup, now = new Date()) =>
  db.transaction('rw', [db.items, db.photos, db.outfits, db.settings], async () => {
    await db.items.clear()
    await db.photos.clear()
    await db.outfits.clear()
    await db.items.bulkAdd(backup.items.map(({ photo: _photo, mask: _mask, ...item }) => item))
    await db.photos.bulkAdd(backup.items.filter((i) => i.photo).map((i) => photoRecord(i.id, i.photo!, i.mask)))
    await db.outfits.bulkPut(backup.outfits.map((o) => ({ key: outfitKey(o.itemIds), itemIds: sortIds(o.itemIds), rating: o.rating })))
    await db.settings.put({ ...backup.settings, lastBackupAt: now.toISOString(), changesSinceBackup: 0 }, SETTINGS_KEY)
  })

// Creates the settings row with defaults on first launch, inside one transaction so
// StrictMode's doubled effect can't make a second add() throw (DESIGN §8 step 1).
// Also asks the browser, on every launch, not to evict the app's data.
export async function ensureSettings(db: ClosetDB): Promise<Settings> {
  const s = await db.transaction('rw', db.settings, async () => {
    const existing = await db.settings.get(SETTINGS_KEY)
    if (existing) return existing
    const fresh = defaultSettings()
    await db.settings.add(fresh, SETTINGS_KEY)
    return fresh
  })
  await globalThis.navigator?.storage?.persist?.()
  return s
}
