import { describe, expect, it } from 'vitest'
import { CATEGORIES, OCCASIONS, PALETTE, PATTERNS, SEASONS } from './values'

// These lists are part of the backup format. If one of these tests fails, a value was
// renamed or removed, which needs a backup migration and a DESIGN §6 update.
describe('tag values match DESIGN §6', () => {
  it('has the fixed lists', () => {
    expect(CATEGORIES).toEqual(['top', 'bottom', 'dress', 'shoes', 'outerwear'])
    expect(PATTERNS).toEqual(['solid', 'striped', 'checked', 'print'])
    expect(OCCASIONS).toEqual(['casual', 'work', 'formal', 'workout'])
    expect(SEASONS).toEqual(['spring', 'summer', 'autumn', 'winter'])
  })

  it('has 18 palette colors: 7 neutrals and 11 statement colors (DESIGN §6)', () => {
    expect(PALETTE).toHaveLength(18)
    expect(PALETTE.filter((c) => c.neutral).map((c) => c.name))
      .toEqual(['black', 'white', 'grey', 'navy', 'denim', 'beige', 'brown'])
    expect(new Set(PALETTE.map((c) => c.name)).size).toBe(18)
    for (const c of PALETTE) expect(c.name).toMatch(/^[a-z]+(-[a-z]+)*$/)
  })
})
