import { useLiveQuery } from 'dexie-react-hooks'
import { type FormEvent, useMemo, useRef, useState } from 'react'
import Photo from '../components/Photo'
import { db } from '../db'
import { addItem, deleteItem, updateItem } from '../db/repo'
import type { Item } from '../db/schema'
import {
  CATEGORIES, CATEGORY_LABELS, OCCASIONS, PALETTE, PATTERNS, SEASONS, WARMTHS, WARMTH_LABELS,
  type Category, type Occasion, type PaletteColor, type Pattern, type Season, type Warmth, label,
} from '../db/values'
import { cutout } from '../photo/cutout'
import { loadImage, processPhoto } from '../photo/resize'

interface Props { item?: Item; items: Item[]; onDone: () => void }

const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value])
const mb = (n: number) => `${Math.round(n / 1048576)}MB`

// A per-device convenience, so storage that's blocked or cleared just means the default.
const CUTOUT_PREF = 'closet.cutout'
const readPref = (key: string) => { try { return localStorage.getItem(key) } catch { return null } }
const writePref = (key: string, value: string) => { try { localStorage.setItem(key, value) } catch { /* default next time */ } }

export default function ItemForm({ item, items, onDone }: Props) {
  const [name, setName] = useState(item?.name ?? '')
  const [category, setCategory] = useState<Category>(item?.category ?? 'top')
  const [color, setColor] = useState<PaletteColor>(item?.color ?? 'black')
  const [pattern, setPattern] = useState<Pattern>(item?.pattern ?? 'solid')
  const [occasions, setOccasions] = useState<Occasion[]>(item?.occasions ?? ['casual'])
  const [seasons, setSeasons] = useState<Season[]>(item?.seasons ?? [])
  const [warmth, setWarmth] = useState<Warmth>(item?.warmth ?? 2)
  const [brand, setBrand] = useState(item?.brand ?? '')
  // `newPhoto`: undefined keeps the stored photo, null removes it, a Blob replaces it,
  // with `newMask` when it was cut out.
  // Saving without touching the photo doesn't rewrite it.
  const stored = useLiveQuery(async () => (item ? await db.photos.get(item.id) : undefined), [item?.id])
  const [newPhoto, setNewPhoto] = useState<Blob | null>()
  const [newMask, setNewMask] = useState<Blob>()
  const photo = newPhoto === undefined ? stored?.blob : newPhoto ?? undefined
  const mask = newPhoto === undefined ? stored?.mask : newMask
  const [colorTouched, setColorTouched] = useState(Boolean(item))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  // Brand autocompletes from existing items so spellings stay consistent (DESIGN §4).
  const brands = useMemo(() => {
    const seen = new Map<string, string>()
    for (const i of items) if (i.brand) seen.set(i.brand.toLowerCase(), i.brand)
    return [...seen.values()].sort((a, b) => a.localeCompare(b))
  }, [items])

  // Cutout (DESIGN §4): the garment is cut out onto white before the usual resize. It can
  // be turned off, and "Use photo as is" skips a slow one. `run` numbers each photo picked,
  // so a cutout that finishes after being skipped or replaced is dropped.
  const [cutOut, setCutOut] = useState(() => readPref(CUTOUT_PREF) !== 'off')
  const [cutting, setCutting] = useState<{ file: File; text: string }>()
  const [photoNote, setPhotoNote] = useState<string>()
  const run = useRef(0)

  async function onPhoto(file?: File) {
    if (!file) return
    const n = ++run.current
    setError(undefined)
    setPhotoNote(undefined)
    if (!cutOut) return applyPhoto(file, n)
    setCutting({ file, text: 'Cutting out the background…' })
    let cut: Blob | undefined
    try {
      const onProgress = (loaded: number, total: number) => {
        if (n === run.current) setCutting({ file, text: `Downloading the cutout model, just this once: ${mb(loaded)} of ${mb(total)}…` })
      }
      cut = await cutout(await loadImage(file), onProgress)
    } catch (e) {
      if (n === run.current) setPhotoNote(`Couldn't cut out the background (${(e as Error).message}), so the photo is used as is.`)
    }
    if (n === run.current) await applyPhoto(cut ?? file, n)
  }

  async function applyPhoto(source: Blob, n: number) {
    setCutting(undefined)
    setBusy(true)
    try {
      const result = await processPhoto(source)
      if (n !== run.current) return
      setNewPhoto(result.photo)
      setNewMask(result.mask)
      if (result.color && !colorTouched) setColor(result.color)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const skipCutout = () => { if (cutting) applyPhoto(cutting.file, ++run.current) }

  const toggleCutOut = (on: boolean) => {
    setCutOut(on)
    writePref(CUTOUT_PREF, on ? 'on' : 'off')
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return setError('Give it a name.')
    if (occasions.length === 0) return setError('Pick at least one occasion, or the picker can never choose it.')
    // An existing brand with different capitals is reused, so "zara" becomes "Zara".
    const typed = brand.trim()
    const finalBrand = typed ? brands.find((b) => b.toLowerCase() === typed.toLowerCase()) ?? typed : undefined
    const fields = { name: name.trim(), category, color, pattern, occasions, seasons, warmth, brand: finalBrand }
    setBusy(true)
    try {
      if (item) await updateItem(db, item.id, { ...fields, photo: newPhoto, mask: newMask })
      else await addItem(db, { ...fields, photo: newPhoto ?? undefined, mask: newMask })
      onDone()
    } catch (e) {
      setError(`Couldn't save: ${(e as Error).message}`)
      setBusy(false)
    }
  }

  async function onDelete() {
    if (!item || !confirm(`Delete "${item.name}"? This can't be undone.`)) return
    await deleteItem(db, item.id)
    onDone()
  }

  return (
    <form className="form" onSubmit={onSubmit}>
      <header className="topbar">
        <button type="button" onClick={onDone}>Cancel</button>
        <h1>{item ? 'Edit item' : 'Add item'}</h1>
        <button type="submit" className="primary" disabled={busy || !!cutting}>Save</button>
      </header>

      <div className="photo-picker">
        <Photo blob={photo} mask={mask} color={color} alt={name || 'New item'} />
        <label className="button">
          {photo ? 'Change photo' : 'Take or choose photo'}
          <input type="file" accept="image/*" hidden onChange={(e) => onPhoto(e.target.files?.[0])} />
        </label>
        {photo && !cutting && <button type="button" onClick={() => setNewPhoto(null)}>Remove photo</button>}
        {cutting && (
          <>
            <p className="muted photo-status" role="status">{cutting.text}</p>
            <button type="button" onClick={skipCutout}>Use photo as is</button>
          </>
        )}
        {photoNote && <p className="muted photo-status">{photoNote}</p>}
        <label className="check">
          <input type="checkbox" checked={cutOut} onChange={(e) => toggleCutOut(e.target.checked)} />
          Cut out the background
        </label>
        {!photo && !cutting && (
          <p className="muted photo-tip">
            Lay it flat or hang it up, so only the garment is in the photo. The first cutout downloads the model once (about 45–90MB).
          </p>
        )}
      </div>

      {error && <p className="error" role="alert">{error}</p>}

      <label className="field">Name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Navy chinos" maxLength={200} />
      </label>

      <fieldset><legend>Category</legend>
        <div className="chips">
          {CATEGORIES.map((c) => (
            <button type="button" key={c} className={`chip ${category === c ? 'on' : ''}`} onClick={() => setCategory(c)}>{CATEGORY_LABELS[c]}</button>
          ))}
        </div>
      </fieldset>

      <fieldset><legend>Color {photo && !colorTouched && <span className="muted">(detected from photo)</span>}</legend>
        <div className="swatches">
          {PALETTE.map((c) => (
            <button
              type="button" key={c.name} title={label(c.name)} aria-label={label(c.name)} aria-pressed={color === c.name}
              className={`swatch ${color === c.name ? 'on' : ''}`} style={{ background: c.hex }}
              onClick={() => { setColor(c.name); setColorTouched(true) }}
            />
          ))}
        </div>
        <span className="muted">{label(color)}</span>
      </fieldset>

      <fieldset><legend>Pattern</legend>
        <div className="chips">
          {PATTERNS.map((p) => (
            <button type="button" key={p} className={`chip ${pattern === p ? 'on' : ''}`} onClick={() => setPattern(p)}>{label(p)}</button>
          ))}
        </div>
      </fieldset>

      <fieldset><legend>Occasions</legend>
        <div className="chips">
          {OCCASIONS.map((o) => (
            <button type="button" key={o} className={`chip ${occasions.includes(o) ? 'on' : ''}`} onClick={() => setOccasions(toggle(occasions, o))}>{label(o)}</button>
          ))}
        </div>
      </fieldset>

      <fieldset><legend>Seasons <span className="muted">(none = all year)</span></legend>
        <div className="chips">
          {SEASONS.map((s) => (
            <button type="button" key={s} className={`chip ${seasons.includes(s) ? 'on' : ''}`} onClick={() => setSeasons(toggle(seasons, s))}>{label(s)}</button>
          ))}
        </div>
      </fieldset>

      <fieldset><legend>Warmth</legend>
        <div className="chips">
          {WARMTHS.map((w) => (
            <button type="button" key={w} className={`chip ${warmth === w ? 'on' : ''}`} onClick={() => setWarmth(w)}>{WARMTH_LABELS[w]}</button>
          ))}
        </div>
      </fieldset>

      <label className="field"><span>Brand <span className="muted">(optional)</span></span>
        <input value={brand} onChange={(e) => setBrand(e.target.value)} list="brands" maxLength={100} autoComplete="off" />
        <datalist id="brands">{brands.map((b) => <option key={b} value={b} />)}</datalist>
      </label>

      {item && <button type="button" className="danger" onClick={onDelete}>Delete item</button>}
    </form>
  )
}
