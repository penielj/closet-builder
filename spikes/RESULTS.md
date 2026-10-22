# Step 0 spike results

Pass criteria: BACKUP-IMPLEMENTATION.md, step 0. Move these results into the README once the repo exists.

## 0.1 Photo Blobs in tests: PASS (2026-10-21)
`spikes/blob-storage/blob.test.js`, run with Vitest 4.1.12, Dexie 4.4.6, fake-indexeddb 6.2.6 and Node 20.20.2, in `environment: 'node'`.

| Check | Result |
|---|---|
| 100KB `image/jpeg` Blob written through Dexie reads back as a `Blob` with the same type, size and bytes | Pass |
| Blobs written by `bulkAdd` inside a `rw` transaction read back byte-equal | Pass |
| `bulkAdd` with explicit IDs keeps them; the next `add` gets highest + 1 | Pass |
| `clear()` doesn't reset the key generator: an old phone at ID 60 restored with a file topping out at 30, and the next item is 61 | Pass |

The app's own tests (`src/db/repo.test.ts`) now cover Blob storage too.

**Decision:** the plan's test setup stands. Use Node + fake-indexeddb, with no need for Vitest browser mode.
**Caveat:** fake-indexeddb implements the IndexedDB spec, not Safari. Real Safari behavior is covered by the device drill (step 12d).

## 0.2 iOS share sheet: NOT RUN YET
Deferred to the first GitHub Pages deploy of the skeleton. It must pass before the backup screens are built. The page lives at `public/spike/` and is served at `https://<user>.github.io/closet-builder/spike/`. Delete `public/spike/` after recording the result. It builds the file the same way the planned exporter does (one photo encoded at a time, BlobParts) using random 100KB "photos". It times the prepare step, then shares on a second tap. It also has a one-tap control that's expected to fail on iOS.

| Criterion | Result |
|---|---|
| Opened from the home-screen app ("Installed app: yes") | |
| 150 items (~19MB) prepared in under 15s, no crash or reload | |
| Share sheet opens on the second tap, 5 out of 5 tries | |
| Save to Files → iCloud Drive gives a file of about 19MB that opens in Files | |
| Cancelling the share sheet logs `AbortError` | |
| One-tap control (for the record) | |
| iPhone model and iOS version | |
