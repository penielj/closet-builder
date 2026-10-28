import { beforeEach, describe, expect, it } from 'vitest'
import { ClosetDB, SETTINGS_KEY } from '../db/schema'
import {
  type NewItem, addItem, dislikeOutfit, ensureSettings, importBackup, markBackedUp, readSnapshot,
  saveToday, setComfortOffset, setInHamper,
} from '../db/repo'
import { BACKUP_VERSION, BackupError, backupFileName, buildBackupFile, parseBackup } from './file'
import { backupStatus } from './save'

let dbCount = 0
const freshDb = async () => {
  const db = new ClosetDB(`backup-test-${++dbCount}`)
  await ensureSettings(db)
  return db
}

const photo = (seed: number) => new Blob([new Uint8Array(5000).map((_, i) => (i * seed) % 256)], { type: 'image/jpeg' })
const item = (over: Partial<NewItem>): NewItem => ({
  name: 'Thing', category: 'top', color: 'black', pattern: 'solid', occasions: ['casual'], seasons: [], warmth: 2, ...over,
})

let db: ClosetDB
let ids: number[]
beforeEach(async () => {
  db = await freshDb()
  ids = [
    await addItem(db, item({ name: 'Shirt', photo: photo(3), brand: 'Uniqlo', seasons: ['summer'] })),
    await addItem(db, item({ name: 'Chinos', category: 'bottom', color: 'beige', photo: photo(7) })),
    await addItem(db, item({ name: 'Boots', category: 'shoes', color: 'brown', warmth: 3 })), // no photo
  ]
  await setInHamper(db, ids[1], true)
  await dislikeOutfit(db, [ids[0], ids[1], ids[2]])
  await setComfortOffset(db, 3)
  await saveToday(db, { date: '2026-10-27', itemIds: ids, locked: [ids[0]] })
})

const exportText = async (from: ClosetDB) =>
  (await buildBackupFile(await readSnapshot(from), backupFileName('2026-10-27'))).text()

const bytes = async (b?: Blob) => (b ? [...new Uint8Array(await b.arrayBuffer())] : undefined)

describe('backup round trip (DESIGN §10)', () => {
  it('gives back identical items, photos and dislikes, and clears today', async () => {
    const target = await freshDb()
    await addItem(target, item({ name: 'Old phone item' }))
    await importBackup(target, parseBackup(await exportText(db)), new Date('2026-10-27T09:00:00Z'))

    expect(await target.items.orderBy('id').toArray()).toEqual(await db.items.orderBy('id').toArray()) // same IDs too
    const before = (await readSnapshot(db)).items
    const after = (await readSnapshot(target)).items
    for (const [n, i] of after.entries()) {
      expect(await bytes(i.photo)).toEqual(await bytes(before[n].photo))
      expect(i.photo?.type).toBe(before[n].photo?.type)
    }
    expect(after[2].photo).toBeUndefined()
    expect(await target.photos.count()).toBe(2)
    expect(await target.outfits.toArray()).toEqual(await db.outfits.toArray())

    const s = (await target.settings.get(SETTINGS_KEY))!
    expect(s.today).toBeUndefined()
    expect(s.comfortOffset).toBe(3)
    expect(s.lastBackupAt).toBe('2026-10-27T09:00:00.000Z')
    expect(s.changesSinceBackup).toBe(0)
  })

  it('writes the DESIGN §7 file shape, without today', async () => {
    const json = JSON.parse(await exportText(db))
    expect(json).toMatchObject({ app: 'closet-builder', version: 1, outfits: [{ itemIds: ids, rating: 'dislike' }] })
    expect(json.settings.today).toBeUndefined()
    expect(json.items[0].photo).toMatch(/^data:image\/jpeg;base64,/)
    expect(json.outfits[0].key).toBeUndefined()
    expect(backupFileName('2026-10-27')).toBe('closet-2026-10-27.closet.json')
  })

  it('a truncated, foreign, newer or invalid file is refused before anything changes', async () => {
    const text = await exportText(db)
    const json = JSON.parse(text)
    const bad = [
      text.slice(0, text.length / 2),
      JSON.stringify({ ...json, app: 'something-else' }),
      JSON.stringify({ ...json, version: BACKUP_VERSION + 1 }),
      JSON.stringify({ ...json, items: [{ ...json.items[0], category: 'scarf' }] }),
      JSON.stringify({ ...json, items: [json.items[0], json.items[0]] }),
      JSON.stringify({ ...json, items: [{ ...json.items[0], occasions: [] }] }),
    ]
    for (const t of bad) expect(() => parseBackup(t)).toThrow(BackupError)
    expect(() => parseBackup(bad[2])).toThrow(/newer version/)
  })

  it('is all or nothing: a failed write leaves the closet as it was', async () => {
    const target = await freshDb()
    const keep = await addItem(target, item({ name: 'Keep me' }))
    const backup = parseBackup(await exportText(db))
    backup.items.push({ ...backup.items[0] }) // same ID twice: bulkAdd throws mid-transaction
    await expect(importBackup(target, backup)).rejects.toThrow()
    expect((await target.items.toArray()).map((i) => i.id)).toEqual([keep])
  })
})

describe('backup status (DESIGN Flow E)', () => {
  it('after a save, keeps only the changes made since the snapshot', async () => {
    const snapshot = await readSnapshot(db)
    await addItem(db, item({ name: 'Added while saving' }))
    await markBackedUp(db, snapshot.settings.changesSinceBackup, new Date('2026-10-27T09:00:00Z'))
    const s = (await db.settings.get(SETTINGS_KEY))!
    expect(s.changesSinceBackup).toBe(1)
    expect(s.lastBackupAt).toBe('2026-10-27T09:00:00.000Z')
  })

  it('reads "Last backup: 12 days ago · 9 changes since"', () => {
    const now = new Date(2026, 9, 27, 8)
    expect(backupStatus({ changesSinceBackup: 0 }, now)).toBe('Never backed up · 0 changes')
    expect(backupStatus({ lastBackupAt: new Date(2026, 9, 15, 23).toISOString(), changesSinceBackup: 9 }, now))
      .toBe('Last backup: 12 days ago · 9 changes since')
    expect(backupStatus({ lastBackupAt: new Date(2026, 9, 26, 23).toISOString(), changesSinceBackup: 1 }, now))
      .toBe('Last backup: yesterday · 1 change since')
    expect(backupStatus({ lastBackupAt: new Date(2026, 9, 27, 1).toISOString(), changesSinceBackup: 2 }, now))
      .toBe('Last backup: today · 2 changes since')
  })
})

describe('cutout masks (DESIGN §4 "Look")', () => {
  it('survive export and import, and a photo without one stays without', async () => {
    const mask = new Blob([new Uint8Array(800).map((_, i) => i % 256)], { type: 'image/png' })
    const id = await addItem(db, item({ name: 'Cut out', photo: photo(5), mask }))
    const target = await freshDb()
    await importBackup(target, parseBackup(await exportText(db)))
    expect(await bytes((await target.photos.get(id))!.mask)).toEqual(await bytes(mask))
    expect((await target.photos.get(ids[0]))!.mask).toBeUndefined()
  })
})
