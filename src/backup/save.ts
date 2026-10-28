import { localDate } from '../closet/daily'
import type { Settings } from '../db/schema'

// DESIGN §7 "Saving": the share sheet where it can take a file, otherwise a download.
// The installed iPhone app never downloads, because that can fail there without a word.
// Call this straight from a tap: iOS only opens the share sheet right after one.
export type SaveOutcome = 'saved' | 'cancelled'

const installedIos = (globalThis.navigator as (Navigator & { standalone?: boolean }) | undefined)?.standalone === true

export async function saveFile(file: File): Promise<SaveOutcome> {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return 'saved'
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled' // spike 0.2: cancelling rejects with AbortError
      throw e
    }
  }
  if (installedIos) throw new Error("This phone can't share files from the app, so the backup wasn't saved.")
  const url = URL.createObjectURL(file)
  const a = Object.assign(document.createElement('a'), { href: url, download: file.name })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return 'saved'
}

// "Last backup: 12 days ago · 9 changes since" (DESIGN Flow E), counted in local days.
export function backupStatus(s: Pick<Settings, 'lastBackupAt' | 'changesSinceBackup'>, now = new Date()): string {
  const n = s.changesSinceBackup
  const changes = `${n} ${n === 1 ? 'change' : 'changes'}`
  if (!s.lastBackupAt) return `Never backed up · ${changes}`
  const days = Math.round((Date.parse(localDate(now)) - Date.parse(localDate(new Date(s.lastBackupAt)))) / 86_400_000)
  const when = days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`
  return `Last backup: ${when} · ${changes} since`
}
