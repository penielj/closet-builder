// Trims the white margin around a garment (DESIGN §4 "Look"), so pieces stack tightly in
// Today's flat lay. Done when a photo is shown, so photos saved before this get it too.
// A photo with a real background has no white margin and comes back as it was.

const WHITE = 245 // every channel at least this counts as background
const MARGIN = 0.02 // kept around the garment, as a share of the longer side

export interface Bounds { x: number; y: number; w: number; h: number }

// The smallest box around every non-white pixel of an RGBA image, plus the margin, or
// undefined when the image is all white.
export const garmentBounds = (px: Uint8ClampedArray, w: number, h: number) =>
  boundsWhere(w, h, (i) => px[i] < WHITE || px[i + 1] < WHITE || px[i + 2] < WHITE)

// The same for a cutout mask: the garment is where the mask isn't (nearly) black.
export const maskBounds = (px: Uint8ClampedArray, w: number, h: number) => boundsWhere(w, h, (i) => px[i] > 16)

function boundsWhere(w: number, h: number, isGarment: (i: number) => boolean): Bounds | undefined {
  let left = w, top = h, right = -1, bottom = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!isGarment((y * w + x) * 4)) continue
      if (x < left) left = x
      if (x > right) right = x
      if (y < top) top = y
      if (y > bottom) bottom = y
    }
  }
  if (right < 0) return undefined
  const m = Math.round(Math.max(w, h) * MARGIN)
  const x = Math.max(0, left - m), y = Math.max(0, top - m)
  return { x, y, w: Math.min(w, right + m + 1) - x, h: Math.min(h, bottom + m + 1) - y }
}

const trimmed = new WeakMap<Blob, Promise<Blob>>()

// The photo cropped to its garment. Cached per Blob, so each photo is trimmed once a session.
export function trimPhoto(blob: Blob): Promise<Blob> {
  let result = trimmed.get(blob)
  if (!result) {
    result = trim(blob).catch(() => blob)
    trimmed.set(blob, result)
  }
  return result
}

const cut = new WeakMap<Blob, Promise<Blob>>()

// A cutout: the photo with its mask as transparency, trimmed to the garment, as a PNG, so
// it can sit on white or black (DESIGN §4 "Look"). Cached per photo Blob.
export function cutPhoto(blob: Blob, mask: Blob): Promise<Blob> {
  let result = cut.get(blob)
  if (!result) {
    result = applyMask(blob, mask).catch(() => trimPhoto(blob))
    cut.set(blob, result)
  }
  return result
}

async function applyMask(blob: Blob, mask: Blob): Promise<Blob> {
  const [bmp, m] = await Promise.all([createImageBitmap(blob), createImageBitmap(mask)])
  const { width: w, height: h } = bmp
  const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h })
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(m, 0, 0, w, h)
  const alpha = ctx.getImageData(0, 0, w, h).data
  ctx.drawImage(bmp, 0, 0)
  const px = ctx.getImageData(0, 0, w, h)
  for (let i = 0; i < px.data.length; i += 4) px.data[i + 3] = alpha[i]
  const b = maskBounds(alpha, w, h) ?? { x: 0, y: 0, w, h }
  const out = Object.assign(document.createElement('canvas'), { width: b.w, height: b.h })
  out.getContext('2d')!.putImageData(px, -b.x, -b.y)
  return new Promise((resolve, reject) => out.toBlob((t) => (t ? resolve(t) : reject(new Error('no cutout'))), 'image/png'))
}

async function trim(blob: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(blob)
  const canvas = Object.assign(document.createElement('canvas'), { width: bmp.width, height: bmp.height })
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bmp, 0, 0)
  const b = garmentBounds(ctx.getImageData(0, 0, bmp.width, bmp.height).data, bmp.width, bmp.height)
  if (!b || (b.w === bmp.width && b.h === bmp.height)) return blob
  const out = Object.assign(document.createElement('canvas'), { width: b.w, height: b.h })
  out.getContext('2d')!.drawImage(bmp, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h)
  return new Promise((resolve) => out.toBlob((t) => resolve(t ?? blob), 'image/jpeg', 0.9))
}
