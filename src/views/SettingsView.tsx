import { useLiveQuery } from 'dexie-react-hooks'
import { type ChangeEvent, useRef, useState } from 'react'
import { BackupError, backupFileName, buildBackupFile, parseBackup } from '../backup/file'
import { backupStatus, saveFile } from '../backup/save'
import { localDate } from '../closet/daily'
import LocationPicker from '../components/LocationPicker'
import { db } from '../db'
import { forgetDislike, importBackup, markBackedUp, readSnapshot, setComfortOffset, updateItem } from '../db/repo'
import type { Settings } from '../db/schema'
import { cutout } from '../photo/cutout'
import { loadImage, processPhoto } from '../photo/resize'

// DESIGN Flow E.
const COMFORT: { value: Settings['comfortOffset']; label: string }[] = [
  { value: 3, label: 'I run cold' },
  { value: 0, label: 'Neutral' },
  { value: -3, label: 'I run warm' },
]

export default function SettingsView({ settings, itemCount }: { settings: Settings; itemCount: number }) {
  const [changingPlace, setChangingPlace] = useState(false)
  const { location } = settings

  return (
    <section className="settings">
      <div className="panel">
        <h2>Comfort</h2>
        <p className="muted">Running cold makes every temperature count as 3°C colder, so you get warmer outfits.</p>
        <div className="chips" role="radiogroup" aria-label="Comfort">
          {COMFORT.map((c) => (
            <button
              key={c.value} role="radio" aria-checked={settings.comfortOffset === c.value}
              className={`chip ${settings.comfortOffset === c.value ? 'on' : ''}`}
              onClick={() => setComfortOffset(db, c.value)}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="panel">
        <h2>Location</h2>
        {changingPlace
          ? <LocationPicker onDone={() => setChangingPlace(false)} onCancel={() => setChangingPlace(false)} />
          : (
            <p className="weather">
              <span>{location ? location.label ?? 'Your location' : 'Not set yet'}</span>
              <button className="link" onClick={() => setChangingPlace(true)}>Change</button>
            </p>
          )}
        <p className="muted">Used for the weather and the season. It's stored to about 1km.</p>
      </div>

      <Cutouts />
      <Dislikes />
      <Backup settings={settings} itemCount={itemCount} />
    </section>
  )
}

// Every 👎, so one can be taken back without forgetting them all (rule 10's button does that).
function Dislikes() {
  const outfits = useLiveQuery(() => db.outfits.toArray(), [])
  const items = useLiveQuery(() => db.items.toArray(), [])
  if (!outfits || !items) return null
  const name = new Map(items.map((i) => [i.id, i.name]))
  return (
    <div className="panel">
      <h2>Disliked outfits</h2>
      {outfits.length === 0
        ? <p className="muted">None. Tap 👎 on Today to never see an outfit again.</p>
        : (
          <ul className="list">
            {outfits.map((o) => (
              <li key={o.key} className="row">
                <span className="row-name">{o.itemIds.map((id) => name.get(id) ?? 'Deleted item').join(' + ')}</span>
                <button onClick={() => forgetDislike(db, o.key)}>Forget</button>
              </li>
            ))}
          </ul>
        )}
    </div>
  )
}

// Cuts out photos saved before the cutout existed, or added with it off, so they sit on
// black in dark mode too (DESIGN §4 "Look"). One at a time, and it can be stopped.
function Cutouts() {
  const left = useLiveQuery(() => db.photos.filter((p) => !p.mask).primaryKeys(), [])
  const [status, setStatus] = useState<string>()
  const [running, setRunning] = useState(false)
  const stop = useRef(false)

  async function run() {
    const ids = left ?? []
    stop.current = false
    setRunning(true)
    let done = 0, failed = 0
    for (const [n, itemId] of ids.entries()) {
      if (stop.current) break
      setStatus(`Cutting out ${n + 1} of ${ids.length}…`)
      try {
        const stored = await db.photos.get(itemId)
        if (!stored || stored.mask) continue
        const onProgress = (loaded: number, total: number) =>
          setStatus(`Downloading the cutout model, just this once: ${Math.round(loaded / 1048576)}MB of ${Math.round(total / 1048576)}MB…`)
        const result = await processPhoto(await cutout(await loadImage(stored.blob), onProgress))
        if (!result.mask) throw new Error('nothing was cut out')
        await updateItem(db, itemId, { photo: result.photo, mask: result.mask })
        done++
      } catch {
        failed++
      }
    }
    setRunning(false)
    setStatus(`Cut out ${done} ${done === 1 ? 'photo' : 'photos'}${failed ? `; ${failed} couldn't be done` : ''}${stop.current ? ' before stopping' : ''}.`)
  }

  if (!left) return null
  return (
    <div className="panel">
      <h2>Cutouts</h2>
      <p className="muted">
        {left.length
          ? `${left.length} ${left.length === 1 ? 'photo isn\'t' : 'photos aren\'t'} cut out yet, so in dark mode ${left.length === 1 ? 'it shows' : 'they show'} on a white square. Lay-flat or hung-up photos work best.`
          : 'Every photo is cut out.'}
      </p>
      {running
        ? <button onClick={() => { stop.current = true }}>Stop</button>
        : left.length > 0 && <button className="primary" onClick={run}>Cut out {left.length} {left.length === 1 ? 'photo' : 'photos'}</button>}
      {status && <p className="muted" role="status">{status}</p>}
    </div>
  )
}

// Export is two taps: the first builds the file, the second opens the share sheet,
// because iPhones only open it straight after a tap.
function Backup({ settings, itemCount }: { settings: Settings; itemCount: number }) {
  const [prepared, setPrepared] = useState<{ file: File; changes: number }>()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; error?: boolean }>()

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setMessage(undefined)
    try {
      await fn()
    } catch (e) {
      const text = e instanceof BackupError ? e.message : `Something went wrong: ${(e as Error).message}`
      setMessage({ text, error: true })
    } finally {
      setBusy(false)
    }
  }

  const exportCloset = () => run(async () => {
    const snapshot = await readSnapshot(db)
    const file = await buildBackupFile(snapshot, backupFileName(localDate()))
    setPrepared({ file, changes: snapshot.settings.changesSinceBackup })
  })

  // No `await` before saveFile, or iOS no longer counts this as straight after the tap.
  const save = () => {
    if (!prepared) return
    run(async () => {
      if (await saveFile(prepared.file) === 'cancelled') return
      await markBackedUp(db, prepared.changes)
      setPrepared(undefined)
      setMessage({ text: 'Backup saved.' })
    })
  }

  const importCloset = (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.target
    const file = input.files?.[0]
    if (!file) return
    run(async () => {
      try {
        const backup = parseBackup(await file.text())
        const n = backup.items.length
        if (itemCount > 0 && !confirm(`Replace your ${itemCount} items with the ${n} in this backup?`)) return
        await importBackup(db, backup)
        setPrepared(undefined)
        setMessage({ text: `Restored ${n} ${n === 1 ? 'item' : 'items'}.` })
      } finally {
        input.value = '' // so picking the same file again still fires a change
      }
    })
  }

  return (
    <div className="panel">
      <h2>Backup</h2>
      <p className="muted">{backupStatus(settings)}</p>
      <p className="muted">Everything lives on this phone. Keep a backup in iCloud Drive or Google Drive in case you lose it or delete the app.</p>
      <div className="row-buttons">
        {prepared
          ? <button className="primary" onClick={save} disabled={busy}>Save {(prepared.file.size / 1048576).toFixed(1)}MB backup</button>
          : <button className="primary" onClick={exportCloset} disabled={busy}>{busy ? 'Preparing…' : 'Export closet'}</button>}
        <label className={`button ${busy ? 'disabled' : ''}`}>
          Import closet
          <input type="file" accept="application/json,.json" hidden disabled={busy} onChange={importCloset} />
        </label>
      </div>
      {message && <p className={message.error ? 'error' : 'muted'} role={message.error ? 'alert' : 'status'}>{message.text}</p>}
    </div>
  )
}
