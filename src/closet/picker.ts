import { type Forecast, type Item, type ItemId, type Settings, outfitKey } from '../db/schema'
import { NEUTRALS, type Occasion, type Season, type Warmth, label } from '../db/values'

// The outfit rules of DESIGN §5, as a pure function: no database or React in here.

export interface PickInput {
  items: Item[]
  settings: Pick<Settings, 'comfortOffset' | 'lastOccasion' | 'location'>
  forecast?: Forecast // undefined: rule 11, warmth and the coat are skipped
  date: string // today, YYYY-MM-DD local
  locked: ItemId[]
  current?: string // key of the outfit on screen now
  dislikes: ReadonlySet<string> // outfit keys
  random: () => number
}

// Why nothing fits (rule 10): a slot has nothing clean, the locks clash with everything,
// every outfit left has a 👎, or the clean clothes break rules 6 and 7.
export type NothingFits = 'missing' | 'locked' | 'disliked' | 'clash'

export type PickResult =
  | { ok: true; itemIds: ItemId[]; key: string; notes: string[] }
  | { ok: false; message: string; reason: NothingFits; slot?: Item['category'][] } // slot: the empty one, for 'missing'

export const ONLY_OUTFIT = 'This is the only outfit that fits.'
export const NO_COAT = 'No clean coat.'

// Rule 3: seasons by month, swapped south of the equator.
const NORTH: Season[] = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter']
const SWAP: Record<Season, Season> = { spring: 'autumn', summer: 'winter', autumn: 'spring', winter: 'summer' }
export function seasonOf(date: string, lat: number): Season {
  const s = NORTH[Number(date.slice(5, 7)) - 1]
  return lat < 0 ? SWAP[s] : s
}

// Rule 4: running cold (+3) makes every temperature feel 3°C colder.
export const feelsLike = (temp: number, comfortOffset: number) => temp - comfortOffset

export function targetWarmth(feelsHigh: number): Warmth {
  if (feelsHigh < 10) return 3
  if (feelsHigh > 20) return 1
  return 2
}

// Rule 9: when the weather calls for a coat.
export const coatWanted = (forecast: Forecast, comfortOffset: number) =>
  feelsLike(forecast.low, comfortOffset) < 15 || forecast.rainChance >= 50

export const isBase = (i: Pick<Item, 'category'>) => i.category !== 'outerwear'

const available = (i: Item, date: string) => !i.inHamper && i.skipDate !== date // rule 1

// Why an item fails rules 1–3 today, in words for the "nothing fits" screen, or
// undefined when it passes: clean, tagged with the occasion, and in season.
export type Excluded = 'hamper' | 'skipped' | 'occasion' | 'season'
export function whyNotFor(settings: PickInput['settings'], date: string): (i: Item) => { why: Excluded; text: string } | undefined {
  const occasion = settings.lastOccasion
  const season = settings.location && seasonOf(date, settings.location.lat)
  return (i) => {
    if (i.inHamper) return { why: 'hamper', text: 'In the hamper' }
    if (i.skipDate === date) return { why: 'skipped', text: 'Marked Not today' }
    if (!i.occasions.includes(occasion)) return { why: 'occasion', text: `Not tagged ${label(occasion)}` }
    if (season && i.seasons.length > 0 && !i.seasons.includes(season)) {
      return { why: 'season', text: `${i.seasons.map(label).join(', ')} only, and it's ${season}` }
    }
    return undefined
  }
}

export function fitsDayFor(settings: PickInput['settings'], date: string): (i: Item) => boolean {
  const whyNot = whyNotFor(settings, date)
  return (i) => !whyNot(i)
}

export function pickOutfit(input: PickInput): PickResult {
  const { items, settings, forecast, date, random } = input
  const occasion = settings.lastOccasion
  const fitsDay = fitsDayFor(settings, date)

  // Locks on items that are gone or no longer available are ignored (they're unlocked by the caller).
  const byId = new Map(items.map((i) => [i.id, i]))
  const locked = input.locked.map((id) => byId.get(id)).filter((i): i is Item => !!i && available(i, date))

  const attempt = (checkWarmth: boolean) => {
    const target = checkWarmth && forecast ? targetWarmth(feelsLike(forecast.high, settings.comfortOffset)) : undefined
    const passes = (i: Item) => fitsDay(i) && (target === undefined || Math.abs(i.warmth - target) <= 1)
    return combos(items, locked, passes).filter((c) => !input.dislikes.has(outfitKey(c.map((i) => i.id))))
  }

  let options = attempt(true)
  if (options.length === 0 && forecast) options = attempt(false) // rule 10: once more without rule 4
  if (options.length === 0) return { ok: false, ...nothingFits(items, locked, fitsDay, occasion, input.dislikes) }

  // Rule 8: drop the outfit on screen now, unless it's the only one left.
  const notes: string[] = []
  const fresh = options.filter((c) => outfitKey(c.map((i) => i.id)) !== input.current)
  if (fresh.length === 0) notes.push(ONLY_OUTFIT)
  else {
    // A new pick changes as much as it can: keep the outfits that share the fewest unlocked
    // items with the one on screen. An item in every one of them is the only choice for its slot.
    const shown = new Set(input.current?.split('|').map(Number))
    const lockedIds = new Set(locked.map((i) => i.id))
    const kept = (c: Item[]) => c.filter((i) => shown.has(i.id) && !lockedIds.has(i.id))
    const fewest = Math.min(...fresh.map((c) => kept(c).length))
    options = fresh.filter((c) => kept(c).length === fewest)
    for (const i of kept(fresh[0])) {
      if (fresh.every((c) => c.includes(i))) notes.push(`${i.name} is the only ${SINGULAR[i.category]} that fits today.`)
    }
  }
  const base = options[Math.floor(random() * options.length)]

  const coat = pickCoat(items, locked, fitsDay, forecast, settings.comfortOffset, random)
  if (coat === null) notes.push(NO_COAT)

  const key = outfitKey(base.map((i) => i.id))
  const itemIds = [...base, ...(coat ? [coat] : [])].map((i) => i.id)
  return { ok: true, itemIds, key, notes }
}

export interface SwipeInput extends Omit<PickInput, 'current' | 'random'> {
  outfit: ItemId[] // the outfit on screen, coat included
}

const SINGULAR: Record<Item['category'], string> = { top: 'top', bottom: 'bottom', dress: 'dress', shoes: 'pair of shoes', outerwear: 'coat' }

// Rule 12's choices for the slot `itemId` is in, in the order they were added, `itemId`
// included: what Today's carousel for that slot shows. Empty if `itemId` isn't an item.
export function slotChoices(input: SwipeInput, itemId: ItemId): Item[] {
  const { items, settings, forecast, date, outfit } = input
  const byId = new Map(items.map((i) => [i.id, i]))
  const swiped = byId.get(itemId)
  if (!swiped) return []

  const fitsDay = fitsDayFor(settings, date)
  const target = forecast && targetWarmth(feelsLike(forecast.high, settings.comfortOffset))
  const restBase = outfit.filter((id) => id !== itemId).map((id) => byId.get(id)).filter((i): i is Item => !!i && isBase(i))

  const fits = (c: Item) => {
    if (!fitsDay(c)) return false
    if (!isBase(c)) return true // a coat: rules 1–3 only, as in rule 9
    if (target !== undefined && Math.abs(c.warmth - target) > 1) return false
    const base = [...restBase, c]
    return goesTogether(base) && !input.dislikes.has(outfitKey(base.map((i) => i.id)))
  }
  return items
    .filter((c) => c.category === swiped.category && (c.id === itemId || fits(c)))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id)
}

// Rules 5–7: every top + bottom (or dress) + shoes, with locked items forced into their slot.
function combos(items: Item[], locked: Item[], passes: (i: Item) => boolean): Item[][] {
  const slot = (category: Item['category']) => {
    const lock = locked.find((i) => i.category === category)
    return lock ? [lock] : items.filter((i) => i.category === category && passes(i))
  }
  const lockedBase = locked.filter(isBase)
  const hasLock = (c: Item['category']) => lockedBase.some((i) => i.category === c)

  const bases: Item[][] = []
  if (!hasLock('dress')) {
    for (const top of slot('top')) for (const bottom of slot('bottom')) bases.push([top, bottom])
  }
  if (!hasLock('top') && !hasLock('bottom')) for (const dress of slot('dress')) bases.push([dress])

  const out: Item[][] = []
  for (const base of bases) for (const shoes of slot('shoes')) {
    const outfit = [...base, shoes]
    if (goesTogether(outfit)) out.push(outfit)
  }
  return out
}

// Rules 6 and 7, on base + shoes only (the coat isn't counted).
function goesTogether(outfit: Item[]): boolean {
  const statements = new Set(outfit.map((i) => i.color).filter((c) => !NEUTRALS.has(c)))
  const patterned = outfit.filter((i) => i.pattern !== 'solid').length
  return statements.size <= 1 && patterned <= 1
}

// Rule 9. Returns the coat, undefined when none is wanted, or null for "No clean coat."
function pickCoat(
  items: Item[], locked: Item[], fitsDay: (i: Item) => boolean,
  forecast: Forecast | undefined, comfortOffset: number, random: () => number,
): Item | undefined | null {
  const lockedCoat = locked.find((i) => i.category === 'outerwear')
  if (lockedCoat) return lockedCoat
  if (!forecast || !coatWanted(forecast, comfortOffset)) return undefined
  let coats = items.filter((i) => i.category === 'outerwear' && fitsDay(i))
  if (coats.length === 0) return null
  if (feelsLike(forecast.low, comfortOffset) < 5) {
    const warmest = Math.max(...coats.map((c) => c.warmth))
    coats = coats.filter((c) => c.warmth === warmest)
  }
  return coats[Math.floor(random() * coats.length)]
}

// Rule 10's messages, the first that applies. Locked items count as passing. Called after
// the retry without rule 4, so warmth isn't checked here either.
function nothingFits(
  items: Item[], locked: Item[], fitsDay: (i: Item) => boolean, occasion: Occasion, dislikes: ReadonlySet<string>,
): { message: string; reason: NothingFits; slot?: Item['category'][] } {
  const missing = (message: string, slot: Item['category'][]) => ({ message, reason: 'missing' as const, slot })
  const any = (c: Item['category']) => locked.some((i) => i.category === c) || items.some((i) => i.category === c && fitsDay(i))
  if (!any('top') && !any('dress')) return missing(`No ${occasion} tops for today.`, ['top', 'dress'])
  if (!any('bottom') && !any('dress')) return missing(`No ${occasion} bottoms for today.`, ['bottom', 'dress'])
  if (!any('shoes')) return missing(`No ${occasion} shoes for today.`, ['shoes'])

  const liked = (c: Item[]) => !dislikes.has(outfitKey(c.map((i) => i.id)))
  if (locked.length > 0 && combos(items, [], fitsDay).some(liked)) {
    return { message: "Your locked items don't go with anything clean. Unlock one to see more outfits.", reason: 'locked' }
  }
  if (combos(items, locked, fitsDay).length > 0) {
    return { message: `You've given a 👎 to every ${occasion} outfit that's left.`, reason: 'disliked' }
  }
  const laundry = items.some((i) => i.inHamper) ? ' Try Laundry done.' : ''
  return {
    message: `Your clean ${occasion} clothes don't go together: an outfit can have only one statement color and one pattern.${laundry}`,
    reason: 'clash',
  }
}
