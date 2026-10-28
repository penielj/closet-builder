import { useLiveQuery } from 'dexie-react-hooks'
import { type PointerEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { localDate, planToday } from '../closet/daily'
import { NO_COAT, ONLY_OUTFIT, coatWanted, fitsDayFor, isBase, pickOutfit, swipeItem } from '../closet/picker'
import { MINIMUM, closetReadiness } from '../closet/readiness'
import LocationPicker from '../components/LocationPicker'
import { StoredPhoto } from '../components/Photo'
import { db } from '../db'
import { dislikeOutfit, saveForecast, saveToday, setInHamper, setLastOccasion, setLocation, skipToday } from '../db/repo'
import { type Item, type ItemId, type Settings, type TodayState, outfitKey } from '../db/schema'
import { OCCASIONS, type Occasion, label } from '../db/values'
import { currentPosition, fetchForecast } from '../weather/openMeteo'

const WEATHER_WAIT_MS = 5000 // DESIGN Flow C, "Weather"

interface Props { items: Item[]; settings: Settings; onAdd: () => void }

export default function Today({ items, settings, onAdd }: Props) {
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
  return <DailyOutfit items={items} settings={settings} date={date} />
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

function DailyOutfit({ items, settings, date }: { items: Item[]; settings: Settings; date: string }) {
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
  const [message, setMessage] = useState<string>()
  const [onlyOne, setOnlyOne] = useState(false)
  const [swipeNote, setSwipeNote] = useState<string>()
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
    setMessage(result.ok ? undefined : result.message)
    setOnlyOne(result.ok && result.notes.includes(ONLY_OUTFIT))
    setSwipeNote(undefined)
    const itemIds = result.ok ? result.itemIds : []
    // Skip a write that changes nothing, or the live query would loop on "nothing fits".
    if (today?.date === state.date && sameIds(today.itemIds, itemIds) && sameIds(today.locked, state.locked)) return
    return saveToday(db, { date: state.date, itemIds, locked: state.locked })
  }

  // Picks when there's no outfit yet today, or one in it went to the hamper, was marked
  // Not today or was deleted (including from the Closet tab).
  // The pick is random and saved to the database, so it can't be derived during render.
  // `repick` is left out of the deps: it changes every render, and `plan` covers its inputs.
  /* oxlint-disable react/set-state-in-effect, react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!plan.repick || !dislikes || !weatherDone) return
    repick(plan.state)
  }, [plan, dislikes, weatherDone])
  /* oxlint-enable react/set-state-in-effect, react-hooks/exhaustive-deps */

  const shown = plan.repick ? [] : plan.state.itemIds.map((id) => byId.get(id)!).filter(Boolean)
  const locked = new Set(plan.state.locked)
  const hasCoat = shown.some((i) => !isBase(i))
  const fitsDay = fitsDayFor(settings, date)
  const noCoat = shown.length > 0 && forecast && coatWanted(forecast, settings.comfortOffset) && !hasCoat
    && !items.some((i) => !isBase(i) && fitsDay(i))

  const toggleLock = (id: ItemId) => saveToday(db, {
    date, itemIds: plan.state.itemIds,
    locked: locked.has(id) ? plan.state.locked.filter((l) => l !== id) : [...plan.state.locked, id],
  })

  // Rule 12: replaces only the swiped item and keeps the locks.
  function swipe(id: ItemId, step: 1 | -1) {
    const { itemIds, locked } = plan.state
    const result = swipeItem({ items, settings, forecast, date, outfit: itemIds, locked, dislikes: dislikeKeys }, id, step)
    setSwipeNote(result.ok ? undefined : result.message)
    setOnlyOne(false)
    if (result.ok && !sameIds(result.itemIds, itemIds)) return saveToday(db, { date, itemIds: result.itemIds, locked })
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
          <ul className="outfit">
            {shown.map((item) => (
              <OutfitItem key={item.id} item={item} locked={locked.has(item.id)} onSwipe={(step) => swipe(item.id, step)}>
                <button aria-pressed={locked.has(item.id)} onClick={() => toggleLock(item.id)}>
                  {locked.has(item.id) ? '🔒 Locked' : '🔓 Lock'}
                </button>
                <button onClick={() => skipToday(db, item.id, date)}>Not today</button>
                <button onClick={() => setInHamper(db, item.id, true)}>→ Hamper</button>
              </OutfitItem>
            ))}
          </ul>
          <ul className="notes">
            {onlyOne && <li>{ONLY_OUTFIT}</li>}
            {noCoat && <li>{NO_COAT}</li>}
            {swipeNote && <li>{swipeNote}</li>}
            {!onlyOne && !noCoat && !swipeNote && <li className="hint">Swipe an item to change just that one.</li>}
          </ul>
          <div className="outfit-bar">
            <button onClick={dislike} aria-label="Never show this outfit again">👎</button>
            <button className="primary" onClick={() => repick(plan.state)}>Shuffle</button>
          </div>
        </>
      ) : message && plan.state.itemIds.length === 0 && weatherDone ? (
        <p className="panel">{message}</p>
      ) : (
        <p className="muted empty">Picking an outfit…</p>
      )}
    </section>
  )
}

const SWIPE_PX = 50

// One item of the outfit. A horizontal swipe of 50px or more changes it: left for the
// next choice, right for the previous one (DESIGN §5 rule 12). `touch-action: pan-y` in
// the CSS leaves vertical scrolling to the browser. A locked item doesn't swipe.
function OutfitItem({ item, locked, onSwipe, children }: {
  item: Item; locked: boolean; onSwipe: (step: 1 | -1) => void; children: ReactNode
}) {
  const start = useRef<{ x: number; y: number }>(undefined)
  const swipedAt = useRef(-Infinity)

  const onPointerUp = (e: PointerEvent) => {
    if (!start.current) return
    const dx = e.clientX - start.current.x, dy = e.clientY - start.current.y
    start.current = undefined
    if (locked || Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return
    swipedAt.current = e.timeStamp
    onSwipe(dx < 0 ? 1 : -1)
  }

  return (
    <li
      className={`outfit-item ${locked ? 'locked' : ''}`}
      onPointerDown={(e) => { start.current = { x: e.clientX, y: e.clientY } }}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { start.current = undefined }}
      // A swipe that started on a button mustn't also press it.
      onClickCapture={(e) => { if (e.timeStamp - swipedAt.current < 500) { e.preventDefault(); e.stopPropagation() } }}
    >
      <StoredPhoto itemId={item.id} color={item.color} alt={item.name} />
      <div className="outfit-body">
        <span className="outfit-name">{item.name}</span>
        <div className="outfit-actions">{children}</div>
      </div>
    </li>
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
