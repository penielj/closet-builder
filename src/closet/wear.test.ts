import { describe, expect, it } from 'vitest'
import { NEVER, rested, washAfter, wornRecently } from './wear'

describe('wash after (rule 16)', () => {
  it('defaults by category: tops 1, bottoms, dresses and sweaters 3, the rest never', () => {
    const w = (category: Parameters<typeof washAfter>[0]['category']) => washAfter({ category, occasions: ['casual'] })
    expect([w('top'), w('bottom'), w('dress'), w('sweater')]).toEqual([1, 3, 3, 3])
    expect([w('shoes'), w('outerwear'), w('hat'), w('bag')]).toEqual([NEVER, NEVER, NEVER, NEVER])
  })

  it("makes workout-only clothes 1, and the item's own setting wins", () => {
    expect(washAfter({ category: 'bottom', occasions: ['workout'] })).toBe(1)
    expect(washAfter({ category: 'bottom', occasions: ['workout', 'casual'] })).toBe(3)
    expect(washAfter({ category: 'shoes', occasions: ['workout'] })).toBe(NEVER)
    expect(washAfter({ category: 'bottom', occasions: ['casual'], washAfter: 5 })).toBe(5)
    expect(washAfter({ category: 'top', occasions: ['casual'], washAfter: NEVER })).toBe(NEVER)
  })
})

describe('rotation (rule 17)', () => {
  it('counts wears on the last 3 days as recent', () => {
    expect(wornRecently({ lastWorn: '2026-10-28' }, '2026-10-28')).toBe(true)
    expect(wornRecently({ lastWorn: '2026-10-25' }, '2026-10-28')).toBe(true)
    expect(wornRecently({ lastWorn: '2026-10-24' }, '2026-10-28')).toBe(false)
    expect(wornRecently({}, '2026-10-28')).toBe(false)
  })

  it('prefers rested pieces, and uses all of them when none is rested', () => {
    const a = { lastWorn: '2026-10-27' }, b = {}
    expect(rested([a, b], '2026-10-28')).toEqual([b])
    expect(rested([a], '2026-10-28')).toEqual([a])
  })
})
