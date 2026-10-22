import { describe, expect, it } from 'vitest'
import type { Forecast, Item } from '../db/schema'
import { NO_COAT, ONLY_OUTFIT, type PickInput, coatWanted, feelsLike, pickOutfit, seasonOf, targetWarmth } from './picker'

const DATE = '2026-10-22' // October: autumn in the north, spring in the south
const LONDON = { lat: 51.51, lon: -0.13 }
const SYDNEY = { lat: -33.87, lon: 151.21 }
const MILD: Forecast = { high: 16, low: 16, rainChance: 0 } // medium target, no coat

let nextId = 1
function item(category: Item['category'], over: Partial<Item> = {}): Item {
  return {
    id: nextId++, name: `${category} ${nextId}`, category, color: 'black', pattern: 'solid',
    occasions: ['casual'], seasons: [], warmth: 2, inHamper: false, createdAt: '2026-10-01T00:00:00.000Z',
    ...over,
  }
}

function pick(over: Partial<PickInput> & { items: Item[] }) {
  return pickOutfit({
    settings: { comfortOffset: 0, lastOccasion: 'casual', location: LONDON },
    forecast: MILD, date: DATE, locked: [], dislikes: new Set(), random: () => 0,
    ...over,
  })
}

// Every outfit the picker can return for this input, by trying each random slot.
function allPicks(over: Partial<PickInput> & { items: Item[] }) {
  const keys = new Set<string>()
  for (let n = 0; n < 50; n++) {
    const r = pick({ ...over, random: () => n / 50 })
    if (r.ok) keys.add(r.itemIds.join(','))
  }
  return keys
}

const ids = (r: ReturnType<typeof pick>) => (r.ok ? r.itemIds : r.message)

describe('warmth (rule 4)', () => {
  it('targets heavy below 10°C, medium from 10 to 20 inclusive, light above 20', () => {
    expect(targetWarmth(9.9)).toBe(3)
    expect(targetWarmth(10)).toBe(2)
    expect(targetWarmth(20)).toBe(2)
    expect(targetWarmth(20.1)).toBe(1)
  })

  it('subtracts the comfort offset: running cold makes 12°C feel like 9°C', () => {
    expect(feelsLike(12, 3)).toBe(9)
    expect(feelsLike(12, -3)).toBe(15)
  })

  it('drops items more than 1 away from the target, using the feels-like high', () => {
    const light = item('top', { warmth: 1 })
    const heavy = item('top', { warmth: 3 })
    const items = [light, heavy, item('bottom'), item('shoes')]
    const day: Forecast = { high: 12, low: 12, rainChance: 0 }
    // Neutral: 12°C is medium, so both pass.
    expect(allPicks({ items, forecast: day }).size).toBe(2)
    // Running cold: feels like 9°C, heavy target, so the light top is dropped.
    const cold = allPicks({ items, forecast: day, settings: { comfortOffset: 3, lastOccasion: 'casual', location: LONDON } })
    expect([...cold].every((k) => !k.split(',').includes(String(light.id)))).toBe(true)
  })

  it('drops heavy items on a hot day', () => {
    const heavy = item('top', { warmth: 3 })
    const light = item('top', { warmth: 1 })
    const items = [heavy, light, item('bottom', { warmth: 1 }), item('shoes', { warmth: 1 })]
    const r = pick({ items, forecast: { high: 28, low: 20, rainChance: 0 } })
    expect(r.ok && r.itemIds.includes(light.id) && !r.itemIds.includes(heavy.id)).toBe(true)
  })
})

describe('coat (rule 9)', () => {
  const base = () => [item('top'), item('bottom'), item('shoes')]

  it('is wanted when the feels-like low is below 15°C or rain is 50% or more', () => {
    expect(coatWanted({ high: 20, low: 14.9, rainChance: 0 }, 0)).toBe(true)
    expect(coatWanted({ high: 20, low: 15, rainChance: 49 }, 0)).toBe(false)
    expect(coatWanted({ high: 20, low: 15, rainChance: 50 }, 0)).toBe(true)
    expect(coatWanted({ high: 20, low: 17, rainChance: 0 }, 3)).toBe(true) // feels like 14
  })

  it('adds a coat when wanted and none when not', () => {
    const coat = item('outerwear')
    const items = [...base(), coat]
    expect(ids(pick({ items, forecast: { high: 16, low: 10, rainChance: 0 } }))).toContain(coat.id)
    expect(ids(pick({ items, forecast: MILD }))).not.toContain(coat.id)
  })

  it('picks among the warmest coats when the feels-like low is below 5°C', () => {
    const light = item('outerwear', { warmth: 1 })
    const heavy = item('outerwear', { warmth: 3 })
    const cold: Forecast = { high: 8, low: 2, rainChance: 0 }
    for (const r of [0, 0.5, 0.99]) expect(ids(pick({ items: [...base(), light, heavy], forecast: cold, random: () => r }))).toContain(heavy.id)
    // Above 5°C any coat can come up.
    const cool: Forecast = { high: 12, low: 8, rainChance: 0 }
    const coats = new Set([0, 0.99].map((r) => (ids(pick({ items: [...base(), light, heavy], forecast: cool, random: () => r })) as number[]).at(-1)))
    expect(coats).toEqual(new Set([light.id, heavy.id]))
  })

  it('ignores the warmth ±1 rule for coats, but not rules 1–3', () => {
    const light = item('outerwear', { warmth: 1 })
    const r = pick({ items: [...base(), light], forecast: { high: 4, low: 0, rainChance: 0 } })
    expect(ids(r)).toContain(light.id)
    const dirty = item('outerwear', { inHamper: true })
    const formal = item('outerwear', { occasions: ['formal'] })
    const summer = item('outerwear', { seasons: ['summer'] })
    const r2 = pick({ items: [...base(), dirty, formal, summer], forecast: { high: 12, low: 8, rainChance: 0 } })
    expect(r2.ok && r2.itemIds).toHaveLength(3)
    expect(r2.ok && r2.notes).toEqual([NO_COAT])
  })

  it('says "No clean coat." when one is wanted and none is available', () => {
    const r = pick({ items: base(), forecast: { high: 18, low: 12, rainChance: 80 } })
    expect(r.ok && r.notes).toEqual([NO_COAT])
  })

  it('always shows a locked coat, even when the weather does not call for one', () => {
    const coat = item('outerwear')
    expect(ids(pick({ items: [...base(), coat], forecast: { high: 30, low: 22, rainChance: 0 }, locked: [coat.id] }))).toContain(coat.id)
    expect(ids(pick({ items: [...base(), coat], forecast: undefined, locked: [coat.id] }))).toContain(coat.id)
  })

  it('leaves the coat out of the outfit key', () => {
    const items = [...base(), item('outerwear')]
    const r = pick({ items, forecast: { high: 10, low: 5, rainChance: 0 } })
    expect(r.ok && r.key).toBe(`${items[0].id}|${items[1].id}|${items[2].id}`)
    expect(r.ok && r.itemIds).toHaveLength(4)
  })
})

describe('availability, occasion and season (rules 1–3)', () => {
  it('never suggests hamper items or items marked Not today', () => {
    const dirty = item('top', { inHamper: true })
    const skipped = item('top', { skipDate: DATE })
    const clean = item('top')
    const items = [dirty, skipped, clean, item('bottom'), item('shoes')]
    expect(allPicks({ items })).toEqual(new Set([`${clean.id},${items[3].id},${items[4].id}`]))
  })

  it('treats a Not today from yesterday as available', () => {
    const top = item('top', { skipDate: '2026-10-21' })
    expect(ids(pick({ items: [top, item('bottom'), item('shoes')] }))).toContain(top.id)
  })

  it("only uses items tagged with today's occasion", () => {
    const work = item('top', { occasions: ['work'] })
    const items = [work, item('top'), item('bottom'), item('shoes')]
    expect([...allPicks({ items })].some((k) => k.split(',').includes(String(work.id)))).toBe(false)
  })

  it('goes by month, swapped south of the equator', () => {
    expect(seasonOf('2026-03-01', 10)).toBe('spring')
    expect(seasonOf('2026-05-31', 10)).toBe('spring')
    expect(seasonOf('2026-06-01', 10)).toBe('summer')
    expect(seasonOf('2026-09-01', 10)).toBe('autumn')
    expect(seasonOf('2026-12-01', 10)).toBe('winter')
    expect(seasonOf('2026-02-28', 10)).toBe('winter')
    expect(seasonOf('2026-10-22', -33)).toBe('spring')
    expect(seasonOf('2026-01-15', -33)).toBe('summer')
    expect(seasonOf('2026-01-15', 0)).toBe('winter') // the equator counts as north
  })

  it('filters by season in both hemispheres, and untagged items fit every season', () => {
    const autumn = item('top', { seasons: ['autumn'] })
    const spring = item('top', { seasons: ['spring'] })
    const any = item('top')
    const rest = [item('bottom'), item('shoes')]
    const tops = (location: typeof LONDON) => new Set([...allPicks({ items: [autumn, spring, any, ...rest], settings: { comfortOffset: 0, lastOccasion: 'casual', location } })].map((k) => Number(k.split(',')[0])))
    expect(tops(LONDON)).toEqual(new Set([autumn.id, any.id]))
    expect(tops(SYDNEY)).toEqual(new Set([spring.id, any.id]))
  })

  it('skips the season rule with no saved location', () => {
    const summer = item('top', { seasons: ['summer'] })
    const r = pick({ items: [summer, item('bottom'), item('shoes')], settings: { comfortOffset: 0, lastOccasion: 'casual' }, forecast: undefined })
    expect(ids(r)).toContain(summer.id)
  })
})

describe('slots (rule 5)', () => {
  it('uses a top and bottom, or a dress, plus shoes', () => {
    const top = item('top'), bottom = item('bottom'), dress = item('dress'), shoes = item('shoes')
    expect(allPicks({ items: [top, bottom, dress, shoes] })).toEqual(new Set([`${top.id},${bottom.id},${shoes.id}`, `${dress.id},${shoes.id}`]))
  })
})

describe('colors and patterns (rules 6 and 7)', () => {
  it('allows any neutrals and one statement color, even on several items', () => {
    const red = item('top', { color: 'red' })
    const redBottom = item('bottom', { color: 'red' })
    expect(pick({ items: [red, redBottom, item('shoes', { color: 'white' })] }).ok).toBe(true)
    const blue = item('bottom', { color: 'blue' })
    expect(pick({ items: [red, blue, item('shoes')] }).ok).toBe(false)
  })

  it('allows at most one patterned item', () => {
    const striped = item('top', { pattern: 'striped' })
    expect(pick({ items: [striped, item('bottom', { pattern: 'checked' }), item('shoes')] }).ok).toBe(false)
    expect(pick({ items: [striped, item('bottom'), item('shoes')] }).ok).toBe(true)
  })

  it('does not count the coat toward either rule', () => {
    const coat = item('outerwear', { color: 'green', pattern: 'checked' })
    const r = pick({ items: [item('top', { color: 'red', pattern: 'print' }), item('bottom'), item('shoes'), coat], forecast: { high: 12, low: 8, rainChance: 0 } })
    expect(ids(r)).toContain(coat.id)
  })
})

describe('locks (rule 8)', () => {
  it('always includes locked items, even when they break rules 2–4', () => {
    const formal = item('top', { occasions: ['formal'] })
    const summer = item('bottom', { seasons: ['summer'] })
    const heavy = item('shoes', { warmth: 3 })
    const items = [formal, summer, heavy, item('top', { warmth: 1 }), item('bottom', { warmth: 1 }), item('shoes', { warmth: 1 })]
    const hot: Forecast = { high: 30, low: 22, rainChance: 0 }
    expect(allPicks({ items, forecast: hot, locked: [formal.id, summer.id, heavy.id] })).toEqual(new Set([`${formal.id},${summer.id},${heavy.id}`]))
  })

  it('keeps the locked item and varies the rest', () => {
    const top = item('top')
    const items = [top, item('top'), item('bottom'), item('bottom'), item('shoes')]
    const picks = allPicks({ items, locked: [top.id] })
    expect(picks.size).toBe(2)
    for (const k of picks) expect(k.split(',')[0]).toBe(String(top.id))
  })

  it('still counts locked items toward the color and pattern rules', () => {
    const red = item('top', { color: 'red' })
    const items = [red, item('bottom', { color: 'blue' }), item('shoes')]
    const r = pick({ items, locked: [red.id] })
    expect(r).toEqual({ ok: false, message: "Your clean casual clothes don't go together. Try Laundry done, or unlock an item." })
  })

  it('a locked dress rules out tops and bottoms, and a locked top rules out dresses', () => {
    const top = item('top'), bottom = item('bottom'), dress = item('dress'), shoes = item('shoes')
    expect(allPicks({ items: [top, bottom, dress, shoes], locked: [dress.id] })).toEqual(new Set([`${dress.id},${shoes.id}`]))
    expect(allPicks({ items: [top, bottom, dress, shoes], locked: [top.id] })).toEqual(new Set([`${top.id},${bottom.id},${shoes.id}`]))
  })

  it('ignores a lock on an item that is gone or no longer available', () => {
    const dirty = item('top', { inHamper: true })
    const top = item('top')
    const r = pick({ items: [dirty, top, item('bottom'), item('shoes')], locked: [dirty.id, 9999] })
    expect(ids(r)).toContain(top.id)
  })
})

describe('dislikes and the current outfit (rule 8)', () => {
  const top1 = item('top'), top2 = item('top'), bottom = item('bottom'), shoes = item('shoes')
  const items = [top1, top2, bottom, shoes]
  const k1 = `${top1.id}|${bottom.id}|${shoes.id}`
  const k2 = `${top2.id}|${bottom.id}|${shoes.id}`

  it('never picks a disliked outfit', () => {
    expect(allPicks({ items, dislikes: new Set([k1]) })).toEqual(new Set([`${top2.id},${bottom.id},${shoes.id}`]))
  })

  it('drops the outfit on screen now', () => {
    expect(allPicks({ items, current: k1 })).toEqual(new Set([`${top2.id},${bottom.id},${shoes.id}`]))
  })

  it('shows the current outfit again, with a note, when it is the only one left', () => {
    const r = pick({ items, current: k1, dislikes: new Set([k2]) })
    expect(r).toEqual({ ok: true, itemIds: [top1.id, bottom.id, shoes.id], key: k1, notes: [ONLY_OUTFIT] })
  })
})

describe('nothing fits (rule 10)', () => {
  it('tries once more without the warmth rule', () => {
    const items = [item('top', { warmth: 3 }), item('bottom', { warmth: 3 }), item('shoes', { warmth: 3 })]
    expect(pick({ items, forecast: { high: 30, low: 22, rainChance: 0 } }).ok).toBe(true)
  })

  it('says which slot has nothing clean, in order: tops, bottoms, shoes', () => {
    const msg = (items: Item[]) => (pick({ items }) as { message: string }).message
    expect(msg([item('top', { inHamper: true }), item('bottom'), item('shoes')])).toBe('No clean casual tops.')
    expect(msg([item('bottom')])).toBe('No clean casual tops.')
    expect(msg([item('top'), item('shoes')])).toBe('No clean casual bottoms.')
    expect(msg([item('top')])).toBe('No clean casual bottoms.')
    expect(msg([item('top'), item('bottom')])).toBe('No clean casual shoes.')
    expect(msg([item('dress')])).toBe('No clean casual shoes.') // a dress covers tops and bottoms
  })

  it("uses the occasion's name", () => {
    const r = pick({ items: [item('top')], settings: { comfortOffset: 0, lastOccasion: 'work', location: LONDON } })
    expect(r).toEqual({ ok: false, message: 'No clean work tops.' })
  })

  it("says the clothes don't go together when each slot has something", () => {
    const items = [item('top', { color: 'red' }), item('bottom', { color: 'blue' }), item('shoes')]
    expect(pick({ items })).toEqual({ ok: false, message: "Your clean casual clothes don't go together. Try Laundry done, or unlock an item." })
  })

  it('counts every outfit being disliked as nothing fitting', () => {
    const items = [item('top'), item('bottom'), item('shoes')]
    const r = pick({ items, dislikes: new Set([items.map((i) => i.id).join('|')]) })
    expect(r.ok).toBe(false)
  })
})

describe('no weather (rule 11)', () => {
  it('skips warmth and the coat', () => {
    const heavy = item('top', { warmth: 3 })
    const light = item('bottom', { warmth: 1 })
    const coat = item('outerwear')
    const r = pick({ items: [heavy, light, item('shoes'), coat], forecast: undefined })
    expect(r.ok && r.itemIds).toEqual([heavy.id, light.id, r.ok && r.itemIds[2]])
    expect(r.ok && r.notes).toEqual([])
  })
})
