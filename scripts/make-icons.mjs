// Generates the app icons in public/icons/ with no image dependencies: a coat hanger
// drawn pixel by pixel and written as PNG with Node's zlib. Run: node scripts/make-icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const BG = [28, 28, 26]
const FG = [247, 246, 243]

function crc32(buf) {
  let c, crc = 0xffffffff
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crc = (crc >>> 8) ^ c
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

function png(size, pixel) {
  const raw = Buffer.alloc(size * (size * 3 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x / size, y / size)
      raw.set([r, g, b], y * (size * 3 + 1) + 1 + x * 3)
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8; ihdr[9] = 2 // 8-bit RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ])
}

// Distance from point p to segment a–b, in icon units (0..1).
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

// Hanger inside the central 60%, so it survives a maskable crop.
const STROKE = 0.035
function hanger(x, y) {
  const lines = [
    [0.5, 0.42, 0.22, 0.66], // left shoulder
    [0.5, 0.42, 0.78, 0.66], // right shoulder
    [0.22, 0.66, 0.78, 0.66], // bar
    [0.5, 0.42, 0.5, 0.36], // neck
  ]
  if (lines.some((l) => segDist(x, y, ...l) < STROKE)) return true
  const r = Math.hypot(x - 0.5, y - 0.3) // hook: arc above the neck
  const angle = Math.atan2(y - 0.3, x - 0.5)
  return Math.abs(r - 0.06) < STROKE && !(angle > 0.3 && angle < 1.9)
}

mkdirSync('public/icons', { recursive: true })
for (const [file, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  // 3x3 supersampling smooths the edges.
  writeFileSync(`public/icons/${file}`, png(size, (x, y) => {
    let hits = 0
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (hanger(x + (i + 0.5) / (3 * size), y + (j + 0.5) / (3 * size))) hits++
    return BG.map((b, k) => Math.round(b + (FG[k] - b) * (hits / 9)))
  }))
  console.log(`public/icons/${file}`)
}
