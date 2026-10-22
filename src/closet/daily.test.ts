import { describe, expect, it } from 'vitest'
import type { Item, TodayState } from '../db/schema'
import { localDate, planToday } from './daily'

const item = (id: number, over: Partial<Item> = {}): Item => ({
  id, name: `Item ${id}`, category: 'top', color: 'black', pattern: 'solid', occasions: ['casual'],
  seasons: [], warmth: 2, inHamper: false, createdAt: '2026-10-01T00:00:00.000Z', ...over,
})

const DATE = '2026-10-22'
const saved: TodayState = { date: DATE, itemIds: [1, 2, 3, 4], locked: [1, 4], forecast: { high: 12, low: 4, rainChance: 10 } }
const items = [1, 2, 3, 4, 5].map((id) => item(id))

describe("today's outfit (DESIGN §10)", () => {
  it('reopening the same day keeps the outfit and its locks', () => {
    expect(planToday(saved, items, DATE)).toEqual({ state: saved, repick: false })
  })

  it('a new day re-picks and clears the locks and the forecast', () => {
    expect(planToday(saved, items, '2026-10-23')).toEqual({ state: { date: '2026-10-23', itemIds: [], locked: [] }, repick: true })
  })

  it('sending a shown item to the hamper re-picks, keeping the other locks', () => {
    const plan = planToday(saved, items.map((i) => (i.id === 1 ? { ...i, inHamper: true } : i)), DATE)
    expect(plan).toEqual({ state: { ...saved, itemIds: [2, 3, 4], locked: [4] }, repick: true })
  })

  it('marking a shown item Not today or deleting it re-picks too', () => {
    expect(planToday(saved, items.map((i) => (i.id === 2 ? { ...i, skipDate: DATE } : i)), DATE).repick).toBe(true)
    expect(planToday(saved, items.filter((i) => i.id !== 3), DATE).repick).toBe(true)
  })

  it('editing a shown item does not re-pick, even if it no longer fits', () => {
    const edited = items.map((i) => (i.id === 2 ? { ...i, occasions: ['formal' as const], warmth: 3 as const } : i))
    expect(planToday(saved, edited, DATE).repick).toBe(false)
  })

  it('changes to items outside the outfit do not re-pick', () => {
    expect(planToday(saved, items.map((i) => (i.id === 5 ? { ...i, inHamper: true } : i)), DATE).repick).toBe(false)
  })

  it('picks when nothing has been picked yet today', () => {
    expect(planToday({ date: DATE, itemIds: [], locked: [] }, items, DATE).repick).toBe(true)
    expect(planToday(undefined, items, DATE).repick).toBe(true)
  })
})

describe('localDate', () => {
  it("uses the device's local date, not UTC", () => {
    expect(localDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
    expect(localDate(new Date(2026, 11, 31, 0, 1))).toBe('2026-12-31')
  })
})
