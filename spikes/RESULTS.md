# Step 0 spike results

Pass criteria are in each table below. The README links here rather than copying the results.

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
**Caveat:** fake-indexeddb implements the IndexedDB spec, not Safari. Real Safari behavior is checked by the manual test on a phone (DESIGN §10).

## 0.2 iOS share sheet: PASS (2026-10-27)
Run on 2026-10-27 from the installed app on GitHub Pages. The page lived at `public/spike/` and was deleted once these results were recorded; it's in git history at commit `fc66b76`. It builds the file the same way the planned exporter does (one photo encoded at a time, BlobParts) using random 100KB "photos". It times the prepare step, then shares on a second tap. It also has a one-tap control that's expected to fail on iOS.

| Criterion | Result |
|---|---|
| Opened from the home-screen app ("Installed app: yes") | Pass: `standalone=true share=true canShare=true` |
| 150 items (~19MB) prepared in under 15s, no crash or reload | Pass: 20,009,728 bytes (19.1MB) in 0.26s, no reload logged |
| Share sheet opens on the second tap, 5 out of 5 tries | Pass: 5 of 5 |
| Save to Files → iCloud Drive gives a `.closet.json` file of about 19MB (Files → Get Info) | Pass (2026-10-27): `.json`, 20MB. Files can't preview it: a black screen that flashes white about every 30s. That's expected for 20MB of one-line JSON and doesn't matter, because the file is only read by import. |
| Cancelling the share sheet logs `AbortError` | Pass: 4 of 4, `AbortError — Abort due to cancellation of share.` |
| 150 items prepared from **IndexedDB-backed** photos ("Store photos first") in under 15s | Pass: 19.1MB in 0.26s |
| Saved file can be picked from iCloud Drive with `accept="application/json,.json"` (not greyed out) | Pass: picked as `type "application/json"`, 20,009,728 bytes |
| Import read-back (parse, a second export built while holding it, decode all photos): no crash or reload | Pass: 150 photos (15,000,000 bytes) decoded in 0.07s, then a byte-identical 20,009,728-byte second export, 0.28s in all, no reload |
| Import parse plus sniff under 10s | Pass: 0.03s |
| Key generator: IDs 1–30 written, `clear()`, next add gets 31 | Pass: 31 |
| One-tap control (for the record) | |
| iPhone model and iOS version | iPhone 16, iOS 26.6.1 |

Recorded, not pass/fail:

| Share outcome | Resolves or rejects (error name), and when |
|---|---|
| Save to Files → Save | Resolves (`shared`) once the file is saved |
| Save to Files → Cancel | |
| Copy | |
| Notes | |
| Messages, then discard | |
| AirDrop declined | |
| With `title`: extra text file saved? | |
| Android Chrome `canShare({ files: [jsonFile] })` | |
