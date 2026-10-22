import { type FormEvent, useState } from 'react'
import { db } from '../db'
import { setLocation } from '../db/repo'
import { currentPosition, findCity } from '../weather/openMeteo'

// Geolocation, or a typed city looked up with Open-Meteo's geocoder (DESIGN Flow C, "Location").
export default function LocationPicker({ onDone, onCancel, intro }: { onDone?: () => void; onCancel?: () => void; intro?: string }) {
  const [city, setCity] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError(undefined)
    try {
      await fn()
      onDone?.()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const useGeolocation = () => run(async () => {
    const { lat, lon } = await currentPosition()
    await setLocation(db, lat, lon)
  })

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    const name = city.trim()
    if (!name) return
    run(async () => {
      const found = await findCity(name).catch(() => { throw new Error("Couldn't search for cities. Are you online?") })
      if (!found) throw new Error(`No city called "${name}" was found.`)
      await setLocation(db, found.lat, found.lon, found.label)
    })
  }

  return (
    <div className="location">
      {intro && <p>{intro}</p>}
      <form className="city" onSubmit={onSubmit}>
        <label className="field">City
          <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="London" autoComplete="address-level2" enterKeyHint="search" />
        </label>
        <button type="submit" className="primary" disabled={busy || !city.trim()}>Use this city</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row-buttons">
        <button type="button" onClick={useGeolocation} disabled={busy}>Use my location</button>
        {onCancel && <button type="button" onClick={onCancel} disabled={busy}>Cancel</button>}
      </div>
    </div>
  )
}
