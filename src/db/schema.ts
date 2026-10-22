import Dexie, { type EntityTable, type Table } from 'dexie'
import type { Category, ColorMode, Occasion, PaletteColor, Pattern, Season, Warmth } from './values'

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
  photo?: Blob
  inHamper: boolean
  skipDate?: string // YYYY-MM-DD
  createdAt: string // ISO
}

export interface Outfit {
  key: string // item ids sorted numerically, joined with '|'
  itemIds: ItemId[]
  rating?: 'like' | 'dislike'
}

export interface Settings {
  comfortOffset: -3 | 0 | 3
  lastOccasion: Occasion
  lastColorMode: ColorMode
  location?: { lat: number; lon: number; label?: string } // stored rounded to 2 decimals
  lastBackupAt?: string
  lastBackupSource?: 'share' | 'download' | 'restore'
  changesSinceBackup: number
}

export const SETTINGS_KEY = 'settings' // outbound key: the model needs no id field

export const defaultSettings = (): Settings => ({
  comfortOffset: 0,
  lastOccasion: 'casual',
  lastColorMode: 'auto',
  changesSinceBackup: 0,
})

export class ClosetDB extends Dexie {
  items!: EntityTable<Item, 'id'>
  outfits!: Table<Outfit, string>
  settings!: Table<Settings, string>

  constructor(name = 'closet') {
    super(name)
    // inHamper isn't indexed: booleans aren't valid IndexedDB keys, and the hamper is
    // filtered in memory, which is fine at this closet size.
    this.version(1).stores({ items: '++id, category, createdAt', outfits: 'key', settings: '' })
  }
}

// Numeric sort: the default sort would put 10 before 9 and give one outfit two keys.
export const sortIds = (ids: ItemId[]) => [...ids].sort((a, b) => a - b)
export const outfitKey = (ids: ItemId[]) => sortIds(ids).join('|')

// About 1km. Weather doesn't need more, and the backup never holds a precise home location.
export const roundCoord = (n: number) => Math.round(n * 100) / 100
