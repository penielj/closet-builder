import { beforeEach, describe, expect, it } from 'vitest'
import Dexie from 'dexie'
import { ClosetDB, SETTINGS_KEY } from './schema'
import {
  type NewItem, addItem, clearDislikes, deleteItem, forgetDislike, dislikeOutfit, ensureSettings, laundryDone, saveForecast, saveToday,
  setComfortOffset, setInHamper, setLastOccasion, setLocation, skipToday, undoWear, updateItem, wearOutfit, wearToday,
} from './repo'

let db: ClosetDB
let dbCount = 0
beforeEach(async () => {
  db = new ClosetDB(`repo-test-${++dbCount}`)
  await ensureSettings(db)
})

const shirt: NewItem = {
  name: 'White shirt', category: 'top', color: 'white', pattern: 'solid',
  occasions: ['work'], seasons: [], warmth: 1,
}
const changes = async () => (await db.settings.get(SETTINGS_KEY))!.changesSinceBackup

describe('ensureSettings', () => {
  it('creates the DESIGN §7 first-launch defaults once', async () => {
    expect(await db.settings.get(SETTINGS_KEY)).toEqual({
      comfortOffset: 0, lastOccasion: 'casual', changesSinceBackup: 0,
    })
    await setComfortOffset(db, 3)
    expect((await ensureSettings(db)).comfortOffset).toBe(3) // doesn't reset an existing row
  })

  it('survives being called twice at once, as StrictMode does', async () => {
    const fresh = new ClosetDB(`repo-test-${++dbCount}`)
    await Promise.all([ensureSettings(fresh), ensureSettings(fresh)])
    expect(await fresh.settings.count()).toBe(1)
  })
})

describe('change tracking (DESIGN §7)', () => {
  it('counts adding, editing and deleting items', async () => {
    const id = await addItem(db, shirt)
    await updateItem(db, id, { name: 'Ivory shirt' })
    await deleteItem(db, id)
    expect(await changes()).toBe(3)
  })

  it('counts dislikes, forgetting them, and the comfort setting', async () => {
    await dislikeOutfit(db, [1, 2])
    await clearDislikes(db)
    await setComfortOffset(db, -3)
    expect(await changes()).toBe(3)
    expect(await db.outfits.count()).toBe(0)
  })

  it('does not count the hamper, laundry, "not today", occasion, location or today', async () => {
    const id = await addItem(db, shirt)
    await setInHamper(db, id, true)
    await laundryDone(db)
    await skipToday(db, id, '2026-10-21')
    await setLastOccasion(db, 'work')
    await setLocation(db, 51.5074, -0.1278, 'London')
    await saveToday(db, { date: '2026-10-21', itemIds: [id], locked: [] })
    await saveForecast(db, '2026-10-21', { high: 14, low: 6, rainChance: 20 })
    expect(await changes()).toBe(1) // only the add
  })

  it('rolls the counter back with the write when the write fails', async () => {
    const id = await addItem(db, shirt)
    await expect(addItem(db, { ...shirt, id } as NewItem)).rejects.toThrow() // duplicate key
    expect(await changes()).toBe(1)
  })
})

describe('items', () => {
  it('new items start out of the hamper with a createdAt time', async () => {
    const now = new Date('2026-10-21T08:00:00.000Z')
    const item = (await db.items.get(await addItem(db, shirt, now)))!
    expect(item.inHamper).toBe(false)
    expect(item.createdAt).toBe('2026-10-21T08:00:00.000Z')
  })

  it('wear today undoes Not today, without counting as a change', async () => {
    const id = await addItem(db, shirt)
    await skipToday(db, id, '2026-10-28')
    await wearToday(db, id)
    expect(await db.items.get(id)).not.toHaveProperty('skipDate')
    expect(await changes()).toBe(1) // only the add
  })

  it('laundry done empties the whole hamper', async () => {
    const ids = await Promise.all([1, 2, 3].map((n) => addItem(db, { ...shirt, name: `Shirt ${n}` })))
    for (const id of ids) await setInHamper(db, id, true)
    await laundryDone(db)
    expect((await db.items.toArray()).filter((i) => i.inHamper)).toHaveLength(0)
  })

  it('deleting an item removes dislikes that include it and keeps the others', async () => {
    const a = await addItem(db, shirt)
    await dislikeOutfit(db, [a, 50])
    await dislikeOutfit(db, [60, 70])
    await deleteItem(db, a)
    expect((await db.outfits.toArray()).map((o) => o.key)).toEqual(['60|70'])
  })

  it('stores location rounded to 2 decimals', async () => {
    await setLocation(db, 51.507351, -0.127758, 'London')
    expect((await db.settings.get(SETTINGS_KEY))!.location).toEqual({ lat: 51.51, lon: -0.13, label: 'London' })
  })

})

describe('photos (DESIGN §7, own table)', () => {
  const jpeg = (seed: number) => new Blob([Uint8Array.from({ length: 5000 }, (_, i) => (i * seed) & 0xff)], { type: 'image/jpeg' })
  const stored = async (id: number) => (await db.photos.get(id))?.blob

  it('stores a photo Blob byte-for-byte, outside the item record', async () => {
    const blob = jpeg(1)
    const id = await addItem(db, { ...shirt, photo: blob })
    const photo = (await stored(id))!
    expect(photo.type).toBe('image/jpeg')
    expect(new Uint8Array(await photo.arrayBuffer())).toEqual(new Uint8Array(await blob.arrayBuffer()))
    expect(await db.items.get(id)).not.toHaveProperty('photo')
  })

  it('hamper, laundry done, "not today" and edits without a photo never write the photos table', async () => {
    const id = await addItem(db, { ...shirt, photo: jpeg(1) })
    const writes: string[] = []
    db.photos.hook('creating', () => { writes.push('create') })
    db.photos.hook('updating', () => { writes.push('update') })
    db.photos.hook('deleting', () => { writes.push('delete') })
    await setInHamper(db, id, true)
    await laundryDone(db)
    await skipToday(db, id, '2026-10-28')
    await updateItem(db, id, { name: 'Ivory shirt' })
    expect(writes).toEqual([])
    expect(await stored(id)).toBeDefined()
  })

  it('an edit can replace or remove the photo, and deleting the item deletes it', async () => {
    const id = await addItem(db, { ...shirt, photo: jpeg(1) })
    await updateItem(db, id, { photo: jpeg(3) })
    expect(await (await stored(id))!.arrayBuffer()).toEqual(await jpeg(3).arrayBuffer())
    await updateItem(db, id, { photo: null })
    expect(await stored(id)).toBeUndefined()
    await updateItem(db, id, { photo: jpeg(5) })
    await deleteItem(db, id)
    expect(await db.photos.count()).toBe(0)
  })
})

describe('dislikes', () => {
  it('uses one key per outfit regardless of order, sorted numerically', async () => {
    await dislikeOutfit(db, [10, 9, 100])
    await dislikeOutfit(db, [100, 10, 9])
    expect(await db.outfits.toArray()).toEqual([{ key: '9|10|100', itemIds: [9, 10, 100], rating: 'dislike' }])
  })
})

describe('today', () => {
  const settings = async () => (await db.settings.get(SETTINGS_KEY))!

  it('keeps the outfit when a forecast arrives the same day', async () => {
    await saveToday(db, { date: '2026-10-21', itemIds: [1, 2, 3], locked: [2] })
    await saveForecast(db, '2026-10-21', { high: 14, low: 6, rainChance: 20 })
    expect((await settings()).today).toEqual({
      date: '2026-10-21', itemIds: [1, 2, 3], locked: [2], forecast: { high: 14, low: 6, rainChance: 20 },
    })
  })

  it('replaces today as a whole when the forecast is for a new day', async () => {
    await saveToday(db, { date: '2026-10-21', itemIds: [1, 2, 3], locked: [2] })
    await saveForecast(db, '2026-10-22', { high: 9, low: 2, rainChance: 70 })
    expect((await settings()).today).toEqual({
      date: '2026-10-22', itemIds: [], locked: [], forecast: { high: 9, low: 2, rainChance: 70 },
    })
  })

  it('keeps a same-day forecast when the outfit is saved after it', async () => {
    await saveForecast(db, '2026-10-21', { high: 14, low: 6, rainChance: 20 })
    await saveToday(db, { date: '2026-10-21', itemIds: [1, 2], locked: [1] })
    expect((await settings()).today).toEqual({
      date: '2026-10-21', itemIds: [1, 2], locked: [1], forecast: { high: 14, low: 6, rainChance: 20 },
    })
    await saveToday(db, { date: '2026-10-22', itemIds: [3, 4], locked: [] })
    expect((await settings()).today).toEqual({ date: '2026-10-22', itemIds: [3, 4], locked: [] })
  })

  it('a new location drops the saved forecast but keeps the outfit', async () => {
    await saveForecast(db, '2026-10-21', { high: 14, low: 6, rainChance: 20 })
    await saveToday(db, { ...(await settings()).today!, itemIds: [1, 2] })
    await setLocation(db, 40.7128, -74.006, 'New York')
    expect((await settings()).today).toEqual({ date: '2026-10-21', itemIds: [1, 2], locked: [] })
  })
})

describe('v2 migration (DESIGN §8 step 1 cleanup)', () => {
  it('drops color modes, lastBackupSource and liked outfits', async () => {
    const name = `repo-test-${++dbCount}`
    const v1 = new Dexie(name)
    v1.version(1).stores({ items: '++id, category, createdAt', outfits: 'key', settings: '' })
    await v1.table('settings').add(
      { comfortOffset: 0, lastOccasion: 'work', lastColorMode: 'tonal', lastBackupSource: 'share', changesSinceBackup: 4 },
      SETTINGS_KEY)
    await v1.table('outfits').bulkAdd([
      { key: '1|2', itemIds: [1, 2], rating: 'like' },
      { key: '3|4', itemIds: [3, 4], rating: 'dislike' },
    ])
    v1.close()

    const v2 = new ClosetDB(name)
    expect(await v2.settings.get(SETTINGS_KEY)).toEqual({ comfortOffset: 0, lastOccasion: 'work', changesSinceBackup: 4 })
    expect((await v2.outfits.toArray()).map((o) => o.key)).toEqual(['3|4'])
  })
})

describe('v3 migration (DESIGN §8 step 4, hamper bug)', () => {
  it('moves each photo into the photos table and off its item', async () => {
    const name = `repo-test-${++dbCount}`
    const v2 = new Dexie(name)
    v2.version(2).stores({ items: '++id, category, createdAt', outfits: 'key', settings: '' })
    const bytes = Uint8Array.from({ length: 5000 }, (_, i) => i & 0xff)
    await v2.table('items').bulkAdd([
      { ...shirt, inHamper: true, createdAt: '2026-10-21T08:00:00.000Z', photo: new Blob([bytes], { type: 'image/jpeg' }) },
      { ...shirt, name: 'No photo', inHamper: false, createdAt: '2026-10-21T08:00:00.000Z' },
    ])
    v2.close()

    const v3 = new ClosetDB(name)
    const [withPhoto, without] = await v3.items.orderBy('id').toArray()
    expect(withPhoto).not.toHaveProperty('photo')
    expect(withPhoto.inHamper).toBe(true)
    const photo = (await v3.photos.get(withPhoto.id))!.blob
    expect(photo.type).toBe('image/jpeg')
    expect(new Uint8Array(await photo.arrayBuffer())).toEqual(bytes)
    expect(await v3.photos.get(without.id)).toBeUndefined()
  })
})

describe('forgetting one 👎', () => {
  it('removes just that outfit and counts as a change', async () => {
    await dislikeOutfit(db, [1, 2])
    await dislikeOutfit(db, [3, 4])
    const before = await changes()
    await forgetDislike(db, '1|2')
    expect((await db.outfits.toArray()).map((o) => o.key)).toEqual(['3|4'])
    expect(await changes()).toBe(before + 1)
  })
})

describe('wear tracking (rule 16)', () => {
  it('counts a wear, sends pieces at their limit to the hamper, and marks today worn', async () => {
    const tee = await addItem(db, shirt) // a top: 1 wear
    const jeans = await addItem(db, { ...shirt, name: 'Jeans', category: 'bottom', washAfter: 2 })
    const shoes = await addItem(db, { ...shirt, name: 'Sneakers', category: 'shoes' }) // never
    await saveToday(db, { date: '2026-10-28', itemIds: [tee, jeans, shoes], locked: [] })
    const before = await changes()

    expect(await wearOutfit(db, [tee, jeans, shoes], '2026-10-28')).toEqual([tee])
    expect(await db.items.get(jeans)).toMatchObject({ wears: 1, lastWorn: '2026-10-28', inHamper: false })
    expect(await db.items.get(tee)).toMatchObject({ wears: 1, inHamper: true })
    expect((await db.settings.get(SETTINGS_KEY))!.today!.worn).toBe(true)
    expect(await wearOutfit(db, [jeans, shoes], '2026-10-29')).toEqual([jeans])
    expect((await db.items.get(shoes))!.wears).toBe(2)
    expect(await changes()).toBe(before) // like the hamper, not a real change
  })

  it('starts counting again once a piece leaves the hamper', async () => {
    const a = await addItem(db, shirt), b = await addItem(db, shirt)
    await wearOutfit(db, [a, b], '2026-10-28')
    await setInHamper(db, a, false)
    await laundryDone(db)
    expect((await db.items.toArray()).map((i) => [i.inHamper, i.wears])).toEqual([[false, 0], [false, 0]])
  })
})

describe('taking Wore this back (rule 16)', () => {
  it('Undo restores wears, last worn and the hamper exactly, and frees the outfit', async () => {
    const tee = await addItem(db, shirt)
    const jeans = await addItem(db, { ...shirt, name: 'Jeans', category: 'bottom' })
    await wearOutfit(db, [jeans], '2026-10-27')
    const before = await db.items.toArray()
    await saveToday(db, { date: '2026-10-28', itemIds: [tee, jeans], locked: [] })
    await wearOutfit(db, [tee, jeans], '2026-10-28')
    expect((await db.items.get(tee))!.inHamper).toBe(true)

    await undoWear(db, '2026-10-28')
    expect(await db.items.toArray()).toEqual(before)
    const today = (await db.settings.get(SETTINGS_KEY))!.today!
    expect(today.worn).toBe(false)
    expect(today.wornBefore).toBeUndefined()
  })
})
