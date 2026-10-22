/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { type Plugin, defineConfig } from 'vite'

// Emits sw.js from src/sw.js with the list of built files to precache. Bundle names are
// content-hashed, so any change to the app gives the worker a new version.
function serviceWorker(): Plugin {
  let base = '/'
  let publicDir = ''
  return {
    name: 'closet-service-worker',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      base = config.base
      publicDir = config.publicDir
    },
    generateBundle(_, bundle) {
      const publicFiles = readdirSync(publicDir, { recursive: true, withFileTypes: true })
        .filter((d) => d.isFile())
        .map((d) => relative(publicDir, join(d.parentPath, d.name)).split('\\').join('/'))
        .filter((f) => !f.startsWith('spike/')) // the throwaway spike page isn't part of the app
      const files = [...Object.keys(bundle), ...publicFiles]
        .filter((f) => !f.endsWith('.map') && f !== 'index.html')
        .sort()
      const urls = [base, ...files.map((f) => base + f)]
      const version = createHash('sha256').update(urls.join('\n')).digest('hex').slice(0, 12)
      const source = readFileSync(new URL('./src/sw.js', import.meta.url), 'utf8')
        .replace('__PRECACHE__', JSON.stringify(urls))
        .replace('__VERSION__', JSON.stringify(version))
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

// GitHub Pages serves the app at https://<user>.github.io/closet-builder/ (DESIGN §7 Hosting).
// The manifest's start_url and scope in public/manifest.webmanifest must match this path.
export default defineConfig({
  base: '/closet-builder/',
  plugins: [react(), serviceWorker()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['fake-indexeddb/auto'],
  },
})
