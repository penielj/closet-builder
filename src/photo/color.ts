import { PALETTE, type PaletteColor } from '../db/values'

export type RGB = readonly [number, number, number]

export const hexToRgb = (hex: string): RGB => {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

const PALETTE_RGB = PALETTE.map((c) => ({ name: c.name, rgb: hexToRgb(c.hex) }))

// "Redmean" weighted RGB distance: close to perceptual distance at a fraction of the
// cost of converting to Lab, which is plenty for snapping to 18 colors.
function distance(a: RGB, b: RGB): number {
  const rMean = (a[0] + b[0]) / 2
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2]
  return (2 + rMean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rMean) / 256) * db * db
}

export function nearestPaletteColor(rgb: RGB): PaletteColor {
  let best = PALETTE_RGB[0]
  let bestDistance = Infinity
  for (const c of PALETTE_RGB) {
    const d = distance(rgb, c.rgb)
    if (d < bestDistance) { best = c; bestDistance = d }
  }
  return best.name
}

// Each opaque pixel votes for its nearest palette color, and the most votes wins.
// `pixels` is RGBA, as returned by canvas getImageData.
export function dominantPaletteColor(pixels: Uint8ClampedArray | Uint8Array): PaletteColor | null {
  const votes = new Map<PaletteColor, number>()
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue
    const c = nearestPaletteColor([pixels[i], pixels[i + 1], pixels[i + 2]])
    votes.set(c, (votes.get(c) ?? 0) + 1)
  }
  let winner: PaletteColor | null = null
  let most = 0
  for (const [c, n] of votes) if (n > most) { winner = c; most = n }
  return winner
}
