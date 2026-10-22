import type { Forecast, Location } from '../db/schema'

// Open-Meteo, free and keyless (DESIGN §4 "Weather"). Temperatures in °C.

export function forecastUrl(lat: number, lon: number): string {
  const q = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    timezone: 'auto',
    forecast_days: '1',
  })
  return `https://api.open-meteo.com/v1/forecast?${q}`
}

export function parseForecast(json: unknown): Forecast {
  const daily = (json as { daily?: Record<string, unknown[]> })?.daily
  const high = daily?.temperature_2m_max?.[0]
  const low = daily?.temperature_2m_min?.[0]
  const rain = daily?.precipitation_probability_max?.[0]
  if (typeof high !== 'number' || typeof low !== 'number') throw new Error('The forecast had no temperatures.')
  return { high, low, rainChance: typeof rain === 'number' ? rain : 0 }
}

export async function fetchForecast(lat: number, lon: number): Promise<Forecast> {
  const res = await fetch(forecastUrl(lat, lon), { signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new Error(`Weather request failed (${res.status}).`)
  return parseForecast(await res.json())
}

// A typed city, looked up with the geocoding API's first result.
export function parseCity(json: unknown): Location | null {
  const r = (json as { results?: { latitude: number; longitude: number; name: string; admin1?: string; country?: string }[] })?.results?.[0]
  if (!r) return null
  const label = [r.name, r.country].filter(Boolean).join(', ')
  return { lat: r.latitude, lon: r.longitude, label }
}

export async function findCity(name: string): Promise<Location | null> {
  const q = new URLSearchParams({ name, count: '1', format: 'json' })
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${q}`, { signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new Error(`City search failed (${res.status}).`)
  return parseCity(await res.json())
}

export function currentPosition(): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('This browser has no location access.'))
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      (e) => reject(new Error(e.code === e.PERMISSION_DENIED ? 'Location access was denied.' : "Couldn't find your location.")),
      { maximumAge: 60 * 60 * 1000, timeout: 15_000 },
    )
  })
}
