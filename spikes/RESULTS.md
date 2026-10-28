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

## 0.3 Category from the photo: not run yet
Page: `public/spike/` (https://penielj.github.io/closet-builder/spike/), installed to the home screen as its own app ("Category spike"), like 0.2. Delete it once these results are recorded.

How it works: a CLIP-style model compares the photo with 26 short descriptions ("a photo of a pair of jeans.") spread over the five categories, and each category scores its best-matching description. The descriptions are turned into numbers once on a computer (`spikes/category-embed-text.mjs` writes `public/spike/text-embeds.json`), so the phone only downloads the image half of the model. Photos go through the app's own resize (800px, white fill, JPEG) first. The library is transformers.js 4.3.1 (`transformers.min.js`), loaded from jsdelivr and kept in the page's own cache. It isn't committed: GitHub's push protection flagged a string in the minified file as a "Mistral AI API key" (a false positive in third-party code). The ~28MB runtime and the model are downloaded once and cached by the library.

Checked on a Mac in Chrome before the phone run (2026-10-28), on 3 Wikimedia photos (a t-shirt, sneakers, a trench coat):

| Model | Model files | Per photo | Right |
|---|---|---|---|
| MobileCLIP-S0, full precision | 43.4MB | ~0.17s | 3 of 3 |
| MobileCLIP-S0, 8-bit (q8) | 11.8MB | | Broken: everything is "skirt". Left off the page. |
| CLIP ViT-B/32, 8-bit (q8) | 85.0MB | ~0.21s | 3 of 3 |

Pass criteria (DESIGN §8 step 4), from the installed app on the iPhone, with 20 real photos:

| Criterion | MobileCLIP-S0 | CLIP ViT-B/32 |
|---|---|---|
| At least 18 of 20 right (the tally line) | | |
| Under 3s per photo once loaded (the tally line: avg and slowest) | | |
| Download under 100MB (Show storage used, after loading only this model) | | |
| Loads in Airplane Mode after closing and reopening the app | | |
| No crash or reload (no "⚠ RELOAD" in the log) | | |
| Which ones it got wrong, and what it said | | |

Recorded, not pass/fail: first load time, cached load time, and whether GPU (WebGPU) loads and is faster than CPU.

## 0.4 Background removal: not run yet
Same page, section 3, run in the same session as 0.3. The model is RMBG-1.4 (BRIA), loaded as on its model card (transformers.js's background-removal pipeline doesn't recognize it). It predicts a mask at 1024×1024, and the page composites the photo onto white. **License:** free for non-commercial use only, which fits a personal app; selling the app would need BRIA's commercial license. Clothes need to be laid flat or hung: worn clothes keep the person, since the model keeps the subject.

Checked on a Mac in Chrome (2026-10-28), on sneakers on black velvet and a man in a t-shirt. Both cut cleanly (the t-shirt photo kept the man, as expected):

| Run on | Model files | Per photo |
|---|---|---|
| CPU (wasm, one thread: GitHub Pages can't enable threads) | 42.3MB (q8) | ~7.1s |
| GPU (WebGPU) | 84.1MB (fp16) | 0.26–0.50s |

The CPU time is the risk: a phone is likely slower than this Mac. Pass criteria, from the installed app on the iPhone, with 20 photos of clothes laid flat or hung on ordinary backgrounds (a bed, a floor, a door):

| Criterion | CPU (q8) | GPU (fp16) |
|---|---|---|
| At least 16 of 20 rated Good (the tally line) | | |
| Under 5s per photo (the tally line: avg and slowest) | | |
| Loads and runs at all | | |
| No crash or reload (no "⚠ RELOAD" in the log) | | |
| What the Bad ones got wrong (cut into the garment, left background, lost a strap…) | | |

Download: q8 plus the shared ~28MB runtime is ~70MB. With fp16 it's ~112MB, over the 100MB budget of 0.3 on its own. Shipping category recognition too adds that model (43MB for MobileCLIP-S0), so the budget gets decided with both results in hand.
