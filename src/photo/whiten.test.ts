import { describe, expect, it } from 'vitest'
import { whitenBackground } from './whiten'

type RGB = [number, number, number]

// A w×h photo: `bg` everywhere, `center` in the middle half, and `noise` added to the bg.
function photo(bg: RGB, center: RGB, noise = 0, w = 40, h = 40) {
  const px = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const inside = x >= w / 4 && x < (3 * w) / 4 && y >= h / 4 && y < (3 * h) / 4
      const jitter = noise ? ((x * 7 + y * 13) % 2 ? noise : -noise) : 0
      const c = inside ? center : bg.map((v) => v + jitter)
      px.set([...c, 255], (y * w + x) * 4)
    }
  }
  return px
}
const at = (px: Uint8ClampedArray, x: number, y: number, w = 40) => [...px.slice((y * w + x) * 4, (y * w + x) * 4 + 3)]

describe('whitenBackground', () => {
  it('turns a warm, light sheet pure white and corrects the garment by the same amount', () => {
    const px = photo([240, 220, 200], [120, 110, 100]) // the garment is half as light as the sheet
    expect(whitenBackground(px, 40, 40)).toBe(true)
    expect(at(px, 0, 0)).toEqual([255, 255, 255])
    for (const v of at(px, 20, 20)) expect(Math.abs(v - 128)).toBeLessThanOrEqual(1) // the cast is gone: grey stays grey
  })

  it('leaves dark, colored and busy backgrounds alone', () => {
    for (const px of [
      photo([90, 90, 90], [200, 30, 30]), // dark floor
      photo([200, 230, 160], [20, 20, 20]), // green wall
      photo([180, 180, 180], [20, 20, 20], 60), // patterned rug
    ]) {
      const before = px.slice()
      expect(whitenBackground(px, 40, 40)).toBe(false)
      expect(px).toEqual(before)
    }
  })

  it('leaves an already-white background (an iPhone cutout) alone', () => {
    expect(whitenBackground(photo([255, 255, 255], [30, 40, 72]), 40, 40)).toBe(false)
  })
})
