import { describe, expect, it } from 'vitest'
import { garmentBounds, maskBounds } from './trim'

// A w×h white image with a dark box at x0..x1, y0..y1 (inclusive).
function photo(w: number, h: number, box?: [number, number, number, number]) {
  const px = new Uint8ClampedArray(w * h * 4).fill(255)
  if (box) {
    const [x0, y0, x1, y1] = box
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) px.set([40, 40, 60, 255], (y * w + x) * 4)
  }
  return px
}

describe('garmentBounds', () => {
  it('boxes the garment with a 2% margin of the longer side', () => {
    // 100×200: margin 4px around a box from (30,50) to (69,149).
    expect(garmentBounds(photo(100, 200, [30, 50, 69, 149]), 100, 200)).toEqual({ x: 26, y: 46, w: 48, h: 108 })
  })

  it('keeps the margin inside the image', () => {
    expect(garmentBounds(photo(100, 100, [0, 0, 99, 49]), 100, 100)).toEqual({ x: 0, y: 0, w: 100, h: 52 })
  })

  it('counts near-white (a shadow on the sheet at 250) as background, but not light grey', () => {
    const px = photo(50, 50)
    px.set([250, 250, 250, 255], (10 * 50 + 10) * 4)
    expect(garmentBounds(px, 50, 50)).toBeUndefined()
    px.set([230, 230, 230, 255], (10 * 50 + 10) * 4)
    expect(garmentBounds(px, 50, 50)).toEqual({ x: 9, y: 9, w: 3, h: 3 })
  })
})

describe('maskBounds', () => {
  it('boxes where the mask is light, ignoring near-black noise', () => {
    const px = new Uint8ClampedArray(100 * 100 * 4) // black, opaque
    for (let i = 3; i < px.length; i += 4) px[i] = 255
    px.set([10, 10, 10, 255], (5 * 100 + 5) * 4) // noise: still background
    for (let y = 20; y <= 59; y++) for (let x = 40; x <= 79; x++) px.set([255, 255, 255, 255], (y * 100 + x) * 4)
    expect(maskBounds(px, 100, 100)).toEqual({ x: 38, y: 18, w: 44, h: 44 })
  })
})
