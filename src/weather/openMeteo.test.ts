import { describe, expect, it } from 'vitest'
import { forecastUrl, parseCity, parseForecast } from './openMeteo'

describe('Open-Meteo (DESIGN §4 "Weather")', () => {
  it('asks for one day of highs, lows and rain chance in local time', () => {
    const url = new URL(forecastUrl(51.51, -0.13))
    expect(url.origin + url.pathname).toBe('https://api.open-meteo.com/v1/forecast')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      latitude: '51.51', longitude: '-0.13',
      daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max',
      timezone: 'auto', forecast_days: '1',
    })
  })

  it("reads today's forecast", () => {
    const json = { daily: { time: ['2026-10-22'], temperature_2m_max: [14.2], temperature_2m_min: [6.1], precipitation_probability_max: [55] } }
    expect(parseForecast(json)).toEqual({ high: 14.2, low: 6.1, rainChance: 55 })
  })

  it('treats a missing rain chance as 0 and missing temperatures as a failure', () => {
    expect(parseForecast({ daily: { temperature_2m_max: [20], temperature_2m_min: [10], precipitation_probability_max: [null] } }).rainChance).toBe(0)
    expect(() => parseForecast({ daily: { temperature_2m_max: [null] } })).toThrow()
    expect(() => parseForecast({ error: true })).toThrow()
  })

  it("uses the geocoder's first result", () => {
    const json = { results: [
      { latitude: 51.50853, longitude: -0.12574, name: 'London', country: 'United Kingdom' },
      { latitude: 42.98339, longitude: -81.23304, name: 'London', country: 'Canada' },
    ] }
    expect(parseCity(json)).toEqual({ lat: 51.50853, lon: -0.12574, label: 'London, United Kingdom' })
    expect(parseCity({})).toBeNull()
  })
})
