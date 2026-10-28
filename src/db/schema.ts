import Dexie, { type EntityTable, type Table } from 'dexie'
import type { Category, Occasion, PaletteColor, Pattern, Season, Warmth } from './values'

// Field-for-field the DESIGN §7 data model.
export type ItemId = number // Dexie auto-increment (++id); kept as-is on restore

export interface Item {
  id: ItemId
  name: string
  category: Category
  color: PaletteColor
  pattern: Pattern
  occasions: Occasion[]
  seasons: Season[]
  warmth: Warmth
  brand?: string
  inHamper: boolean
  skipDate?: string // YYYY-MM-DD
  createdAt: string // ISO
}

// Photos live in their own table, so hamper and "not today" writes never rewrite a photo
// (DESIGN §7, "Why photos have their own table").
export interface ItemPhoto {
  itemId: ItemId
  blob: Blob // JPEG, the garment on white
  mask?: Blob // PNG from the cutout: gray level = how opaque, so the garment can sit on black too (DESIGN §4 "Look")
}

export interface Outfit {
  key: string // base + shoes ids sorted numerically, joined with '|'
  itemIds: ItemId[]
  rating: 'dislike'
}

export interface Forecast {
  high: number // °C, actual (not comfort-adjusted)
  low: number
  rainChance: number // 0–100
}

export interface Location { lat: number; lon: number; label?: string } // stored rounded to 2 decimals

// The outfit on screen today and its locks (DESIGN Flow C, "Today's outfit stays put").
export interface TodayState {
  date: string // YYYY-MM-DD, local
  itemIds: ItemId[] // incl. coat; empty until one is picked
  locked: ItemId[]
  forecast?: Forecast
}

export interface Settings {
  comfortOffset: -3 | 0 | 3
  lastOccasion: Occasion
  location?: Location
  lastBackupAt?: string
  changesSinceBackup: number
  today?: TodayState // never backed up
}

export const SETTINGS_KEY = 'settings' // outbound key: the model needs no id field

export const defaultSettings = (): Settings => ({
  comfortOffset: 0,
  lastOccasion: 'casual',
  changesSinceBackup: 0,
})

export class ClosetDB extends Dexie {
  items!: EntityTable<Item, 'id'>
  photos!: Table<ItemPhoto, ItemId>
  outfits!: Table<Outfit, string>
  settings!: Table<Settings, string>

  constructor(name = 'closet') {
    super(name)
    // inHamper isn't indexed: booleans aren't valid IndexedDB keys, and the hamper is
    // filtered in memory, which is fine at this closet size.
    this.version(1).stores({ items: '++id, category, createdAt', outfits: 'key', settings: '' })
    // v2 drops the v7 color modes, lastBackupSource and liked outfits (DESIGN §8 step 1).
    this.version(2).stores({}).upgrade(async (tx) => {
      await tx.table('outfits').filter((o) => o.rating !== 'dislike').delete()
      await tx.table('settings').toCollection().modify((s) => {
        delete s.lastColorMode
        delete s.lastBackupSource
      })
    })
    // v3 moves each item's photo into the photos table (DESIGN §8 step 4, hamper bug).
    this.version(3).stores({ photos: 'itemId' }).upgrade(async (tx) => {
      const withPhoto = (await tx.table('items').toArray()).filter((i) => i.photo)
      await tx.table('photos').bulkAdd(withPhoto.map((i) => ({ itemId: i.id, blob: i.photo })))
      await tx.table('items').toCollection().modify((i) => { delete i.photo })
    })
  }
}

// Numeric sort: the default sort would put 10 before 9 and give one outfit two keys.
export const sortIds = (ids: ItemId[]) => [...ids].sort((a, b) => a - b)
export const outfitKey = (ids: ItemId[]) => sortIds(ids).join('|')

// About 1km. Weather doesn't need more, and the backup never holds a precise home location.
export const roundCoord = (n: number) => Math.round(n * 100) / 100
