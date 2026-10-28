import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { localDate, planToday } from '../closet/daily'
import {
  NO_COAT, type NothingFits, coatWanted, fitsDayFor, isBase, pickOutfit, refillOutfit, slotChoices, slotFill, whyNotFor,
} from '../closet/picker'
import { MINIMUM, closetReadiness } from '../closet/readiness'
import LocationPicker from '../components/LocationPicker'
import { StoredPhoto } from '../components/Photo'
import { db } from '../db'
import {
  clearDislikes, dislikeOutfit, saveForecast, saveToday, setInHamper, setLastOccasion, setLocation, skipToday, wearToday,
} from '../db/repo'
import { type Item, type ItemId, type Settings, type TodayState, outfitKey } from '../db/schema'
import { CATEGORIES, type Category, OCCASIONS, type Occasion, label } from '../db/values'
import { currentPosition, fetchForecast } from '../weather/openMeteo'

const WEATHER_WAIT_MS = 5000 // DESIGN Flow C, "Weather"

interface Props { items: Item[]; settings: Settings; onAdd: () => void; onEdit: (item: Item) => void }

export default function Today({ items, settings, onAdd, onEdit }: Props) {
  const date = useLocalDate()
  const { ready, have, missing } = closetReadiness(items)

  if (!ready) {
    return (
      <section className="panel">
        {items.length === 0 && (
          <>
            <h2>Welcome</h2>
            <p>Add the ~20 things you actually wear. You can add the rest later.</p>
          </>
        )}
        <h3>What the picker needs</h3>
        <Meter label="Tops (or dresses)" have={have.tops} need={MINIMUM.tops} />
        <Meter label="Bottoms (or dresses)" have={have.bottoms} need={MINIMUM.bottoms} />
        <Meter label="Shoes" have={have.shoes} need={MINIMUM.shoes} />
        <p className="muted">Still missing: {missing.join(', ')}.</p>
        <button className="primary" onClick={onAdd}>Add an item</button>
      </section>
    )
  }

  if (!settings.location) return <FirstLocation />
  return <DailyOutfit items={items} settings={settings} date={date} onEdit={onEdit} />
}

// The device's local date, checked again whenever the app comes back to the front.
function useLocalDate() {
  const [date, setDate] = useState(localDate)
  useEffect(() => {
    const check = () => { if (document.visibilityState === 'visible') setDate(localDate()) }
    document.addEventListener('visibilitychange', check)
    window.addEventListener('focus', check)
    return () => {
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener('focus', check)
    }
  }, [])
  return date
}

// The first time Today opens it asks for geolocation; denied or failed shows a city box.
let askedForLocation = false
function FirstLocation() {
  const [failed, setFailed] = useState(askedForLocation)
  useEffect(() => {
    if (askedForLocation) return
    askedForLocation = true
    currentPosition().then(({ lat, lon }) => setLocation(db, lat, lon)).catch(() => setFailed(true))
  }, [])

  return (
    <section className="panel">
      <h2>Where are you?</h2>
      {failed
        ? <LocationPicker intro="The weather decides how warm your outfit should be. Type your city, or try your location again." />
        : <p className="muted">Finding your location for the weather…</p>}
    </section>
  )
}

function DailyOutfit({ items, settings, date, onEdit }: { items: Item[]; settings: Settings; date: string; onEdit: (item: Item) => void }) {
  const dislikes = useLiveQuery(() => db.outfits.toArray(), [])
  const dislikeKeys = useMemo(() => new Set(dislikes?.map((o) => o.key)), [dislikes])
  const { lat, lon, label: place } = settings.location!
  const today = settings.today
  const forecast = today?.date === date ? today.forecast : undefined
  const plan = useMemo(() => planToday(today, items, date), [today, items, date])

  // Which day and place the weather wait has finished for, so a new day waits again.
  const weatherKey = `${date}|${lat}|${lon}`
  const [weatherDoneFor, setWeatherDoneFor] = useState<string>()
  const weatherDone = !!forecast || weatherDoneFor === weatherKey
  const [failure, setFailure] = useState<{ message: string; reason: NothingFits; slot?: Item['category'][] }>()
  // The last pick's notes ("the only outfit that fits", "the only top that fits"). "No clean
  // coat" is left out: it's worked out from the saved outfit, so it survives a reopen.
  const [pickNotes, setPickNotes] = useState<string[]>([])
  const [changingPlace, setChangingPlace] = useState(false)

  // Weather: a forecast already fetched today is reused. Otherwise wait up to 5 seconds,
  // then go on without it. One arriving later is still saved for the weather line.
  useEffect(() => {
    if (forecast) return
    let live = true
    const done = () => { if (live) setWeatherDoneFor(weatherKey) }
    const timer = setTimeout(done, WEATHER_WAIT_MS)
    fetchForecast(lat, lon)
      .then((f) => saveForecast(db, date, f))
      .catch(() => {}) // rule 11: no weather
      .finally(() => { clearTimeout(timer); done() })
    return () => { live = false; clearTimeout(timer) }
  }, [weatherKey, date, lat, lon, forecast])

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])
  const baseIds = (ids: ItemId[]) => ids.filter((id) => { const i = byId.get(id); return !i || isBase(i) })
  const currentKey = today && today.date === date && today.itemIds.length ? outfitKey(baseIds(today.itemIds)) : undefined

  function repick(state: TodayState, opts: { occasion?: Occasion; disliked?: string } = {}) {
    const dislikedNow = opts.disliked ? new Set([...dislikeKeys, opts.disliked]) : dislikeKeys
    const result = pickOutfit({
      items,
      settings: { ...settings, lastOccasion: opts.occasion ?? settings.lastOccasion },
      forecast, date, locked: state.locked, current: currentKey, dislikes: dislikedNow, random: Math.random,
    })
    setFailure(result.ok ? undefined : result)
    setPickNotes(result.ok ? result.notes.filter((n) => n !== NO_COAT) : [])
    const itemIds = result.ok ? result.itemIds : []
    // Skip a write that changes nothing, or the live query would loop on "nothing fits".
    if (today?.date === state.date && sameIds(today.itemIds, itemIds) && sameIds(today.locked, state.locked)) return
    return saveToday(db, { date: state.date, itemIds, locked: state.locked })
  }

  // What rule 12's carousels and rule 15's refills choose against: today's outfit as it stands.
  const swipeInput = { items, settings, forecast, date, outfit: plan.state.itemIds, locked: plan.state.locked, dislikes: dislikeKeys }

  // Picks when there's no outfit yet today. When pieces of it went to the hamper, were
  // marked Not today or were deleted (including from the Closet tab), only their slots are
  // refilled (rule 15), unless the base can't be completed.
  // The pick is random and saved to the database, so it can't be derived during render.
  // `repick` is left out of the deps: it changes every render, and `plan` covers its inputs.
  /* oxlint-disable react/set-state-in-effect, react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!plan.repick || !dislikes || !weatherDone) return
    if (plan.state.itemIds.length > 0) {
      const gone = (today?.itemIds ?? []).filter((id) => !plan.state.itemIds.includes(id)).map((id) => byId.get(id)).filter((i): i is Item => !!i)
      const itemIds = refillOutfit({ ...swipeInput, random: Math.random }, gone)
      if (itemIds) {
        setPickNotes([])
        saveToday(db, { date, itemIds, locked: plan.state.locked })
        return
      }
    }
    repick(plan.state)
  }, [plan, dislikes, weatherDone])
  /* oxlint-enable react/set-state-in-effect, react-hooks/exhaustive-deps */

  // In outfit order: shirt and pants (or a dress), then sweater, shoes, coat, hat and bag.
  const shown = plan.repick ? [] : plan.state.itemIds.map((id) => byId.get(id)!).filter(Boolean)
    .sort((a, b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category))
  const locked = new Set(plan.state.locked)
  const isCoat = (i: Item) => i.category === 'outerwear'
  const fitsDay = fitsDayFor(settings, date)
  const whyNot = whyNotFor(settings, date)
  // "No clean coat" only for someone who owns a coat (rule 9), like the sweater note.
  const noCoat = shown.length > 0 && forecast && coatWanted(forecast, settings.comfortOffset) && !shown.some(isCoat)
    && items.some(isCoat) && !items.some((i) => isCoat(i) && fitsDay(i))

  const toggleLock = (id: ItemId) => saveToday(db, {
    date, itemIds: plan.state.itemIds,
    locked: locked.has(id) ? plan.state.locked.filter((l) => l !== id) : [...plan.state.locked, id],
  })

  // Rule 12: the carousel settled on another item for that slot. Only it changes; locks stay.
  // Layers can be taken off for the day or put on by hand (rule 15).
  const removeLayer = (id: ItemId) =>
    saveToday(db, { date, itemIds: plan.state.itemIds.filter((i) => i !== id), locked: plan.state.locked.filter((i) => i !== id) })
  const addable = LAYERS.filter((c) => !shown.some((i) => i.category === c) && slotFill(swipeInput, c).length > 0)
  function addLayer(category: Category) {
    const choices = slotFill(swipeInput, category)
    if (choices.length) saveToday(db, { date, itemIds: [...plan.state.itemIds, pickOne(choices).id], locked: plan.state.locked })
  }

  function choose(from: ItemId, to: ItemId) {
    setPickNotes([])
    const { itemIds, locked } = plan.state
    if (from !== to) return saveToday(db, { date, itemIds: itemIds.map((id) => (id === from ? to : id)), locked })
  }

  async function dislike() {
    const ids = baseIds(plan.state.itemIds)
    await dislikeOutfit(db, ids)
    await repick(plan.state, { disliked: outfitKey(ids) })
  }

  async function chooseOccasion(o: Occasion) {
    if (o === settings.lastOccasion) return
    await setLastOccasion(db, o)
    await repick(plan.state, { occasion: o })
  }

  return (
    <section className="today">
      {changingPlace
        ? (
          <div className="panel">
            <LocationPicker onDone={() => setChangingPlace(false)} onCancel={() => setChangingPlace(false)} />
          </div>
        )
        : (
          <p className="weather">
            <span>
              {forecast
                ? <>{place ?? 'Your location'}: high {Math.round(forecast.high)}°, low {Math.round(forecast.low)}°, rain {Math.round(forecast.rainChance)}%</>
                : weatherDone ? 'No weather, so warmth isn\'t checked.' : 'Checking the weather…'}
            </span>
            <button className="link" onClick={() => setChangingPlace(true)}>Change</button>
          </p>
        )}

      <div className="chips" role="radiogroup" aria-label="Occasion">
        {OCCASIONS.map((o) => (
          <button key={o} role="radio" aria-checked={settings.lastOccasion === o} className={`chip ${settings.lastOccasion === o ? 'on' : ''}`} onClick={() => chooseOccasion(o)}>
            {label(o)}
          </button>
        ))}
      </div>

      {shown.length > 0 ? (
        <>
          <ul className="looks">
            {shown.map((item) => (
              <SlotCarousel
                key={item.category} // one per slot, so the carousel stays put while its item changes
                item={item}
                choices={locked.has(item.id) ? [item] : slotChoices(swipeInput, item.id)}
                locked={locked.has(item.id)}
                onChoose={(id) => choose(item.id, id)}
                onToggleLock={() => toggleLock(item.id)}
              />
            ))}
            {addable.map((c) => (
              <li key={c} className="look look-add">
                <button onClick={() => addLayer(c)}>+ {LAYER_NAMES[c]}</button>
              </li>
            ))}
          </ul>
          {/* The flat lay has no text, so the pieces are named here. */}
          <ul className="pieces">
            {shown.map((item) => (
              <li key={item.id}>
                <span className="piece-text">
                  {item.brand && <span className="look-brand">{item.brand}</span>}
                  <span className="look-name">{item.name}</span>
                </span>
                <span className="look-actions">
                  {!isBase(item) && <button className="link" onClick={() => removeLayer(item.id)}>Remove</button>}
                  <button className="link" onClick={() => skipToday(db, item.id, date)}>Not today</button>
                  <button className="link" onClick={() => setInHamper(db, item.id, true)}>Hamper</button>
                </span>
              </li>
            ))}
          </ul>
          <ul className="notes">
            {pickNotes.map((n) => <li key={n}>{n}</li>)}
            {noCoat && <li>{NO_COAT}</li>}
            {pickNotes.length === 0 && !noCoat && <li className="hint">Swipe a piece to change just that one.</li>}
          </ul>
          <div className="outfit-bar">
            <button onClick={dislike} aria-label="Never show this outfit again">👎</button>
            <button className="primary" onClick={() => repick(plan.state)}>Shuffle</button>
          </div>
        </>
      ) : failure && plan.state.itemIds.length === 0 && weatherDone ? (
        <div className="panel">
          <p>{failure.message}</p>
          {/* Locks aren't visible without an outfit, so they're listed here to undo. */}
          {plan.state.locked.length > 0 && (
            <ul className="list">
              {plan.state.locked.map((id) => byId.get(id)).filter((i): i is Item => !!i).map((item) => (
                <li key={item.id} className="row">
                  <StoredPhoto itemId={item.id} color={item.color} alt={item.name} />
                  <span className="row-name">🔒 {item.name}</span>
                  <button onClick={() => toggleLock(item.id)}>Unlock</button>
                </li>
              ))}
            </ul>
          )}
          {/* The empty slot's items, each with why it's out today and a way back in. */}
          {failure.slot && (
            <ul className="list">
              {items.filter((i) => failure.slot!.includes(i.category)).map((item) => {
                const out = whyNot(item)
                return (
                  <li key={item.id} className="row">
                    <StoredPhoto itemId={item.id} color={item.color} alt={item.name} />
                    <span className="row-name">{item.name}<span className="row-why muted">{out?.text}</span></span>
                    {out?.why === 'skipped' ? <button onClick={() => wearToday(db, item.id)}>Wear today</button>
                      : out?.why === 'hamper' ? <button onClick={() => setInHamper(db, item.id, false)}>Take out</button>
                      : <button onClick={() => onEdit(item)}>Edit</button>}
                  </li>
                )
              })}
            </ul>
          )}
          {failure.reason === 'disliked' && (
            <button className="primary" onClick={() => clearDislikes(db)}>Forget my 👎s</button>
          )}
        </div>
      ) : (
        <p className="muted empty">Picking an outfit…</p>
      )}
    </section>
  )
}

const LAYERS = ['sweater', 'outerwear', 'hat', 'bag'] as const
const LAYER_NAMES: Record<(typeof LAYERS)[number], string> = { sweater: 'Sweater', outerwear: 'Jacket', hat: 'Hat', bag: 'Bag' }

const pickOne = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)]

const SETTLE_MS = 120 // a carousel counts as settled this long after its last scroll event

// One square of the outfit grid as a carousel of its slot's choices (DESIGN §5 rule 12): a
// native horizontal scroller that snaps a photo at a time and follows the finger. When it
// settles on another item, that item replaces this one. The lock sits in the photo's
// top-right corner; a locked slot shows only its item and doesn't scroll.
function SlotCarousel({ item, choices, locked, onChoose, onToggleLock }: {
  item: Item; choices: Item[]; locked: boolean; onChoose: (id: ItemId) => void; onToggleLock: () => void
}) {
  const track = useRef<HTMLDivElement>(null)
  const at = Math.max(0, choices.findIndex((c) => c.id === item.id))
  const ids = choices.map((c) => c.id).join(',')
  // Where the finger has scrolled to, only for this item and these choices: when either
  // changes, the outfit's item is in view again.
  const view = `${at}|${ids}`
  const [scrolled, setScrolled] = useState<{ view: string; n: number }>()
  const inView = scrolled?.view === view ? scrolled.n : at
  const settle = useRef<ReturnType<typeof setTimeout>>(undefined)
  // Only a scroll the person started (a finger, a trackpad, a wheel) chooses anything. A
  // resize or rotation also moves a snapping scroller, and that mustn't change the outfit.
  const touched = useRef(false)

  // Shows the outfit's item, without animating, whenever it or the choices change.
  const align = () => {
    const el = track.current
    if (el) el.scrollLeft = at * el.clientWidth
  }
  useLayoutEffect(align, [at, ids]) // oxlint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => clearTimeout(settle.current), [])

  const onScroll = () => {
    const el = track.current!
    if (!el.clientWidth) return // mid-layout: 0/0 would make the index NaN
    const n = Math.min(choices.length - 1, Math.max(0, Math.round(el.scrollLeft / el.clientWidth)))
    setScrolled({ view, n })
    clearTimeout(settle.current)
    settle.current = setTimeout(() => {
      if (!touched.current) { align(); setScrolled(undefined); return }
      touched.current = false
      if (choices[n].id !== item.id) onChoose(choices[n].id)
    }, SETTLE_MS)
  }
  const touch = () => { touched.current = true }

  return (
    <li className={`look look-${item.category} ${locked ? 'locked' : ''}`}>
      <div className="look-photo">
        <div
          className="look-track" ref={track} onScroll={locked ? undefined : onScroll}
          onTouchStart={touch} onPointerDown={touch} onWheel={touch}
        >
          {choices.map((c) => (
            <div key={c.id} className="look-slide">
              <StoredPhoto itemId={c.id} color={c.color} alt={c.name} trim />
            </div>
          ))}
        </div>
        <button className="look-lock" aria-pressed={locked} aria-label={locked ? `Unlock ${item.name}` : `Lock ${item.name}`} onClick={onToggleLock}>
          <LockIcon closed={locked} />
        </button>
        {choices.length > 1 && <span className="look-count">{inView + 1}/{choices.length}</span>}
      </div>
    </li>
  )
}

function LockIcon({ closed }: { closed: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" />
      <path d={closed ? 'M8 11V7a4 4 0 0 1 8 0v4' : 'M8 11V7a4 4 0 0 1 7.5-1.9'} />
    </svg>
  )
}

const sameIds = (a: ItemId[], b: ItemId[]) => a.length === b.length && a.every((id, n) => id === b[n])

function Meter({ label, have, need }: { label: string; have: number; need: number }) {
  const done = have >= need
  return (
    <div className="meter">
      <div className="meter-row">
        <span>{label}</span>
        <span className={done ? 'ok' : ''}>{Math.min(have, need)}/{need}{done ? ' ✓' : ''}</span>
      </div>
      <div className="meter-track"><div className="meter-fill" style={{ width: `${Math.min(1, have / need) * 100}%` }} /></div>
    </div>
  )
}
