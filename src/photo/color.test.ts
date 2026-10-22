import { describe, expect, it } from 'vitest'
import { PALETTE } from '../db/values'
import { dominantPaletteColor, hexToRgb, nearestPaletteColor } from './color'

const rgba = (pixels: [number, number, number, number][]) => Uint8ClampedArray.from(pixels.flat())

describe('nearestPaletteColor', () => {
  it('maps every palette swatch to itself', () => {
    for (const c of PALETTE) expect(nearestPaletteColor(hexToRgb(c.hex))).toBe(c.name)
  })

  it('snaps everyday garment colors to the expected name', () => {
    expect(nearestPaletteColor([10, 10, 12])).toBe('black')
    expect(nearestPaletteColor([255, 255, 255])).toBe('white')
    expect(nearestPaletteColor([25, 35, 70])).toBe('navy')
    expect(nearestPaletteColor([90, 115, 150])).toBe('denim')
    expect(nearestPaletteColor([200, 30, 30])).toBe('red')
    expect(nearestPaletteColor([120, 120, 120])).toBe('grey')
  })
})

describe('dominantPaletteColor', () => {
  it('picks the color with the most pixels', () => {
    const navy: [number, number, number, number] = [30, 40, 72, 255]
    const white: [number, number, number, number] = [244, 244, 242, 255]
    expect(dominantPaletteColor(rgba([navy, navy, navy, white, white]))).toBe('navy')
  })

  it('ignores transparent pixels', () => {
    const clearRed: [number, number, number, number] = [200, 30, 30, 0]
    const green: [number, number, number, number] = [46, 139, 87, 255]
    expect(dominantPaletteColor(rgba([clearRed, clearRed, clearRed, green]))).toBe('green')
  })

  it('returns null when there is nothing to sample', () => {
    expect(dominantPaletteColor(new Uint8ClampedArray())).toBeNull()
  })
})
