// Auto-whiten (DESIGN §4 "Photos"): when the photo's edges look like a plain, light surface
// (a sheet, a wall), scales each channel so that surface becomes pure white. That also
// takes out a warm or cool cast from indoor light. Busy, dark or colored backgrounds, and
// ones that are already white (a cutout), are left alone. `px` is RGBA and changed in place.

const EDGE = 0.05 // the outer 5% on each side is taken as the background
const MIN_LEVEL = 150 // darker than this isn't a light surface; the gain would also be too strong
const MAX_TINT = 60 // channel spread: more is a colored background, not a sheet under warm light (~50)
const MAX_SPREAD = 25 // mean distance from the average: more is a busy background
const NEAR_WHITE = 235 // after scaling, anything this light becomes pure white

export function whitenBackground(px: Uint8ClampedArray, w: number, h: number): boolean {
  const band = Math.max(1, Math.round(Math.min(w, h) * EDGE))
  const edge: number[] = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (y >= band && y < h - band && x >= band && x < w - band) continue
      edge.push((y * w + x) * 4)
    }
  }
  const avg = [0, 1, 2].map((c) => edge.reduce((s, i) => s + px[i + c], 0) / edge.length)
  const level = (avg[0] + avg[1] + avg[2]) / 3
  const spread = edge.reduce((s, i) => s + Math.abs((px[i] + px[i + 1] + px[i + 2]) / 3 - level), 0) / edge.length
  if (Math.min(...avg) < MIN_LEVEL || Math.max(...avg) - Math.min(...avg) > MAX_TINT || spread > MAX_SPREAD) return false
  if (Math.min(...avg) >= 250) return false // already white

  const gain = avg.map((a) => 255 / a)
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i] * gain[0], g = px[i + 1] * gain[1], b = px[i + 2] * gain[2]
    const white = r >= NEAR_WHITE && g >= NEAR_WHITE && b >= NEAR_WHITE
    px[i] = white ? 255 : r
    px[i + 1] = white ? 255 : g
    px[i + 2] = white ? 255 : b
  }
  return true
}
