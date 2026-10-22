import { beforeEach, describe, expect, it } from 'vitest'
import { ClosetDB, SETTINGS_KEY } from './schema'
import {
  type NewItem, addItem, deleteItem, ensureSettings, laundryDone, rateOutfit, rememberChoices,
  setComfortOffset, setInHamper, setLocation, skipToday, updateItem,
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
      comfortOffset: 0, lastOccasion: 'casual', lastColorMode: 'auto', changesSinceBackup: 0,
    })
    await setComfortOffset(db, 3)
    expect((await ensureSettings(db)).comfortOffset).toBe(3) // doesn't reset an existing row
  })
})

describe('change tracking (BACKUP-IMPLEMENTATION §2.6)', () => {
  it('counts adding, editing and deleting items', async () => {
    const id = await addItem(db, shirt)
    await updateItem(db, id, { name: 'Ivory shirt' })
    await deleteItem(db, id)
    expect(await changes()).toBe(3)
  })

  it('counts ratings and the comfort setting', async () => {
    await rateOutfit(db, [1, 2, 3], 'like')
    await setComfortOffset(db, -3)
    expect(await changes()).toBe(2)
  })

  it('does not count the hamper, laundry, "not today", remembered choices or location', async () => {
    const id = await addItem(db, shirt)
    await setInHamper(db, id, true)
    await laundryDone(db)
    await skipToday(db, id, '2026-10-21')
    await rememberChoices(db, { lastOccasion: 'work', lastColorMode: 'tonal' })
    await setLocation(db, 51.5074, -0.1278, 'London')
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

  it('laundry done empties the whole hamper', async () => {
    const ids = await Promise.all([1, 2, 3].map((n) => addItem(db, { ...shirt, name: `Shirt ${n}` })))
    for (const id of ids) await setInHamper(db, id, true)
    await laundryDone(db)
    expect((await db.items.toArray()).filter((i) => i.inHamper)).toHaveLength(0)
  })

  it('deleting an item removes ratings that include it and keeps the others', async () => {
    const a = await addItem(db, shirt)
    await rateOutfit(db, [a, 50], 'dislike')
    await rateOutfit(db, [60, 70], 'like')
    await deleteItem(db, a)
    expect((await db.outfits.toArray()).map((o) => o.key)).toEqual(['60|70'])
  })

  it('stores location rounded to 2 decimals', async () => {
    await setLocation(db, 51.507351, -0.127758, 'London')
    expect((await db.settings.get(SETTINGS_KEY))!.location).toEqual({ lat: 51.51, lon: -0.13, label: 'London' })
  })

  it('stores a photo Blob byte-for-byte', async () => {
    const bytes = Uint8Array.from({ length: 5000 }, (_, i) => i & 0xff)
    const id = await addItem(db, { ...shirt, photo: new Blob([bytes], { type: 'image/jpeg' }) })
    const photo = (await db.items.get(id))!.photo!
    expect(photo.type).toBe('image/jpeg')
    expect(new Uint8Array(await photo.arrayBuffer())).toEqual(bytes)
  })
})

describe('ratings', () => {
  it('uses one key per outfit regardless of order, sorted numerically', async () => {
    await rateOutfit(db, [10, 9, 100], 'like')
    await rateOutfit(db, [100, 10, 9], 'dislike')
    expect(await db.outfits.toArray()).toEqual([{ key: '9|10|100', itemIds: [9, 10, 100], rating: 'dislike' }])
  })
})
