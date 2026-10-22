# Backup & Restore: Implementation Plan

**Feature:** Export closet to file / Import closet from file (DESIGN.md Flow E, §5.1 "Backup", §7 "Backup file format")
**Builds on:** DESIGN.md (Draft v3, the spec) and BACKUP-PROPOSAL.md (Draft 1)
**Status:** Implementation plan, revised with two rounds of owner decisions (§5) · **Date:** 2026-10-21
**When:** build order step 2 in DESIGN §7, after the app skeleton and before the outfit picker.

This document takes the proposal's direction (one JSON file, manual export, restore by replacing) and turns it into a build plan. It also corrects several places where the proposal would break once implemented. The main disagreements are summarized in §3.8.

---

## 1. Problem

### 1.1 What goes wrong without it
All of Closet Builder's data lives on one phone. DESIGN.md §3 makes this a goal ("Keep data on the device") and rules out accounts and sync (§3 non-goals). So the closet only exists inside one browser's IndexedDB. The expensive part of the app to rebuild is the data, not the code:

- **The catalog.** Each item takes a photo, a color pick and around seven tags (Flow B). The app is only useful from about 20 items (§3), so one closet is roughly an hour of setup. Many people will add more later.
- **Learned taste.** 👍/👎 ratings (§5.2, §6.5) are collected one morning at a time and can't be re-entered in bulk. If they're lost, rejected outfits come back.
- **Current state.** The hamper (Flow D) and preferences (comfort offset, occasion, color mode).

Any of these can wipe that IndexedDB: a lost or broken phone, a new phone, deleting the home-screen app, clearing Safari website data, or the browser evicting storage under pressure. Installing the app (§7) lowers the eviction risk but does nothing about the others. Without a backup, every one of those events means rebuilding from scratch, and the person most likely to stop using the app is someone who just lost an hour of cataloging.

### 1.2 Constraints from DESIGN.md
| Constraint | Source in DESIGN.md | Effect on the backup |
|---|---|---|
| No server, no accounts, no sync | §3 non-goals; §8 "Product listings… would need… a server" | The backup must be a file the user carries out of the app. Automatic cloud backup is roadmap only (§8 "Data safety"). |
| Vite + React + TypeScript PWA, installed to the home screen | §7 | Runs in iOS Safari standalone mode, which limits file APIs: no File System Access API, a share sheet that needs a user gesture, and an unreliable `<a download>`. |
| IndexedDB through Dexie, photos stored as `Blob` | §7 data model (`photo?: Blob`) | Blobs must be turned into text for JSON. That work is async, so it can't happen inside an IndexedDB transaction (§2.4). |
| Data model: `Item`, `Outfit` (key = sorted item ids), `Settings` | §7 | Item IDs **must be preserved** on restore, or every outfit key and rating breaks. |
| One JSON file with base64 photos, `version` field, all-or-nothing import, share sheet with a download fallback | §7 "Backup file format" | These are settled. The plan refines them but doesn't replace them. |
| Photos are about 800px JPEGs, about 100KB each | §5.1 "Photos", §7 | 20 items ≈ 3MB, 150 items ≈ 20MB. Memory on a phone matters near the top of that range. |
| Restore replaces the closet. Merge was cut. The summary names lost items and offers to export first. | Flow E step 3 | Import is destructive, so the review screen is the main safety feature. |
| "Last backup: 12 days ago · 6 items added since"; reminder after 7 days **and** ≥1 change | Flow E step 2 | Change tracking needs a definition of "change" (§2.6). |
| No notifications | §3 non-goals, §8 rejected ideas | The only nudge available is in the app, on the Today screen. |
| Vitest unit tests; tests listed under "backup" | §7, §10 | Sets the minimum test bar: round trip including photos, truncated or wrong-version file changes nothing, a warning on a non-empty phone. |
| Risks: backups only help if made; saved on the same phone; contain photos | §9 | Drives the export copy ("save to iCloud or Drive"), the reminder, and the privacy notes in §2.8. |

**Hosting** isn't specified in DESIGN.md. This plan assumes static HTTPS hosting such as GitHub Pages, Netlify or Vercel. HTTPS is required anyway for service workers, `navigator.share` and geolocation. The backup feature needs no backend.

### 1.3 What success looks like
1. **Complete:** export → wipe → import gives back identical items (including photo bytes), outfits, ratings and preferences.
2. **Atomic:** a failed import changes nothing.
3. **Version-safe:** older formats migrate forward, and newer formats are refused cleanly.
4. **Honest:** the app never claims more about a backup than it can know.
5. **Hard to misuse:** you can't destroy a newer closet with an older file by accident.

---

## 2. Technical plan

### 2.1 Components
```
src/db/            schema.ts (Dexie), repo.ts (ALL writes go through here; change tracking)
src/backup/        format.ts      types, FORMAT_VERSION, zod schemas, envelope check     [pure]
                   migrations.ts  ordered chain v(n) → v(n+1)                            [pure]
                   validate.ts    per-record validation, dedupe, orphan rating removal  [pure]
                   summary.ts     file vs phone → ImportSummary                           [pure]
                   reminder.ts    shouldShowReminder()                                    [pure]
                   base64.ts      bytes ⇄ base64, magic-byte sniffing                     [pure]
                   exporter.ts    snapshot → encode → File
                   importer.ts    read → parse → decode → plan; applyImport()
                   platform.ts    saveFile() (share/download), pickFile()
src/views/backup/  BackupSettings.tsx, ImportReview.tsx, BackupReminder.tsx
```
The backup module only depends on the data layer. The outfit picker and the backup module never import each other, which matches the proposal §2.

### 2.2 Data flow: export
1. **Prepare** (first tap, "Export closet"): run a single read-only Dexie transaction over `items`, `outfits` and `settings`, and copy everything into memory. Once the transaction ends, encode each photo Blob to base64 **one at a time**, appending JSON fragments to a `BlobPart[]`. Finally build one `File` named `closet-YYYY-MM-DD.closet.json` with type `application/json`. A progress bar shows "Preparing… 37/150".
2. **Save** (second tap, "Save backup"): `saveFile(file)` calls `navigator.share({ files: [file] })` when `navigator.canShare({ files })` says yes. Otherwise it downloads through an object URL.
3. **Record:** on `'shared'` or `'downloaded'`, set `lastBackupAt = now`, `changesSinceBackup = 0` and `lastBackupSource` to `'share'` or `'download'`. On `'cancelled'`, change nothing. A download still resets the reminder, because on desktop it's a real save, but the status line marks it "not confirmed" (DESIGN Flow E).

The two-tap flow comes from the proposal (§4.4) and is correct: iOS only allows the share sheet within a short window after a tap, and encoding 150 photos takes longer than that. The prepared file is thrown away when the user leaves the screen, so a stale snapshot can't be saved later.

### 2.3 Data flow: import
1. **Pick:** `<input type="file">`. Leave `accept` off or set it to `application/json,.json`, because a custom `.closet.json` filter can grey files out in the iOS Files picker.
2. **Read:** reject files over **100MB** without reading them (§3.8 explains the change from the proposal's 200MB), then `await file.text()`.
3. **Parse + check envelope** (pure): JSON parse errors give "incomplete or damaged"; `app !== 'closet-builder'` gives "not a Closet backup"; `version > FORMAT_VERSION` gives "made by a newer version"; and `counts` not matching the array lengths gives "incomplete".
4. **Migrate** (pure): the chain from `version` up to `FORMAT_VERSION`.
5. **Validate** (pure): each record goes through a zod schema that **strips unknown keys and builds fresh objects**. Duplicate item IDs: keep the first and report the rest. Outfits: recompute `key` from the sorted `itemIds` instead of trusting it, and drop outfits that reference skipped or missing items. Invalid settings fall back to defaults with a warning; they don't cause the file to be rejected.
6. **Decode photos:** base64 → bytes. Sniff the magic bytes (JPEG `FF D8 FF`, PNG `89 50 4E 47`, WebP `RIFF....WEBP`). If a photo fails, keep the item without its photo and add a warning.
7. **Summarize** (pure): compare file items to phone items by ID.
8. **Review screen:** described in §2.5.
9. **Apply:** one `rw` transaction over all three tables (§2.4). On success, `location.reload()` so in-memory UI state (locks, "previous outfit", cached object URLs) can't refer to items that no longer exist.

Steps 1–8 never write anything.

### 2.4 Storage format and transactions
- **File format v1:** DESIGN §7's envelope as written (`app`, `version`, `exportedAt`, `items`, `outfits`, `settings`), plus two fields taken from the proposal: `appVersion` (for bug reports) and `counts` (to detect truncation). The proposal's rename of `version` to `format` isn't used, because DESIGN is the spec:
  ```jsonc
  { "app": "closet-builder", "version": 1, "appVersion": "0.1.0",
    "exportedAt": "2026-10-21T08:00:00.000Z",
    "counts": { "items": 42, "outfits": 17 },
    "settings": { "comfortOffset": 0, "lastOccasion": "work", "lastColorMode": "auto", "location": { "lat": 51.51, "lon": -0.13, "label": "London" } },
    "items":   [ { "id": 17, "name": "Navy chinos", "...": "…", "inHamper": false, "photo": "data:image/jpeg;base64,…" } ],
    "outfits": [ { "itemIds": [3, 17, 42], "rating": "like" } ] }
  ```
  `items` comes before `outfits` in the file, so a truncated file almost always fails to parse. `counts` catches the rare case that still parses.
- **Transaction rule:** *finish all database work, then do the slow work* (proposal §4.2). Export snapshots first and encodes afterwards. Import decodes first and writes afterwards. Nothing inside a Dexie transaction may `await` anything that isn't Dexie, or IndexedDB commits the transaction early.
- **Replace inside one transaction:** `items.clear()`, `outfits.clear()`, `bulkAdd(items)`, `bulkAdd(outfits)`, then write settings. Any error, including `QuotaExceededError`, aborts the transaction and IndexedDB rolls back the clears too.
- **Storage headroom:** while the replace transaction runs, the old and new closets both exist, so peak usage is about twice the closet size. Before applying, call `navigator.storage.estimate()`. If `quota − usage` is smaller than about 1.2× the incoming photo bytes, warn ("This phone may not have room…"). The transaction is still the real safety net.

### 2.5 Restore path and safeguards
| Phone state | Review screen |
|---|---|
| Empty | "Restore 42 items from backup of 14 Oct." Single confirm button. |
| Has items, all of them in the file | "Replace the 47 items on this phone with 42 from 14 Oct." The confirm button reads **"Replace 47 items"**. |
| Has items **not** in the file | Also: "You'll lose 5 items added since this backup:" followed by their **names**. "Export current closet first" is **ticked by default**. |
| Backup is older than the phone's `lastBackupAt` | Also: "This backup is older than your last export (19 Oct)." |
| File has 0 valid items, including an intentionally empty backup | **Refused before the review screen:** "This backup has no items, so there's nothing to restore." Nothing is changed. |
| Skipped records | Listed by name, with the reason. |

**The "export first" sequence**, which the proposal leaves out: the confirm tap can't both encode a closet and open the share sheet, for the same tap-window reason as in §2.2. So when the review screen opens and the box is ticked, `buildExport()` for the **current** closet starts in the background. The confirm button stays "Preparing safety copy…" until the file is ready. After that, tapping confirm calls `shareOnly()` (step 8), and **only if it returns `'shared'`** does `applyImport()` run. The safety copy never falls back to a download: an iOS download from the installed app can fail silently, and this is the one moment where a missing file destroys data. If the user cancels the share sheet or it fails, the import is cancelled too, with the message "Import cancelled. Your closet wasn't changed." The prepared file is kept, so tapping confirm again retries. On a browser where `canShare` says no, the box is shown disabled with "Safety copy needs a share sheet. Use Export closet first if you want one", and the confirm button reads **"Replace 47 items without a safety copy"**. Unticking the box skips all of this.

**Settings after restore:** settings come from the file, minus backup metadata. Then `lastBackupAt` is set to the file's `exportedAt`, `lastBackupSource` to `'restore'` and `changesSinceBackup` to 0. The phone now matches a file that exists, so "Last backup 14 Oct, no changes since" is accurate. The label adds "(restored)". **Decided** (§5): this counts as honest. The reminder snooze isn't part of the data model, so it's kept outside the database (§4 step 9) and a restore doesn't touch it.

### 2.6 Triggers and change tracking
- **Triggers:** export and import only ever start when the user taps. Nothing runs on a schedule, because DESIGN rules out notifications and a local web app can't run in the background (§8 rejected ideas).
- **Reminder:** a pure `shouldShowReminder` (the proposal §6.2 rule) shown as one quiet line under the Today outfit. Dismissing it snoozes for 3 days; tapping it opens Backup settings.
- **What counts as a change:** use the proposal §6.1 table. Item add, delete and tag or photo edits count; ratings count; comfort offset counts. The hamper, "not today", and last occasion or color mode don't.
- **Mechanism (different from the proposal):** every write goes through `src/db/repo.ts`. Each repo function that makes a meaningful change opens its own `rw` transaction that **includes `settings`** and increments `changesSinceBackup` in the same transaction. The proposal's Dexie hooks are rejected; §3.6 explains why.
- **"6 items added since":** worked out at read time as `items.where(createdAt > lastBackupAt).count()`, so it needs no extra counter. The Settings line follows DESIGN Flow E and depends on `lastBackupSource`: `'share'` → "Last backup: 12 days ago · 6 items added, 3 other changes since"; `'download'` → "Last export: 12 days ago (download, not confirmed) · …"; `'restore'` → "Last backup: 14 Oct (restored) · …".

### 2.7 Failure handling
| Failure | Behavior |
|---|---|
| Share sheet cancelled (`AbortError`) | Treated as `'cancelled'`. Not an error, and nothing is recorded. |
| Share fails with another error (`NotAllowedError` when the tap window expired, or a `TypeError`) | Fall back to download and show "Saved to Downloads, so move it to iCloud/Drive". |
| Safety copy share cancelled or fails (any error, including an expired tap window) | The import is cancelled and the closet is unchanged. The prepared file is kept, so confirming again retries. It never falls back to a download. |
| A photo fails to encode during export | Abort the export with "Photo for *Navy chinos* couldn't be read". Never produce a backup that's silently incomplete. |
| Tab backgrounded during prepare | Encoding resumes when the app comes back, and the second tap still works. No special handling. |
| Import: file too large / unreadable / not JSON / wrong app / newer format / counts mismatch | A clear message, no writes. |
| Import: more invalid records than valid ones | Refuse the file, because it's probably the wrong file and not just damaged. |
| Import: 0 valid items, including an empty file | Refuse: "This backup has no items." An empty backup is never importable. |
| Import: some invalid records | Import the rest and list the skipped ones. |
| Import: photo decode fails | Keep the item without a photo and warn. |
| Import: quota or constraint error during apply | The transaction rolls back and the message says the closet is unchanged. |
| Double taps | The buttons are disabled while an operation is running. |

### 2.8 Security and privacy
- **The file is untrusted input.** zod schemas whitelist fields and build new objects, so stray keys like `__proto__` never reach a model. React escapes all text. Photos are decoded from bytes and checked by magic number; the `data:` MIME type in the file isn't trusted, and SVG isn't accepted. Photos are displayed with `URL.createObjectURL` on a `Blob` built by the app.
- **Size limit** before parsing (100MB) avoids a crash from a huge file.
- **Photos:** the file contains every closet photo (DESIGN §9). The export screen says so in one line. Photos are re-encoded through a canvas when they're added (§5.1 "resized… on the device"), which **removes EXIF data, including GPS**. This plan makes that an explicit requirement with a test, because a later "keep the original photo" change would quietly put the user's home coordinates into every backup.
- **Location, missed by the proposal:** `settings.location` holds coordinates from geolocation, which is usually home. Weather doesn't need more than about 1km precision (**confirmed**, §5), so **round lat/lon to 2 decimals when storing them**. The backup then never holds a precise home location. The city label is kept.
- **Encryption:** not in v1, as the proposal leans (§3.7). The file is stored in the user's own cloud account, and a forgotten passphrase would make the backup worthless.
- **No data leaves the device** except through the share sheet or download the user chooses.

### 2.9 How it fits the existing architecture
- It uses the DESIGN §7 stack without additions except **zod** (validation) and **fake-indexeddb** (test only). No zip library, no server.
- It **follows the DESIGN §7 data model as written**. `Settings.lastBackupAt`, `lastBackupSource` and `changesSinceBackup` are all in the spec (`lastBackupSource` was added in DESIGN v3 for the status line). Item IDs are Dexie auto-increment numbers (`++id`). The importer writes them back explicitly, so outfit keys and ratings survive a restore (§3.8 item 7). The settings row uses an outbound key, so `Settings` doesn't need an `id` field. The reminder snooze is a per-device UI preference, so it goes in `localStorage` rather than the model.
- It introduces `repo.ts` as the only write path. Other features (closet, hamper, Today) call it too. This is a small architectural commitment that also makes the rest of the app easier to test.
- It adds `navigator.storage.persist()` on first launch (proposal §9.4).

---

## 3. Alternatives considered

### 3.1 File format: single JSON with base64 photos (**chosen**) vs a zip archive
| | JSON + base64 (chosen) | Zip: `manifest.json` + `photos/<id>.jpg` (via fflate, ~8KB gz) |
|---|---|---|
| Pros | Already decided in DESIGN §7. Readable in any editor. No dependency. One code path. Easy to make fixtures. | No 33% base64 overhead. Photos can be extracted by hand. Can be streamed. Lower peak memory. |
| Cons | 33% larger. Peak memory during export and import is about 2× the file size (§3.8). JSON.parse of 50MB+ is risky on older iPhones. | A dependency. Not readable as text. Two formats to support once v1 ships. |
| Verdict | **Chosen for v1.** At the expected size (20–150 items, 3–20MB) the costs don't matter, and readability helps both debugging and reviewers. | **Planned upgrade path.** `version: 2` would be a zip. Export shows a warning above **40MB (~300 items)**, and the 150-item device test sets the real limit (answers proposal Q3). |

### 3.2 Manual file export (**chosen**) vs automatic cloud backup (Google Drive / iCloud)
- **Cloud backup pros:** removes the main risk in DESIGN §9, which is that a backup only helps if you make it.
- **Cons:** needs an OAuth client, a Google Cloud project, token handling in a PWA, and consent screens. iCloud has no web API for this. It goes against "no accounts" (§3 non-goals) and is listed as roadmap (§8).
- **Verdict:** not chosen for the MVP. The exporter produces a `File`, so a later Drive uploader can reuse `buildExport()` without changes.

### 3.3 File System Access API / OPFS / `persist()` only
- **File System Access** (`showSaveFilePicker`) would allow "save to the same file every time", which is close to automatic. It **isn't available in iOS Safari**, the main platform, so it isn't chosen. It could be a desktop-only extra later.
- **OPFS or a second IndexedDB copy** protects against bugs but not against losing the phone or clearing site data. It isn't a backup.
- **`navigator.storage.persist()` alone** reduces eviction but nothing else. **Adopted as an addition**, not as an alternative.

### 3.4 Restore semantics: Replace (**chosen**) vs Merge vs append-only "Add from file"
- **Merge:** rejected, for the reasons in proposal §5.3 (needs `updatedAt`, tombstones and conflict rules). I agree.
- **Append-only "Add items from file"** (insert items whose ID isn't on the phone; never overwrite or delete): this is the cheap middle ground the proposal doesn't consider. It would make "I imported the wrong file" recoverable and would cover moving a few items between two phones. It's about 30 lines on top of the importer. **Not in v1**, because it doubles the review-screen states and the testing work, and nobody needs it yet. It goes on the roadmap as the first fallback if Replace turns out to be too blunt.

### 3.5 Validation: lenient per record (**chosen**) vs strict whole file
- **Strict:** simpler, and any corruption is obvious. But when someone has just lost their phone, refusing 41 good items because 1 is bad is the worst result.
- **Lenient (chosen):** keep the proposal's "reject the record, not the file". One change: the **"more than half" rule is replaced with "more invalid than valid, or zero valid items"**. It's the same idea, but it doesn't depend on rounding at small counts. A file with zero valid items, including a deliberately empty backup, is always refused, because importing it can only ever wipe the closet.

### 3.6 Change tracking: Dexie hooks (proposal) vs a repository layer (**chosen**) vs DBCore middleware
**Dexie hooks (`creating`/`updating`/`deleting`) were rejected, and this is where I disagree with the proposal most.** In practice:
1. **A hook can only write to tables in the current transaction's scope.** A hook on `items` that bumps `settings.changesSinceBackup` throws (or, with Dexie's auto-transaction, behaves oddly) unless *every* transaction that touches `items` also includes `settings`. The "rule in one place" ends up requiring every call site to remember `settings` anyway.
2. **Hooks fire during import.** `bulkAdd` of 150 restored items would push the counter to 150 just as the restore finishes. Import would have to switch hooks off with a global flag.
3. **`Table.clear()` doesn't fire `deleting` hooks**, so whether a change is detected depends on which API happened to be used.
4. Detecting which fields changed in `updating` is fragile once nested fields change.

**DBCore middleware** (`db.use`) solves 3 and 4, but it's low-level, hard to read, and still has problem 2. For a resume project, reviewers would see it as cleverness over clarity.

**Repository layer (chosen):** `addItem`, `updateItem(id, patch)`, `deleteItem`, `rateOutfit`, `setComfortOffset` each open an explicit `rw` transaction on `[items|outfits, settings]` and bump the counter. `setInHamper`, `laundryDone` and `skipToday` don't. Import calls the raw tables inside its own transaction and so never touches the counter. The rule is visible in one file, and each function can be unit-tested.

### 3.7 Encryption: none (**chosen**) vs a WebCrypto passphrase
AES-GCM with a PBKDF2-derived key is about 40 lines and has no dependency. It wasn't chosen, because a forgotten passphrase turns a backup into a useless file, the file sits in the user's own cloud storage, and the contents are clothing photos rather than credentials. It's easy to add later as `version: 2` with an `encryption` envelope field. **Agrees** with the proposal's lean.

### 3.8 Where this plan disagrees with the proposal, and what the proposal misses
1. **Dexie hooks for change tracking.** These would break as described in §3.6. Replaced with `repo.ts`.
2. **The memory claim (§4.3) is too optimistic.** Building the file from `BlobPart`s avoids one huge *concatenated* string, but every base64 string is still held in the parts array until `new Blob()` copies it. Peak memory is about 2× the file size, not about 1×. That's fine at 20MB and needs to be **measured** in the 150-item device test.
3. **The 200MB import cap is too high.** A phone that can't hold a 200MB string in memory will crash before the check helps. Cap at 100MB, and warn on export above 40MB.
4. **"Export current closet first" can't run on the confirm tap.** The share-sheet tap window makes that impossible. The safety export has to be prepared ahead of time, and a cancelled share has to cancel the import (§2.5).
5. **Settings after restore** aren't specified. With hooks, they'd be wrong too (counter = item count). §2.5 defines them.
6. **Location precision and EXIF** (§2.8) aren't covered.
7. **Item ID handling** isn't covered. DESIGN's auto-increment IDs work, but only if three rules hold:
   - The importer writes each item with its original `id` (`bulkAdd` with `id` set) and never lets Dexie assign new ones.
   - Outfit keys sort **numerically** (`(a, b) => a - b`), because a default sort puts `10` before `9`.
   - IndexedDB's key generator moves above the highest ID written explicitly, and `clear()` doesn't reset it, so items added after a restore never reuse a restored ID.

   Changing to UUIDs isn't needed. An earlier draft of this plan proposed it; that was dropped to keep the DESIGN data model.
8. **Outfit `key` is trusted from the file.** It should be recomputed from `itemIds`. Duplicate IDs within one file aren't handled either.
9. **Post-import UI state:** locked items and the "previous outfit" in memory point to replaced data. Reload after import.
10. **Storage headroom during replace** (~2×) isn't mentioned. Warn using `storage.estimate()`.
11. **iOS file-picker `accept` filtering** and the **unreliable `<a download>` in iOS standalone mode** mean the share sheet is the only dependable export path on iPhone. The fallback is for desktop and Android.
12. **The effort estimate** (2 days) leaves out the spike (§4 step 0), the safety-export sequence and an e2e test. A realistic figure is **3–4 days**.
13. **Test environment risk:** Dexie + fake-indexeddb + Blobs needs a `structuredClone` that supports Blobs. Whether this works in Vitest's environment has to be checked first, not assumed (§4 step 0).

---

## 4. Detailed implementation

There's no code yet (proposal header), so "migration steps" here means setting up the schema correctly from the start, plus the edits DESIGN.md will need (§4.13). The steps are ordered so that each one can be tested before the next.

### Step 0: Spikes (½ day)
1. **Vitest + fake-indexeddb + Blob.** In `environment: 'node'`, put a `new Blob([bytes], {type:'image/jpeg'})` into Dexie via `fake-indexeddb/auto`, read it back and compare bytes. If Node's `structuredClone` won't clone the Blob, **change the test environment, not the data model**: run the database tests under Vitest browser mode (Playwright Chromium), which has real IndexedDB and Blob. DESIGN §7 says `photo?: Blob`, so the storage format stays. Record the result in the README.
2. **iOS share sheet.** Deferred to the skeleton's first deploy (owner decision, 2026-10-21). The page ships at `public/spike/` and is served at `/closet-builder/spike/`. It has a two-tap flow that shares a 20MB `File`. Confirm that "Save to Files" works from the installed PWA and see how `AbortError` shows up when the user cancels.

**Pass criteria, written down before running the spikes.** All of these must hold:
- **Vitest:** a Blob written through Dexie under fake-indexeddb reads back byte-equal. If it doesn't, switch to Vitest browser mode and check again. That still counts as a pass, because the data model is unchanged.
- **iOS, on a real iPhone with the app installed to the home screen:**
  - preparing the 20MB file finishes in **under 15 seconds**, with no crash and no page reload
  - the share sheet opens on the second tap in **5 out of 5** tries
  - "Save to Files → iCloud Drive" produces a file of the expected size that opens in the Files app
  - cancelling raises `AbortError`

**If iOS fails:** stop before building the backup screens. A slow or crashing prepare points to the zip format (`version: 2`, §3.1) or a smaller export. A share sheet that doesn't open points back to the two-tap flow.

### Step 1: Schema and repository
`src/db/schema.ts`
```ts
// Field-for-field the DESIGN §7 data model. Nothing added for backup.
export type ItemId = number; // Dexie auto-increment (++id)
export interface Item {
  id: ItemId; name: string; category: Category; color: PaletteColor; pattern: Pattern;
  occasions: Occasion[]; seasons: Season[]; warmth: 1 | 2 | 3; brand?: string;
  photo?: Blob; inHamper: boolean; skipDate?: string /* YYYY-MM-DD */; createdAt: string /* ISO */;
}
export interface Outfit { key: string /* sorted item ids */; itemIds: ItemId[]; rating?: 'like' | 'dislike' }
export interface Settings {
  comfortOffset: -3 | 0 | 3; lastOccasion: Occasion; lastColorMode: ColorMode;
  location?: { lat: number; lon: number; label?: string }; // stored rounded to 2 dp
  lastBackupAt?: string; lastBackupSource?: 'share' | 'download' | 'restore'; changesSinceBackup: number;
}
export const SETTINGS_KEY = 'settings'; // outbound key: the model needs no id field
export class ClosetDB extends Dexie {
  items!: Table<Item, ItemId>; outfits!: Table<Outfit, string>; settings!: Table<Settings, string>;
  constructor(name = 'closet') {
    super(name);
    this.version(1).stores({ items: '++id, category, createdAt', outfits: 'key', settings: '' });
  }
}
// Numeric sort: the default sort would put 10 before 9 and give one outfit two keys.
export const outfitKey = (ids: ItemId[]) => [...ids].sort((a, b) => a - b).join('|');
```

`src/db/repo.ts`. Meaningful writes bump the counter in the same transaction:
```ts
async function tracked<T>(db: ClosetDB, tables: Table[], fn: () => Promise<T>): Promise<T> {
  return db.transaction('rw', [...tables, db.settings], async () => {
    const result = await fn();
    const s = (await db.settings.get(SETTINGS_KEY))!;
    await db.settings.put({ ...s, changesSinceBackup: s.changesSinceBackup + 1 }, SETTINGS_KEY);
    return result;
  });
}
export const addItem    = (db, item: Omit<Item, 'id'>)     => tracked(db, [db.items], () => db.items.add(item as Item));
export const updateItem = (db, id: ItemId, p: Partial<Item>) => tracked(db, [db.items], () => db.items.update(id, p));
export const deleteItem = (db, id: ItemId)                 => tracked(db, [db.items, db.outfits], async () => {
  await db.items.delete(id);
  await db.outfits.filter(o => o.itemIds.includes(id)).delete(); // ratings for a deleted item are now orphans
});
export const rateOutfit = (db, ids: ItemId[], rating: 'like'|'dislike') =>
  tracked(db, [db.outfits], () => db.outfits.put({ key: outfitKey(ids), itemIds: [...ids].sort((a, b) => a - b), rating }));
export const setComfortOffset = (db, v: Settings['comfortOffset']) =>
  tracked(db, [], () => db.settings.update(SETTINGS_KEY, { comfortOffset: v }));
// Untracked (temporary state):
export const setInHamper = (db, id: ItemId, v: boolean) => db.items.update(id, { inHamper: v });
export const laundryDone = (db) => db.items.filter(i => i.inHamper).modify({ inHamper: false });
export const skipToday   = (db, id: ItemId, today: string) => db.items.update(id, { skipDate: today });
```
(`inHamper` stays a `boolean` as DESIGN specifies. Booleans aren't valid IndexedDB keys, so it isn't indexed, and the hamper is filtered in memory. At this closet size, that's fine.)

`ensureSettings(db)` creates the settings row under `SETTINGS_KEY` with the DESIGN §7 defaults (`comfortOffset: 0`, `lastOccasion: 'casual'`, `lastColorMode: 'auto'`, `changesSinceBackup: 0`) and runs `navigator.storage?.persist?.()` once. The same `defaultSettings()` is used by the importer when a file's settings are invalid.

`CATEGORIES`, `PATTERNS`, `OCCASIONS`, `SEASONS` and `PALETTE` live in `src/db/values.ts`, copied exactly from DESIGN §6.8. The zod schemas and the UI both import them from there.

### Step 2: Format and schemas (`src/backup/format.ts`)
```ts
export const APP_ID = 'closet-builder';
export const FORMAT_VERSION = 1;
export const MAX_IMPORT_BYTES = 100 * 1024 * 1024;
export const WARN_EXPORT_BYTES = 40 * 1024 * 1024;

export const ItemRecord = z.object({
  id: z.number().int().positive(), name: z.string().min(1).max(200),
  category: z.enum(CATEGORIES), color: z.enum(PALETTE), pattern: z.enum(PATTERNS),
  occasions: z.array(z.enum(OCCASIONS)).min(1).max(4), seasons: z.array(z.enum(SEASONS)).max(4),
  warmth: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  brand: z.string().max(100).optional(),
  photo: z.string().startsWith('data:image/').nullable(),
  inHamper: z.boolean(), skipDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  createdAt: z.string().datetime(),
}); // z.object strips unknown keys by default
export const OutfitRecord = z.object({ itemIds: z.array(z.number().int().positive()).min(2).max(5), rating: z.enum(['like','dislike']).optional() });
export const Envelope = z.object({
  app: z.literal(APP_ID), version: z.number().int().positive(), appVersion: z.string(),
  exportedAt: z.string().datetime(),
  counts: z.object({ items: z.number().int().nonnegative(), outfits: z.number().int().nonnegative() }),
  items: z.array(z.unknown()), outfits: z.array(z.unknown()), settings: z.unknown(),
});
export type EnvelopeError = 'not-json' | 'not-ours' | 'too-new' | 'counts-mismatch' | 'too-large';
export function checkEnvelope(raw: unknown): { ok: true; file: z.infer<typeof Envelope> } | { ok: false; error: EnvelopeError };
```
Check `app` and `version` **before** the full envelope parse, so a newer file gets "made by a newer version" and not a generic shape error.

### Step 3: Migrations (`src/backup/migrations.ts`)
```ts
type Migration = (file: any) => any;            // version n → n+1
export const MIGRATIONS: Record<number, Migration> = {
  // Empty until version 2 ships. Add 1: (f) => ({ ...f, version: 2, ... }) then.
};
export function migrate(file: { version: number }, migrations = MIGRATIONS, target = FORMAT_VERSION): unknown {
  let f: any = file;
  for (let v = f.version; v < target; v++) {
    const step = migrations[v];
    if (!step) throw new Error(`No migration from version ${v}`);
    f = step(f);
  }
  return f;
}
```
There's no code yet, so there are no older files to convert and v1 needs no migration. The chain is still built and tested now, by injecting a test-only `1 → 2` step through the `migrations` and `target` parameters. The first real migration then only adds an entry, without changing the mechanism.

### Step 4: Base64 and photo codec (`src/backup/base64.ts`)
This avoids `FileReader` and `fetch(dataURL)` so it runs the same way in Node and in the browser, and isn't affected by CSP `connect-src`.
```ts
export async function blobToDataUrl(b: Blob): Promise<string> {
  const bytes = new Uint8Array(await b.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${b.type || 'image/jpeg'};base64,${btoa(bin)}`;
}
export function dataUrlToBlob(url: string): Blob | null {
  const m = /^data:image\/[a-z+]+;base64,([A-Za-z0-9+/=]+)$/.exec(url);
  if (!m) return null;
  let bin: string; try { bin = atob(m[1]); } catch { return null; }
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  const type = sniffImageType(bytes);          // trust the bytes, not the header
  return type ? new Blob([bytes], { type }) : null;
}
export function sniffImageType(b: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' | null;
```

### Step 5: Validate and summary (pure)
`src/backup/validate.ts`
```ts
export interface Skipped { kind: 'item' | 'outfit'; label: string; reason: string }
export interface ValidatedFile {
  exportedAt: string; settings: ImportedSettings;
  items: (Omit<Item, 'photo'> & { photo: string | null })[];
  outfits: Outfit[]; skipped: Skipped[]; warnings: string[];
}
export function validateFile(file: unknown /* migrated */): { ok: true; value: ValidatedFile } | { ok: false; error: 'mostly-invalid' | 'no-valid-items' };
```
In order: validate items (first ID wins, later duplicates are skipped as "duplicate id"). Validate outfits: recompute the key, skip ones that reference unknown IDs ("orphan rating"), and merge duplicate keys with the last one winning. Validate settings (if invalid, use defaults and add a warning), and drop `lastBackupAt` and `changesSinceBackup` if present. Round location to 2 decimals. Then apply the refusal rule: `validItems === 0 || invalidItems > validItems`. The first condition refuses empty backups as well as damaged ones (`'no-valid-items'`).

`src/backup/summary.ts`
```ts
export interface PhoneSnapshot { items: Pick<Item, 'id' | 'name'>[]; lastBackupAt?: string }
export interface ImportSummary {
  mode: 'restore' | 'replace';                  // restore = the phone is empty
  fileItemCount: number; fileOutfitCount: number; phoneItemCount: number;
  wouldLose: { id: ItemId; name: string }[];    // on the phone, not in the file
  olderThanLastExport: boolean;                 // no empty-file flag: empty files never get this far
  skipped: Skipped[]; warnings: string[]; exportedAt: string;
}
export function summarizeImport(file: ValidatedFile, phone: PhoneSnapshot): ImportSummary;
```

### Step 6: Exporter (`src/backup/exporter.ts`)
```ts
export interface PreparedExport { file: File; counts: { items: number; outfits: number }; bytes: number }
export async function buildExport(db: ClosetDB, opts: { now?: Date; appVersion: string; onProgress?: (done: number, total: number) => void }): Promise<PreparedExport> {
  // 1. Snapshot: database work only.
  const { items, outfits, settings } = await db.transaction('r', db.items, db.outfits, db.settings, async () => ({
    items: await db.items.orderBy('createdAt').toArray(),
    outfits: await db.outfits.toArray(),
    settings: await db.settings.get(SETTINGS_KEY),
  }));
  // 2–3. Encode and assemble outside the transaction.
  const { lastBackupAt, changesSinceBackup, ...prefs } = settings!;
  const head = { app: APP_ID, version: FORMAT_VERSION, appVersion: opts.appVersion,
                 exportedAt: (opts.now ?? new Date()).toISOString(),
                 counts: { items: items.length, outfits: outfits.length }, settings: prefs };
  const parts: BlobPart[] = [JSON.stringify(head).slice(0, -1), ',"items":['];
  for (let i = 0; i < items.length; i++) {
    const { photo, ...rest } = items[i];
    const rec = { ...rest, photo: photo ? await blobToDataUrl(photo) : null };
    parts.push(i ? ',' : '', JSON.stringify(rec));
    opts.onProgress?.(i + 1, items.length);
  }
  parts.push('],"outfits":', JSON.stringify(outfits.map(({ key, ...o }) => o)), '}');
  const file = new File(parts, `closet-${localDate(opts.now)}.closet.json`, { type: 'application/json' });
  return { file, counts: head.counts, bytes: file.size };
}
export async function recordExport(db: ClosetDB, source: 'share' | 'download', now = new Date()): Promise<void>; // lastBackupAt=now, lastBackupSource=source, counter=0; also clears the localStorage snooze
```
Outfit `key` is left out of the file because it can be derived. This removes one way for the file to be inconsistent.

### Step 7: Importer (`src/backup/importer.ts`)
```ts
export type ReadResult =
  | { ok: true; file: ValidatedFile }
  | { ok: false; error: EnvelopeError | 'mostly-invalid' | 'no-valid-items'; message: string };
export function parseBackupText(text: string): ReadResult;          // pure: parse → envelope → migrate → validate
export async function readBackupFile(f: File): Promise<ReadResult>; // size check, then f.text(), then parseBackupText
export interface ImportPlan { items: Item[]; outfits: Outfit[]; settings: ImportedSettings; exportedAt: string; warnings: string[] }
export function decodePhotos(v: ValidatedFile): ImportPlan;         // failed photo → item without photo + warning

export async function applyImport(db: ClosetDB, plan: ImportPlan): Promise<void> {
  await db.transaction('rw', db.items, db.outfits, db.settings, async () => {
    await db.items.clear();
    await db.outfits.clear();
    await db.items.bulkAdd(plan.items);           // every item carries its original id
    await db.outfits.bulkAdd(plan.outfits);
    await db.settings.put({ ...defaultSettings(), ...plan.settings,
      lastBackupAt: plan.exportedAt, lastBackupSource: 'restore', changesSinceBackup: 0 }, SETTINGS_KEY);
  }); // any throw → Dexie aborts → IndexedDB rolls back the clears
}
```
All decoding happens in `decodePhotos` **before** `applyImport`. The transaction body only awaits Dexie calls. Because `plan.items` always has `id` set, `++id` keeps those IDs and doesn't generate new ones. The key generator then continues above the highest restored ID.

### Step 8: Platform (`src/backup/platform.ts`)
```ts
export type SaveOutcome = 'shared' | 'downloaded' | 'cancelled';
export async function saveFile(file: File, nav: Navigator = navigator): Promise<SaveOutcome> {
  if (nav.canShare?.({ files: [file] })) {
    try { await nav.share({ files: [file], title: 'Closet backup' }); return 'shared'; }
    catch (e) { if ((e as DOMException)?.name === 'AbortError') return 'cancelled'; /* else fall through */ }
  }
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement('a'), { href: url, download: file.name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return 'downloaded';
}
// Safety copy before a destructive import: share sheet only, never the download fallback (§2.5).
export type ShareOutcome = 'shared' | 'cancelled' | 'failed' | 'unavailable';
export async function shareOnly(file: File, nav: Navigator = navigator): Promise<ShareOutcome> {
  if (!nav.canShare?.({ files: [file] })) return 'unavailable';
  try { await nav.share({ files: [file], title: 'Closet safety copy' }); return 'shared'; }
  catch (e) { return (e as DOMException)?.name === 'AbortError' ? 'cancelled' : 'failed'; }
}
export function pickFile(): Promise<File | null>; // hidden <input type="file" accept="application/json,.json">
```
`nav` is injected so tests can fake `canShare`/`share`.

### Step 9: Reminder (`src/backup/reminder.ts`)
```ts
export interface ReminderInput { itemCount: number; changesSinceBackup: number; lastBackupAt?: string; snoozedUntil?: string }
export function shouldShowReminder(s: ReminderInput, now: Date): boolean {
  if (s.changesSinceBackup === 0) return false;
  if (s.snoozedUntil && now < new Date(s.snoozedUntil)) return false;
  if (!s.lastBackupAt) return s.itemCount >= 10;
  return now.getTime() - new Date(s.lastBackupAt).getTime() >= 7 * 86_400_000;
}
export const snoozeUntil = (now: Date) => new Date(now.getTime() + 3 * 86_400_000).toISOString();
```
`snoozedUntil` is read from and written to `localStorage` (`closet.backupReminderSnoozedUntil`), wrapped in try/catch. It isn't in the DESIGN data model and shouldn't be. It's a per-device UI preference that a backup shouldn't carry. If storage is unavailable, the reminder just reappears, which is harmless.

### Step 10: UI
- **`BackupSettings.tsx`:** shows the status line chosen by `lastBackupSource` (§2.6), or "No backup yet". **Export closet** → progress → **Save backup**, with the hint "Save to iCloud Drive or Google Drive, not 'On My iPhone'. The file contains all your photos." It warns above `WARN_EXPORT_BYTES`. **Import closet** opens the file picker and goes to `ImportReview`.
- **`ImportReview.tsx`:** renders `ImportSummary` following the §2.5 table. It runs the safety-export state machine: `idle → preparingSafety → readyToConfirm → savingSafety → applying → done | cancelled | failed`. From `savingSafety`, only `'shared'` moves on to `applying`. `'cancelled'` and `'failed'` go back to `readyToConfirm` with the prepared file kept. If `canShare` is false, the machine starts in `safetyUnavailable`, and confirming goes straight to `applying` behind the "without a safety copy" label. That machine lives in a small pure reducer (`importFlow.ts`) so it can be unit-tested.
- **`BackupReminder.tsx`:** one line under the Today outfit with dismiss (snooze) and tap (navigate).

### Step 11: Configuration
- `package.json`: add `zod`, and in dev, `fake-indexeddb` and `@playwright/test` (optional, for step 12c).
- `vite.config.ts`: `base: '/closet-builder/'` for GitHub Pages. The manifest's `start_url` and `scope` and the service worker registration use the same path (DESIGN §7 Hosting).
- `vitest.config.ts`: `environment: 'node'` for `src/backup/**` and `src/db/**` (per step 0). `setupFiles: ['fake-indexeddb/auto']`.
- If the host sets a CSP: `img-src 'self' blob: data:`.
- `src/version.ts`: `export const APP_VERSION = import.meta.env.PACKAGE_VERSION`, injected through Vite `define`.

### Step 12: Testing plan

**12a. Unit tests (pure, no database)**, in `src/backup/__tests__/`
| Module | Cases |
|---|---|
| `format` | not JSON, `app` wrong, `version` = current+1 → `too-new` (checked before shape), counts mismatch, valid v1 |
| `migrations` | v1 at target v1 → unchanged; injected test-only `1 → 2` step runs; missing step throws |
| `validate` | 1 bad of 40 → 39 + 1 skipped by name; 21 bad of 40 → refused; 0 valid of 3 → refused; empty file (`items: []`) → refused `no-valid-items`; duplicate IDs; non-numeric ID → skipped; outfit key recomputed with numeric sort (`[10, 9]` → `"9|10"`); orphan rating dropped; unknown keys (incl. `__proto__`) stripped; bad settings → defaults + warning; backup metadata removed; location rounded |
| `base64` | round trip of random bytes (incl. sizes around the 0x8000 chunk boundary); JPEG/PNG/WebP sniffed; SVG, `text/html` and garbage → null; data-URL MIME that disagrees with the bytes → the bytes win |
| `summary` | empty phone → `restore`; superset/subset/disjoint IDs → correct `wouldLose` names; `olderThanLastExport` |
| `reminder` | table: no changes; never exported with 9 vs 10 items; 6d vs 7d; snoozed vs expired snooze |
| `importFlow` reducer | cancelled or failed safety share → back to `readyToConfirm` with no apply; only `shared` reaches `applying`; no `canShare` → `safetyUnavailable` and the "without a safety copy" label; unticked box → straight to apply |
| `platform.saveFile` | fake nav: share ok → `shared`; `AbortError` → `cancelled`; `NotAllowedError` → `downloaded`; no `canShare` → `downloaded` |
| `platform.shareOnly` | fake nav: share ok → `shared`; `AbortError` → `cancelled`; `NotAllowedError` → `failed` (never a download); no `canShare` → `unavailable` |
| status line | each `lastBackupSource` value plus "never" gives the Flow E wording |

**12b. Integration (Dexie + fake-indexeddb)**, in `src/backup/__tests__/roundtrip.test.ts`
- **Round trip:** seed 30 items (random photo bytes, some without photos, some in the hamper, one with `skipDate`), 10 outfits, and non-default settings. `buildExport` → `readBackupFile` → `decodePhotos` → wipe with a new DB name → `applyImport` → deep-equal every record, with **byte-equal photos**, settings equal apart from backup metadata, and `changesSinceBackup === 0`.
- **Atomicity (real error):** seed closet A, then build a plan with a duplicated item ID so `bulkAdd` throws `ConstraintError` after `clear()`. Assert closet A is unchanged, record for record.
- **Atomicity (quota):** `vi.spyOn(db.outfits, 'bulkAdd').mockRejectedValueOnce(new DOMException('', 'QuotaExceededError'))`. Same assertion.
- **Rejections write nothing:** a truncated file (cut at 50%, and at an item boundary followed by `]}`), wrong app, future format. Seed, attempt, assert unchanged.
- **Tracking:** `addItem`, `updateItem` and `rateOutfit` each increment the counter. `setInHamper`, `laundryDone` and `skipToday` don't. `applyImport` of 150 items leaves the counter at 0.
- **ID stability:** export a closet with gaps in its IDs (items 1–30 with 5, 12 and 20 deleted), then restore into a fresh database. Every restored item has its original ID, and every rating still points at the right items. Then `addItem` gives an ID greater than the highest restored one. Repeat with a phone whose old IDs went *higher* than the file's, to confirm a new item can't reuse a restored ID.
- **Snapshot consistency:** start `buildExport`, and while encoding is still running, `addItem`. The export contains the pre-add count (counts stay consistent).
- **EXIF:** run a JPEG fixture with GPS EXIF through the add-item resize helper. The output has no `Exif`/APP1 marker. This only works if the resize helper can run in the test environment; otherwise it moves to the manual list.

**12c. End-to-end (Playwright, Chromium), optional but recommended for the resume**
`e2e/backup.spec.ts`: import `fixtures/demo.closet.json` (20 items with real photos) → assert the grid shows 20 → Export → Save (no `canShare` in headless Chromium, so it downloads) → capture the download → clear storage → reload → import the captured file → assert 20 items and that a known photo's `naturalWidth > 0`.

**12d. Restore drill (manual, real devices; record results in `docs/restore-drill.md`)**
1. Install the PWA on an iPhone. Import `fixtures/large-150.closet.json` (made by `scripts/make-fixture.ts`) to get a realistic size.
2. Export → Save → **iCloud Drive**. Record the time to prepare and the file size. Watch for memory crashes.
3. Cancel the share sheet once and confirm "Last backup" didn't change.
4. Rate 2 outfits and put 3 items in the hamper. Check the reminder logic with a date override (`?now=` debug flag, dev builds only).
5. **Delete the app from the home screen.** Reinstall from Safari.
6. Import from iCloud Drive in the Files picker. Confirm the review says "Restore 150 items".
7. Check the closet count, 5 random photos, hamper state, the 2 ratings (a 👎 combo never comes back after 20 shuffles), comfort offset and location label.
8. Import an *older* backup onto the non-empty phone. Confirm the lost items are named, "export first" is ticked, and cancelling the safety share leaves the closet unchanged.
9. Repeat 2 and 6 on Android Chrome and desktop Chrome/Safari (download path).

**12e. Demo hook:** ship `fixtures/demo.closet.json` and a "Try with a sample closet" link on the first-run screen that imports it. This exercises the import path on every demo visit and lets a reviewer see a full closet in one tap.

### Step 13: Changes to DESIGN.md (done in Draft v3, 2026-10-21)
Applied: `appVersion` and `counts` in the backup envelope; auto-increment IDs and numeric outfit key sorting; location rounded to 2 decimals; the three Flow E status lines and the `lastBackupSource` field; safety copy through the share sheet only; zod, fake-indexeddb, `persist()` and GitHub Pages hosting in the §7 table; the 100MB and 40MB limits; first-launch defaults; the fixed tag values (§6.8); and the build order. The proposal's renames (`format`, "Last exported", `lastExportAt`) were not applied, because DESIGN is the spec.

### Acceptance checklist
- [ ] Step 0 spike results recorded (Blob storage in tests; iOS share of a 20MB file).
- [ ] All writes go through `repo.ts`. Tracked and untracked writes are covered by tests.
- [ ] Export: two-tap flow, progress bar, file named `closet-YYYY-MM-DD.closet.json`, warning above 40MB, cloud-save hint shown.
- [ ] A cancelled share doesn't update `lastBackupAt`. A download fallback does, and the UI says so.
- [ ] Import refuses non-JSON, foreign, newer-format, counts-mismatched, >100MB, mostly-invalid and **empty** files with clear messages, and writes nothing.
- [ ] Schema matches the DESIGN §7 data model field for field. Restored items keep their IDs, and new items never reuse one.
- [ ] Partially invalid files import the valid records and list skipped ones by name and reason.
- [ ] The review screen covers every row of the §2.5 table. The confirm label states the count being replaced.
- [ ] A cancelled or failed safety export cancels the import. The safety copy counts only after a share-sheet save and never falls back to a download.
- [ ] The status line shows the right wording for share, download and restore.
- [ ] Replace is one transaction. The duplicate-key and quota tests show nothing changed.
- [ ] After import: counter = 0, `lastBackupAt` = file date, app reloads.
- [ ] Round-trip test byte-equal for photos. Migration chain tested with an injected test-only step.
- [ ] Location stored rounded. Photos have no EXIF after resize.
- [ ] Reminder rule tested by table. Shows under the outfit, snoozes 3 days on dismiss.
- [ ] `navigator.storage.persist()` requested on first launch.
- [ ] Restore drill done on iPhone (installed PWA) and on one Android or desktop browser, with results written down.
- [ ] (Recommended) Playwright e2e and the "sample closet" demo import live on the deployed site.

**Effort:** about 3–4 focused days. ½ day spikes, 1½ days for the pure modules and tests, 1 day for exporter, importer, platform and UI, and ½–1 day for e2e and the device drill.

---

## 5. Decisions

All open questions are closed. The owner made four decisions directly. The owner then delegated the rest, and those calls are recorded below with their reasons, so a reviewer can disagree with a specific line.

### Decided by the owner (2026-10-21)
- **Data model:** follow DESIGN §7 as written. Item IDs are auto-increment numbers, and `Settings` uses `lastBackupAt` / `changesSinceBackup` (plus `lastBackupSource`, added in round 2). The reminder snooze lives in `localStorage`. Restore keeps IDs by writing them explicitly (§3.8 item 7).
- **Settings after restore:** `lastBackupAt` = the file's `exportedAt` and the counter = 0, labelled "(restored)". Accepted as honest.
- **Location precision:** rounding to 2 decimals (about 1km) is fine.
- **Empty backups:** never importable. Any file with zero valid items is refused.

### Decided by the owner, round 2 (2026-10-21)
- **DESIGN.md is the spec.** It was updated to Draft v3 with every Step 13 change. This plan and the proposal now defer to it.
- **Build order:** the app skeleton comes first, then backup, then the outfit picker (DESIGN §7).
- **Tag values:** fixed in DESIGN §6.8. Every item needs at least one occasion.
- **Safety copy:** share sheet only. A cancel or a failure cancels the import, and there's no download fallback (§2.5).
- **Status line:** "Last backup" after a share, "Last export (download, not confirmed)" after a download, "(restored)" after an import. This needs `Settings.lastBackupSource`.
- **Hosting path:** `/closet-builder/` on GitHub Pages.
- **First-launch defaults:** comfort offset 0, occasion casual, color mode auto.
- **Step 0 pass criteria:** as written in step 0.

### Decided in the plan (delegated by the owner)
1. **Backup file key: DESIGN's `version`, not the proposal's `format`.** DESIGN is the spec and was followed for the data model, so the file format follows it too. With no code shipped, there are no old files, and the made-up "format 0" migration is gone. `appVersion` and `counts` are kept as additions, because each one catches a real problem (bug triage, truncated files) and neither conflicts with DESIGN.
2. **Status label: DESIGN's "Last backup", plus a change count.** "Last backup: 12 days ago · 6 items added, 3 other changes since". It uses DESIGN's wording and field names. The extra count follows proposal §6.1, so edits and ratings also count as changes.
3. **Change tracking: `repo.ts` is the only write path.** The Dexie hooks fail in ways §3.6 shows, so this decision is a correctness issue, not a matter of taste. Every feature writes through it. That's also a clean testing seam a reviewer will recognize.
4. **Size limits: 100MB import cap, 40MB export warning.** Treated as provisional. The 150-item iPhone drill (§4 step 12d) replaces them with measured numbers. A zip file (`version: 2`) is built only if the drill shows memory trouble or closets approach 300 items.
5. **Encryption: none in v1.** A forgotten passphrase would destroy the backup, and the file already sits in the user's own cloud account (§3.7). It can be added later as `version: 2`.
6. **Hosting: GitHub Pages** (static HTTPS, no backend). It's free, it deploys from the repo with one Action, and a reviewer can tie the live demo URL to the code. If a CSP is added later, it must allow `blob:` and `data:` images.
7. **Test environment: try Node + fake-indexeddb first, then fall back to Vitest browser mode.** Step 0 decides. The `photo?: Blob` field stays as DESIGN specifies either way.
8. **"Add items from file": deferred.** It's the first fallback to build if "imported the wrong file" or moving items between phones becomes a real problem (§3.4).
9. **Reload after import: yes.** A full `location.reload()` is one line and can't miss state. Resetting state piece by piece would be more code and a lasting source of bugs, just to avoid a reload that happens rarely.
