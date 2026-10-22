import type { PaletteColor } from '../db/values'
import { dominantPaletteColor } from './color'

export const MAX_SIDE = 800
const JPEG_QUALITY = 0.82
const COLOR_SAMPLE_SIDE = 32

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("This photo couldn't be read.")) }
    img.src = url // <img> applies the EXIF orientation, so the canvas gets the upright photo
  })
}

// Re-encoding through a canvas removes all EXIF data, including GPS. That keeps home
// coordinates out of the database and every backup (BACKUP-IMPLEMENTATION §2.8), so
// don't replace this with storing the original file.
export async function processPhoto(file: Blob): Promise<{ photo: Blob; color: PaletteColor | null }> {
  const img = await loadImage(file)
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
  const w = Math.round(img.naturalWidth * scale)
  const h = Math.round(img.naturalHeight * scale)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
  const photo = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("This photo couldn't be saved."))), 'image/jpeg', JPEG_QUALITY))

  return { photo, color: sampleCenterColor(img) }
}

// Samples the center 50% of the photo (DESIGN §5.1 "Auto color"), downscaled so the
// vote runs over about a thousand pixels.
function sampleCenterColor(img: HTMLImageElement): PaletteColor | null {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = COLOR_SAMPLE_SIDE
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const sw = img.naturalWidth / 2, sh = img.naturalHeight / 2
  ctx.drawImage(img, sw / 2, sh / 2, sw, sh, 0, 0, COLOR_SAMPLE_SIDE, COLOR_SAMPLE_SIDE)
  return dominantPaletteColor(ctx.getImageData(0, 0, COLOR_SAMPLE_SIDE, COLOR_SAMPLE_SIDE).data)
}
