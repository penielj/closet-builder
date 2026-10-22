import { useState } from 'react'
import LocationPicker from '../components/LocationPicker'
import { db } from '../db'
import { setComfortOffset } from '../db/repo'
import type { Settings } from '../db/schema'

// DESIGN Flow E. Backup joins these in build step 3.
const COMFORT: { value: Settings['comfortOffset']; label: string }[] = [
  { value: 3, label: 'I run cold' },
  { value: 0, label: 'Neutral' },
  { value: -3, label: 'I run warm' },
]

export default function SettingsView({ settings }: { settings: Settings }) {
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
    </section>
  )
}
