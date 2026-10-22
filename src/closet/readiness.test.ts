import { describe, expect, it } from 'vitest'
import type { Item } from '../db/schema'
import { closetReadiness } from './readiness'

const closet = (...categories: Item['category'][]) => categories.map((category) => ({ category }))

describe('closetReadiness (DESIGN Flow A)', () => {
  it('is not ready when empty, and lists everything missing', () => {
    expect(closetReadiness([])).toEqual({
      ready: false,
      have: { tops: 0, bottoms: 0, shoes: 0 },
      missing: ['3 more tops or dresses', '2 more bottoms or dresses', '1 more pair of shoes'],
    })
  })

  it('is ready at exactly 3 tops, 2 bottoms and 1 pair of shoes', () => {
    expect(closetReadiness(closet('top', 'top', 'top', 'bottom', 'bottom', 'shoes')).ready).toBe(true)
  })

  it('counts a dress toward both tops and bottoms', () => {
    expect(closetReadiness(closet('dress', 'dress', 'dress', 'shoes')).ready).toBe(true)
    expect(closetReadiness(closet('top', 'top', 'dress', 'bottom', 'shoes')).ready).toBe(true)
  })

  it('does not count outerwear toward anything', () => {
    const r = closetReadiness(closet('top', 'top', 'outerwear', 'bottom', 'bottom', 'shoes'))
    expect(r.missing).toEqual(['1 more top or dress'])
  })
})
