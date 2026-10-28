import type { PaletteColor } from '../db/values'
import { dominantPaletteColor } from './color'
import { whitenBackground } from './whiten'

export const MAX_SIDE = 800
const JPEG_QUALITY = 0.82
const COLOR_SAMPLE_SIDE = 32

export function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("This photo couldn't be read.")) }
    img.src = url // <img> applies the EXIF orientation, so the canvas gets the upright photo
  })
}

// Re-encoding through a canvas removes all EXIF data, including GPS. That keeps home
// coordinates out of the database and every backup (DESIGN §4), so
// don't replace this with storing the original file.
export async function processPhoto(file: Blob): Promise<{ photo: Blob; mask?: Blob; color: PaletteColor | null }> {
  const img = await loadImage(file)
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
  const w = Math.round(img.naturalWidth * scale)
  const h = Math.round(img.naturalHeight * scale)
  const mask = await maskOf(img, w, h)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  // JPEG has no transparency: without this, an iPhone cutout's background turns black (DESIGN §4 "Photos").
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(img, 0, 0, w, h)
  const pixels = ctx.getImageData(0, 0, w, h)
  const whitened = whitenBackground(pixels.data, w, h)
  if (whitened) ctx.putImageData(pixels, 0, 0)
  const photo = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("This photo couldn't be saved."))), 'image/jpeg', JPEG_QUALITY))

  // A whitened photo is sampled after the correction, so a warm cast doesn't turn white beige.
  const color = whitened ? sampleCenterColor(canvas, w, h) : sampleCenterColor(img, img.naturalWidth, img.naturalHeight)
  return { photo, mask, color }
}

// A cutout's transparency as a grayscale PNG (white = garment, black = background), so
// the garment can be shown on black too (DESIGN §4 "Look"). Undefined for a photo with
// no transparency: there's nothing to keep.
async function maskOf(img: HTMLImageElement, w: number, h: number): Promise<Blob | undefined> {
  const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h })
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, w, h)
  const px = ctx.getImageData(0, 0, w, h)
  let transparent = false
  for (let i = 3; i < px.data.length; i += 4) if (px.data[i] < 250) { transparent = true; break }
  if (!transparent) return undefined
  for (let i = 0; i < px.data.length; i += 4) {
    const a = px.data[i + 3]
    px.data[i] = px.data[i + 1] = px.data[i + 2] = a
    px.data[i + 3] = 255
  }
  ctx.putImageData(px, 0, 0)
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? undefined), 'image/png'))
}

// Samples the center 50% of the photo (DESIGN §4 "Auto color"), downscaled so the
// vote runs over about a thousand pixels. For the original image this canvas isn't
// filled, so a cutout's transparent background stays transparent and isn't counted.
function sampleCenterColor(source: CanvasImageSource, w: number, h: number): PaletteColor | null {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = COLOR_SAMPLE_SIDE
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(source, w / 4, h / 4, w / 2, h / 2, 0, 0, COLOR_SAMPLE_SIDE, COLOR_SAMPLE_SIDE)
  return dominantPaletteColor(ctx.getImageData(0, 0, COLOR_SAMPLE_SIDE, COLOR_SAMPLE_SIDE).data)
}
