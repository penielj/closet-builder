// Cuts the garment out of a photo with an on-device model (RMBG-1.4, DESIGN §4 "Cutout"),
// returning a PNG whose background is transparent. processPhoto then puts it on white.
// Everything is loaded on first use: transformers.js from a CDN (kept in Cache Storage so
// it works offline; not bundled, since GitHub's secret scanning flags a string in it),
// then the model, which the library caches itself.

const LIBRARY = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1/dist/transformers.min.js'
const LIBRARY_CACHE = 'cutout-transformers-4.3.1' // not 'closet-…': the service worker deletes those on update
const MODEL = 'briaai/RMBG-1.4'
const INPUT_SIDE = 1024 // the model's input size; larger photos only cost memory

// The parts of transformers.js used here.
interface Tensor { mul(n: number): Tensor; to(type: string): Tensor }
interface RawImage { width: number; height: number; data: Uint8ClampedArray; resize(w: number, h: number): Promise<RawImage> }
interface Library {
  AutoModel: { from_pretrained(id: string, options: object): Promise<(inputs: object) => Promise<{ output: Tensor[] }>> }
  AutoProcessor: { from_pretrained(id: string, options: object): Promise<(image: RawImage) => Promise<{ pixel_values: Tensor }>> }
  RawImage: { fromCanvas(canvas: HTMLCanvasElement): RawImage; fromTensor(t: Tensor): RawImage }
  env: { allowLocalModels: boolean }
}

export type Progress = (loaded: number, total: number) => void

async function loadLibrary(): Promise<Library> {
  const cache = await caches.open(LIBRARY_CACHE)
  let res = await cache.match(LIBRARY)
  if (!res) {
    res = await fetch(LIBRARY)
    if (!res.ok) throw new Error(`couldn't download the cutout library (${res.status})`)
    await cache.put(LIBRARY, res.clone())
  }
  const code = URL.createObjectURL(new Blob([await res.arrayBuffer()], { type: 'text/javascript' }))
  const lib = (await import(/* @vite-ignore */ code)) as Library
  lib.env.allowLocalModels = false
  return lib
}

// The GPU runs the half-precision model (~88MB); without one, the 8-bit model (~44MB) runs on the CPU.
async function loadModel(onProgress?: Progress) {
  const lib = await loadLibrary()
  const progress_callback = (p: { status: string; loaded: number; total: number }) => {
    if (p.status === 'progress_total') onProgress?.(p.loaded, p.total)
  }
  const load = (device: string, dtype: string) =>
    lib.AutoModel.from_pretrained(MODEL, { config: { model_type: 'custom' }, device, dtype, progress_callback })
  const model = 'gpu' in navigator ? await load('webgpu', 'fp16').catch(() => load('wasm', 'q8')) : await load('wasm', 'q8')
  // As on the model card: the model ships without a config transformers.js understands.
  const processor = await lib.AutoProcessor.from_pretrained(MODEL, {
    config: {
      do_normalize: true, do_pad: false, do_rescale: true, do_resize: true, image_mean: [0.5, 0.5, 0.5],
      feature_extractor_type: 'ImageFeatureExtractor', image_std: [1, 1, 1], resample: 2,
      rescale_factor: 0.00392156862745098, size: { width: INPUT_SIDE, height: INPUT_SIDE },
    },
  })
  return { lib, model, processor }
}

let loading: ReturnType<typeof loadModel> | undefined
export function prepareCutout(onProgress?: Progress) {
  loading ??= loadModel(onProgress).catch((e) => { loading = undefined; throw e }) // a failed load can be retried
  return loading
}

// `img` is the upright photo (an <img> applies the EXIF orientation).
export async function cutout(img: HTMLImageElement, onProgress?: Progress): Promise<Blob> {
  const { lib, model, processor } = await prepareCutout(onProgress)
  const scale = Math.min(1, INPUT_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
  const canvas = Object.assign(document.createElement('canvas'), {
    width: Math.round(img.naturalWidth * scale), height: Math.round(img.naturalHeight * scale),
  })
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

  const { pixel_values } = await processor(lib.RawImage.fromCanvas(canvas))
  const { output } = await model({ input: pixel_values })
  const mask = await lib.RawImage.fromTensor(output[0].mul(255).to('uint8')).resize(canvas.width, canvas.height)

  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height)
  for (let i = 0; i < mask.data.length; i++) pixels.data[i * 4 + 3] = mask.data[i]
  ctx.putImageData(pixels, 0, 0)
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("the cutout couldn't be saved"))), 'image/png'))
}
