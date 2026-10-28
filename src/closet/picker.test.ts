import { describe, expect, it } from 'vitest'
import { type Forecast, type Item, outfitKey } from '../db/schema'
import {
  NO_COAT, NO_SWEATER, ONLY_OUTFIT, type PickInput, type SwipeInput, coatWanted, feelsLike, pickOutfit, seasonOf, refillOutfit, slotChoices, slotFill, targetWarmth,
  whyNotFor,
} from './picker'

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
    expect(r.ok === false && r.reason).toBe('clash')
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
    expect(msg([item('top', { inHamper: true }), item('bottom'), item('shoes')])).toBe('No casual tops for today.')
    expect(msg([item('bottom')])).toBe('No casual tops for today.')
    expect(msg([item('top'), item('shoes')])).toBe('No casual bottoms for today.')
    expect(msg([item('top')])).toBe('No casual bottoms for today.')
    expect(msg([item('top'), item('bottom')])).toBe('No casual shoes for today.')
    expect(msg([item('dress')])).toBe('No casual shoes for today.') // a dress covers tops and bottoms
  })

  it("uses the occasion's name", () => {
    const r = pick({ items: [item('top')], settings: { comfortOffset: 0, lastOccasion: 'work', location: LONDON } })
    expect(r).toEqual({ ok: false, message: 'No work tops for today.', reason: 'missing', slot: ['top', 'dress'] })
  })

  it("says the clothes clash when each slot has something, and suggests laundry only when the hamper isn't empty", () => {
    const items = [item('top', { color: 'red' }), item('bottom', { color: 'blue' }), item('shoes')]
    const clash = "Your clean casual clothes don't go together: an outfit can have only one statement color and one pattern."
    expect(pick({ items })).toEqual({ ok: false, message: clash, reason: 'clash' })
    expect(pick({ items: [...items, item('bottom', { inHamper: true })] }))
      .toEqual({ ok: false, message: `${clash} Try Laundry done.`, reason: 'clash' })
  })

  it('blames the locks when unlocking would leave an outfit', () => {
    const red = item('top', { color: 'red' })
    const items = [red, item('top'), item('bottom', { color: 'blue' }), item('shoes')]
    expect(pick({ items, locked: [red.id] })).toEqual({
      ok: false, message: "Your locked items don't go with anything clean. Unlock one to see more outfits.", reason: 'locked',
    })
  })

  it('says when every outfit left has a 👎', () => {
    const items = [item('top'), item('bottom'), item('shoes')]
    const r = pick({ items, dislikes: new Set([outfitKey(items.map((i) => i.id))]) })
    expect(r).toEqual({ ok: false, message: "You've given a 👎 to every casual outfit that's left.", reason: 'disliked' })
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

describe('slot choices for the swipe carousel (rule 12)', () => {
  const added = (n: number) => `2026-10-0${n}T00:00:00.000Z`
  const choices = (over: Partial<SwipeInput> & { items: Item[]; outfit: number[] }, id: number) =>
    slotChoices({
      settings: { comfortOffset: 0, lastOccasion: 'casual', location: LONDON },
      forecast: MILD, date: DATE, locked: [], dislikes: new Set(), ...over,
    }, id).map((i) => i.id)

  it('lists the slot in the order items were added, the shown item included', () => {
    const t3 = item('top', { createdAt: added(3) })
    const t1 = item('top', { createdAt: added(1) })
    const t2 = item('top', { createdAt: added(2) })
    const bottom = item('bottom'), shoes = item('shoes')
    expect(choices({ items: [t3, t1, t2, bottom, shoes], outfit: [t2.id, bottom.id, shoes.id] }, t2.id)).toEqual([t1.id, t2.id, t3.id])
  })

  it('skips items that break rules 1–4', () => {
    const top = item('top', { createdAt: added(1) })
    const bottom = item('bottom'), shoes = item('shoes')
    const items = [
      top, bottom, shoes,
      item('top', { createdAt: added(2), inHamper: true }),
      item('top', { createdAt: added(3), skipDate: DATE }),
      item('top', { createdAt: added(4), occasions: ['work'] }),
      item('top', { createdAt: added(5), seasons: ['summer'] }),
    ]
    const hot = item('top', { createdAt: added(6), warmth: 3 })
    const outfit = [top.id, bottom.id, shoes.id]
    expect(choices({ items: [...items, hot], outfit, forecast: { high: 28, low: 20, rainChance: 0 } }, top.id)).toEqual([top.id])
    // Without a forecast, warmth isn't checked.
    expect(choices({ items: [...items, hot], outfit, forecast: undefined }, top.id)).toEqual([top.id, hot.id])
  })

  it('keeps rules 6 and 7 with the rest of the outfit and skips disliked outfits', () => {
    const top = item('top', { createdAt: added(1) })
    const bottom = item('bottom', { color: 'red', pattern: 'print' }), shoes = item('shoes')
    const blueTop = item('top', { createdAt: added(2), color: 'blue' }) // a second statement color
    const stripedTop = item('top', { createdAt: added(3), pattern: 'striped' }) // a second pattern
    const disliked = item('top', { createdAt: added(4) })
    const ok = item('top', { createdAt: added(5), color: 'red' }) // the same statement color is fine
    const items = [top, bottom, shoes, blueTop, stripedTop, disliked, ok]
    const dislikes = new Set([outfitKey([disliked.id, bottom.id, shoes.id])])
    expect(choices({ items, outfit: [top.id, bottom.id, shoes.id], dislikes }, top.id)).toEqual([top.id, ok.id])
  })

  it('lists coats that pass rules 1–3, ignoring warmth, colors and patterns', () => {
    const top = item('top', { color: 'red' }), bottom = item('bottom'), shoes = item('shoes')
    const coat = item('outerwear', { createdAt: added(1) })
    const loud = item('outerwear', { createdAt: added(2), color: 'green', pattern: 'checked', warmth: 1 })
    const outfit = [top.id, bottom.id, shoes.id, coat.id]
    expect(choices({ items: [top, bottom, shoes, coat, loud], outfit, forecast: { high: 2, low: 0, rainChance: 0 } }, coat.id))
      .toEqual([coat.id, loud.id])
  })

  it('is just the item when nothing else fits, and empty for an unknown item', () => {
    const [top, bottom, shoes] = [item('top'), item('bottom'), item('shoes')]
    const outfit = [top.id, bottom.id, shoes.id]
    expect(choices({ items: [top, bottom, shoes], outfit }, shoes.id)).toEqual([shoes.id])
    expect(choices({ items: [top, bottom, shoes], outfit }, 9999)).toEqual([])
  })
})

describe('why an item is out today (rule 10 screen)', () => {
  it('names the reason for each of three tops when none can be picked (phone test 2)', () => {
    const skipped = item('top', { skipDate: DATE })
    const summer = item('top', { seasons: ['summer'] })
    const work = item('top', { occasions: ['work'] })
    const items = [skipped, summer, work, item('bottom'), item('shoes')]
    const settings = { comfortOffset: 0 as const, lastOccasion: 'casual' as const, location: LONDON }
    const r = pick({ items, settings })
    expect(r).toEqual({ ok: false, message: 'No casual tops for today.', reason: 'missing', slot: ['top', 'dress'] })
    const whyNot = whyNotFor(settings, DATE)
    expect([skipped, summer, work].map((i) => whyNot(i)?.text)).toEqual([
      'Marked Not today', 'Summer only, and it\'s autumn', 'Not tagged Casual',
    ])
    expect(whyNot(item('top', { inHamper: true }))?.why).toBe('hamper')
    expect(whyNot(item('top', { seasons: ['autumn', 'winter'] }))).toBeUndefined()
    expect(whyNotFor({ ...settings, location: undefined }, DATE)(summer)).toBeUndefined() // no location: no season rule
  })
})

describe('shuffle changes as much as it can (rule 8)', () => {
  it('prefers outfits that change every unlocked item', () => {
    const [t1, t2, b1, b2, shoes] = [item('top'), item('top'), item('bottom'), item('bottom'), item('shoes')]
    const s2 = item('shoes')
    const items = [t1, t2, b1, b2, shoes, s2]
    const current = outfitKey([t1.id, b1.id, shoes.id])
    for (const k of allPicks({ items, current })) {
      expect(k.split(',').map(Number)).toEqual([t2.id, b2.id, s2.id])
    }
  })

  it("says when an item stays because it's the only one that fits", () => {
    const tee = item('top', { name: 'Grey tee' })
    const [b1, b2, shoes] = [item('bottom'), item('bottom'), item('shoes', { name: 'Sneakers' })]
    const r = pick({ items: [tee, b1, b2, shoes, item('top', { seasons: ['summer'] })], current: outfitKey([tee.id, b1.id, shoes.id]) })
    expect(r.ok && r.itemIds).toEqual([tee.id, b2.id, shoes.id])
    expect(r.ok && r.notes).toEqual(['Grey tee is the only top that fits today.', 'Sneakers is the only pair of shoes that fits today.'])
  })

  it("doesn't mention locked items", () => {
    const tee = item('top')
    const [b1, b2, shoes] = [item('bottom'), item('bottom'), item('shoes')]
    const s2 = item('shoes')
    const r = pick({ items: [tee, item('top'), b1, b2, shoes, s2], locked: [tee.id], current: outfitKey([tee.id, b1.id, shoes.id]) })
    expect(r.ok && r.itemIds).toEqual([tee.id, b2.id, s2.id])
    expect(r.ok && r.notes).toEqual([])
  })
})

describe('layers: sweater (rule 13), hat and bag (rule 14)', () => {
  const base = () => [item('top'), item('bottom'), item('shoes')]
  const COOL: Forecast = { high: 17, low: 16, rainChance: 0 } // sweater, no coat
  const WARM: Forecast = { high: 18, low: 16, rainChance: 0 } // no sweater
  const ids = (r: ReturnType<typeof pick>) => (r.ok ? r.itemIds : [])

  it('adds a sweater after the base when the feels-like high is below 18°C, with the comfort offset', () => {
    const sweater = item('sweater')
    const items = [...base(), sweater]
    expect(ids(pick({ items, forecast: COOL }))).toContain(sweater.id)
    expect(ids(pick({ items, forecast: WARM }))).not.toContain(sweater.id)
    const cold = { comfortOffset: 3 as const, lastOccasion: 'casual' as const, location: LONDON } // 18 feels like 15
    expect(ids(pick({ items, forecast: WARM, settings: cold }))).toContain(sweater.id)
    expect(ids(pick({ items, forecast: undefined }))).not.toContain(sweater.id) // no weather, no sweater
  })

  it('counts the sweater in rules 6 and 7, and says when none goes with the base', () => {
    const red = item('top', { color: 'red' })
    const checked = item('bottom', { pattern: 'checked' }) // so a striped sweater makes two patterns
    const items = [red, checked, item('shoes'), item('sweater', { color: 'green' }), item('sweater', { pattern: 'striped', color: 'navy' })]
    expect(pick({ items, forecast: COOL })).toMatchObject({ ok: true, notes: [NO_SWEATER] })
    const ok = item('sweater', { color: 'red' })
    expect(ids(pick({ items: [...items, ok], forecast: COOL }))).toContain(ok.id)
  })

  it('says nothing about sweaters when there are none at all', () => {
    expect(pick({ items: base(), forecast: COOL })).toMatchObject({ ok: true, notes: [] })
  })

  it('keeps a locked sweater whatever the weather, and only picks bases that go with it', () => {
    const green = item('sweater', { color: 'green' })
    const red = item('top', { color: 'red' }), plain = item('top')
    const r = pick({ items: [red, plain, item('bottom'), item('shoes'), green], forecast: WARM, locked: [green.id] })
    expect(ids(r)).toContain(green.id)
    expect(ids(r)).toContain(plain.id)
  })

  it('adds a hat and a bag last when one passes rules 1–3, whatever their colors', () => {
    const hat = item('hat', { color: 'yellow' }), bag = item('bag', { pattern: 'print', color: 'pink' })
    const outfit = ids(pick({ items: [...base(), hat, bag, item('hat', { inHamper: true })], forecast: WARM }))
    expect(outfit.slice(-2)).toEqual([hat.id, bag.id])
    expect(ids(pick({ items: base(), forecast: WARM }))).toHaveLength(3) // none: no note, nothing added
  })

  it('leaves layers out of the outfit key, so a 👎 is about the base', () => {
    const items = [...base(), item('sweater'), item('hat')]
    const r = pick({ items, forecast: COOL })
    expect(r.ok && r.key).toBe(outfitKey(items.slice(0, 3).map((i) => i.id)))
  })
})

describe('slot choices for layers (rule 12)', () => {
  it('a sweater keeps rules 6 and 7 with the base; a hat only needs rules 1–3', () => {
    const top = item('top', { color: 'red' }), bottom = item('bottom'), shoes = item('shoes')
    const s1 = item('sweater', { createdAt: '2026-10-01T00:00:00.000Z' })
    const green = item('sweater', { color: 'green', createdAt: '2026-10-02T00:00:00.000Z' })
    const h1 = item('hat'), h2 = item('hat', { color: 'green', pattern: 'print' })
    const input = {
      items: [top, bottom, shoes, s1, green, h1, h2], settings: { comfortOffset: 0 as const, lastOccasion: 'casual' as const, location: LONDON },
      forecast: MILD, date: DATE, locked: [], dislikes: new Set<string>(), outfit: [top.id, bottom.id, shoes.id, s1.id, h1.id],
    }
    expect(slotChoices(input, s1.id).map((i) => i.id)).toEqual([s1.id])
    expect(slotChoices(input, h1.id).map((i) => i.id)).toEqual([h1.id, h2.id])
    // Swiping the top has to go with the sweater on too: with a green one, no other red top is offered.
    const other = item('top', { color: 'red', createdAt: '2026-10-03T00:00:00.000Z' })
    const tops = slotChoices({ ...input, items: [...input.items, other], outfit: [top.id, bottom.id, shoes.id, green.id] }, top.id)
    expect(tops.map((i) => i.id)).toEqual([top.id])
  })
})

describe('refilling only the slot that changed (rule 15)', () => {
  const input = (items: Item[], outfit: number[], over: Partial<SwipeInput> = {}) => ({
    items, settings: { comfortOffset: 0 as const, lastOccasion: 'casual' as const, location: LONDON },
    forecast: MILD, date: DATE, locked: [], dislikes: new Set<string>(), outfit, random: () => 0, ...over,
  })

  it('replaces a base piece that left with another that fits, keeping the rest', () => {
    const [t1, b1, s1] = [item('top'), item('bottom'), item('shoes')]
    const t2 = item('top', { color: 'red' })
    const hampered = { ...t1, inHamper: true }
    expect(refillOutfit(input([hampered, t2, b1, s1], [b1.id, s1.id]), [hampered])).toEqual([b1.id, s1.id, t2.id])
  })

  it("picks anew when the slot can't be filled, or nothing of the base is left", () => {
    const [b1, s1] = [item('bottom'), item('shoes')]
    expect(refillOutfit(input([b1, s1, item('top', { inHamper: true })], [b1.id, s1.id]), [])).toBeUndefined()
    expect(refillOutfit(input([item('top'), b1, s1], [s1.id]), [])).toBeUndefined()
  })

  it('replaces a layer with another of its kind if one fits, and otherwise leaves it out', () => {
    const [t, b, s] = [item('top'), item('bottom'), item('shoes')]
    const hat1 = item('hat', { skipDate: DATE }), hat2 = item('hat')
    expect(refillOutfit(input([t, b, s, hat1, hat2], [t.id, b.id, s.id]), [hat1])).toEqual([t.id, b.id, s.id, hat2.id])
    expect(refillOutfit(input([t, b, s, hat1], [t.id, b.id, s.id]), [hat1])).toEqual([t.id, b.id, s.id])
  })

  it('a refilled base piece goes with the sweater still on, and skips 👎 outfits', () => {
    const [b, s] = [item('bottom'), item('shoes')]
    const green = item('sweater', { color: 'green' })
    const red = item('top', { color: 'red' }), disliked = item('top'), ok = item('top', { color: 'green' })
    const dislikes = new Set([outfitKey([disliked.id, b.id, s.id])])
    expect(refillOutfit(input([red, disliked, ok, b, s, green], [b.id, s.id, green.id], { dislikes }), []))
      .toEqual([b.id, s.id, green.id, ok.id])
  })

  it('slotFill lists what an empty layer slot can take, for adding one by hand', () => {
    const [t, b, s] = [item('top', { color: 'red' }), item('bottom'), item('shoes')]
    const navy = item('sweater', { color: 'navy' }), green = item('sweater', { color: 'green' })
    expect(slotFill(input([t, b, s, navy, green], [t.id, b.id, s.id]), 'sweater').map((i) => i.id)).toEqual([navy.id])
  })
})

describe('rotation (rule 17)', () => {
  it('prefers outfits with pieces not worn in the last 3 days, and layers too', () => {
    const worn = item('top', { lastWorn: '2026-10-21' }) // yesterday
    const rested = item('top', { lastWorn: '2026-10-10' })
    const [b, s] = [item('bottom'), item('shoes')]
    const h1 = item('hat', { lastWorn: '2026-10-22' }), h2 = item('hat')
    for (const r of allPicks({ items: [worn, rested, b, s, h1, h2] })) {
      expect(r.split(',').map(Number)).toEqual([rested.id, b.id, s.id, h2.id])
    }
  })

  it('still wears recently worn pieces when nothing else fits, or when locked', () => {
    const worn = item('top', { lastWorn: '2026-10-22' })
    const [b, s] = [item('bottom', { lastWorn: '2026-10-22' }), item('shoes')]
    expect(ids(pick({ items: [worn, b, s] }))).toEqual([worn.id, b.id, s.id])
    const rested = item('top')
    expect(ids(pick({ items: [worn, rested, b, s], locked: [worn.id] }))).toEqual([worn.id, b.id, s.id])
  })
})
