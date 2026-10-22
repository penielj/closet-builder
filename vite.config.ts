/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// GitHub Pages serves the app at https://<user>.github.io/closet-builder/ (DESIGN §7 Hosting).
// The manifest's start_url and scope in public/manifest.webmanifest must match this path.
export default defineConfig({
  base: '/closet-builder/',
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['fake-indexeddb/auto'],
  },
})
