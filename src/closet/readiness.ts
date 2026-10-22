import type { Item } from '../db/schema'

// DESIGN Flow A: the picker needs at least 3 tops, 2 bottoms and 1 pair of shoes.
// A dress can replace a top and a bottom, so each dress counts toward both.
export const MINIMUM = { tops: 3, bottoms: 2, shoes: 1 } as const

export interface Readiness {
  ready: boolean
  have: { tops: number; bottoms: number; shoes: number }
  missing: string[]
}

export function closetReadiness(items: Pick<Item, 'category'>[]): Readiness {
  const count = (c: Item['category']) => items.filter((i) => i.category === c).length
  const dresses = count('dress')
  const have = {
    tops: count('top') + dresses,
    bottoms: count('bottom') + dresses,
    shoes: count('shoes'),
  }
  const missing: string[] = []
  const need = (n: number, one: string, many: string) => { if (n > 0) missing.push(`${n} more ${n === 1 ? one : many}`) }
  need(MINIMUM.tops - have.tops, 'top or dress', 'tops or dresses')
  need(MINIMUM.bottoms - have.bottoms, 'bottom or dress', 'bottoms or dresses')
  need(MINIMUM.shoes - have.shoes, 'pair of shoes', 'pairs of shoes')
  return { ready: missing.length === 0, have, missing }
}
