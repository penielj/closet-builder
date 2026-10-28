import { z } from 'zod'
import type { Item, Outfit, Settings } from '../db/schema'
import { CATEGORIES, COLOR_NAMES, OCCASIONS, PATTERNS, SEASONS } from '../db/values'

// The backup file of DESIGN §7: one JSON file with the photos embedded as base64.
// Checks happen before anything is written: `app` and `version` first, then zod.

export const BACKUP_APP = 'closet-builder'
export const BACKUP_VERSION = 1

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

const itemSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  category: z.enum(CATEGORIES),
  color: z.enum(COLOR_NAMES as [string, ...string[]]),
  pattern: z.enum(PATTERNS),
  occasions: z.array(z.enum(OCCASIONS)).min(1),
  seasons: z.array(z.enum(SEASONS)),
  warmth: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  brand: z.string().optional(),
  photo: z.string().startsWith('data:image/').optional(),
  inHamper: z.boolean(),
  skipDate: date.optional(),
  createdAt: z.string(),
})

const settingsSchema = z.object({
  comfortOffset: z.union([z.literal(-3), z.literal(0), z.literal(3)]),
  lastOccasion: z.enum(OCCASIONS),
  location: z.object({ lat: z.number(), lon: z.number(), label: z.string().optional() }).optional(),
  lastBackupAt: z.string().optional(),
  changesSinceBackup: z.number().int().nonnegative(),
})

const outfitSchema = z.object({
  itemIds: z.array(z.number().int().positive()).min(1),
  rating: z.literal('dislike'),
})

const backupSchema = z.object({
  app: z.literal(BACKUP_APP),
  version: z.literal(BACKUP_VERSION),
  exportedAt: z.string(),
  settings: settingsSchema,
  items: z.array(itemSchema).refine((items) => new Set(items.map((i) => i.id)).size === items.length, 'Two items share an ID.'),
  outfits: z.array(outfitSchema),
})

// In the file each item carries its photo; in the database photos have their own table.
export type ItemWithPhoto = Item & { photo?: Blob }

// What import writes: items with their photos decoded back to Blobs.
export interface Backup {
  settings: Omit<Settings, 'today'>
  items: ItemWithPhoto[]
  outfits: Omit<Outfit, 'key'>[]
}

export interface Snapshot { settings: Settings; items: ItemWithPhoto[]; outfits: Outfit[] }

export const backupFileName = (localDate: string) => `closet-${localDate}.closet.json`

// Built from BlobParts, one photo encoded at a time, so the whole file is never one
// giant string (spike 0.2: 150 items, 19MB, well under a second on an iPhone 16).
export async function buildBackupFile(snapshot: Snapshot, fileName: string, now = new Date()): Promise<File> {
  const { today: _today, ...settings } = snapshot.settings // `today` is never backed up
  const head = { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: now.toISOString(), settings }
  const parts: string[] = [JSON.stringify(head).slice(0, -1), ',"items":[']
  for (const [n, { photo, ...item }] of snapshot.items.entries()) {
    const record = photo ? { ...item, photo: await blobToDataUrl(photo) } : item
    parts.push(n ? ',' : '', JSON.stringify(record))
  }
  const outfits = snapshot.outfits.map(({ itemIds, rating }) => ({ itemIds, rating }))
  parts.push('],"outfits":', JSON.stringify(outfits), '}')
  return new File(parts, fileName, { type: 'application/json' })
}

export class BackupError extends Error {}

// Throws a BackupError with a message that can be shown as-is.
export function parseBackup(text: string): Backup {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new BackupError("This file isn't a complete Closet Builder backup. It may be damaged or cut short.")
  }
  const head = json as { app?: unknown; version?: unknown } | null
  if (head?.app !== BACKUP_APP) throw new BackupError("This file isn't a Closet Builder backup.")
  if (typeof head.version !== 'number' || head.version > BACKUP_VERSION) {
    throw new BackupError('This backup is from a newer version of Closet Builder. Update the app, then try again.')
  }
  const parsed = backupSchema.safeParse(json)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    throw new BackupError(`This backup is damaged (${issue.path.join('.') || 'file'}: ${issue.message}). Nothing was changed.`)
  }
  const { settings, items, outfits } = parsed.data
  return {
    settings,
    items: items.map(({ photo, ...item }) => ({ ...item, ...(photo && { photo: dataUrlToBlob(photo) }) }) as ItemWithPhoto),
    outfits,
  }
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return `data:${blob.type};base64,${btoa(bin)}`
}

export function dataUrlToBlob(url: string): Blob {
  const comma = url.indexOf(',')
  const meta = url.slice(5, comma) // e.g. image/jpeg;base64
  let bin: string
  try {
    bin = atob(url.slice(comma + 1))
  } catch {
    throw new BackupError('A photo in this backup is damaged. Nothing was changed.')
  }
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: meta.split(';')[0] })
}
