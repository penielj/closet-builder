# Closet Builder: Design Doc

**Status:** Draft v3 · **Date:** 2026-10-21 · **Author:** Peniel Johnson

## 1. Summary
Closet Builder is a personal web app, installable on your phone. It suggests a daily outfit using only clothes you own that are **clean and available today**. Each morning it combines the weather for *your* comfort level, the occasion and color rules into a complete outfit. You can shuffle it, lock pieces you want to keep, skip items for today, or reject the whole outfit.

## 2. Problems we are solving
Ranked by what actually goes wrong in the morning:
1. **Deciding what goes together.** You have clothes but freeze on combinations.
2. **Dressing for the weather.** You end up too hot or too cold.
3. **Knowing what's clean.** The piece you pick turns out to be in the wash.

Not a problem for you, so out of scope: wearing the same few things or forgetting what you own. The picker does **not** avoid recently worn items.

## 3. Goals and non-goals
**Goals**
- Give a usable outfit in under 10 seconds, with no decisions required on a normal day.
- Become useful after cataloging about **20 items**, not the whole closet.
- Never suggest something that's in the hamper.
- Keep data on the device, and install the app to the home screen so the browser doesn't clear it.

**Non-goals for the MVP**
- AI or machine-learning outfit generation. The picker is rules-based.
- Syncing across devices, or user accounts.
- Notifications or reminders.
- Showing store products inside the app.

## 4. Core flows

**Flow A: First run (start small)**
1. A welcome screen says: "Add the ~20 things you actually wear. You can add the rest later."
2. A progress meter shows what the picker needs: at least 3 tops, 2 bottoms and 1 pair of shoes. A dress can replace a top and bottom.
3. Today unlocks once the minimum is met. Until then, it shows what's still missing.

**Flow B: Add an item**
1. Take or choose a photo. The app resizes it and pre-selects the detected color.
2. Fill in the name, category, pattern, occasions, seasons, warmth and an optional brand, then save.

**Flow C: Get today's outfit**
1. Open Today. The weather loads, showing the high, the low and your comfort-adjusted feel.
2. The occasion and color mode are remembered from last time, so you only change them when you need to.
3. The app shows an outfit as a set of item photos.
4. Choose what to do with it:
   - **🔒 Lock** an item to keep it while the rest shuffles.
   - **Not today** on an item excludes it until tomorrow.
   - **👎** rejects the whole outfit, and that combo never comes back.
   - **👍** makes the combo more likely to come back.
   - **Shuffle** gets a new outfit.

**Flow D: Hamper**
- **Into the hamper:** on any item, in the closet or on the outfit card, tap **→ Hamper**. Hamper items are never suggested.
- **Visible:** the Today header shows a badge such as "🧺 7 in hamper". Tapping it opens the list.
- **Back out:** **Laundry done** returns everything at once. You can also take out single items.

**Flow E: Back up and restore**
1. Open Settings and tap **Export closet**. The app prepares a single `.closet.json` file and shows its progress ("Preparing… 37/150"). Then tap **Save backup** to open the phone's share sheet, so you can save it to Files, iCloud Drive or Google Drive, or AirDrop it to your laptop. It takes two taps because iPhones only open the share sheet right after a tap, and preparing a large closet takes longer than that.
2. Settings shows the backup status:
   - **"Last backup: 12 days ago · 6 items added, 3 other changes since"** after a save through the share sheet.
   - **"Last export: 12 days ago (download, not confirmed) · …"** when the browser has no share sheet and the file was downloaded instead. The app can't tell whether that file was kept.
   - **"Last backup: 14 Oct (restored) · …"** right after an import.

   After 7 days *and* at least one change, Today shows a quiet reminder. Adding, editing or deleting an item, rating an outfit and changing the comfort setting count as changes. The hamper, "not today" and the remembered occasion and color mode don't.
3. To restore, tap **Import closet** and pick a file. The backup **replaces** the closet on the phone. Merging was considered and cut. You'll see a summary before anything is written. If the phone already has items, that summary names any items you'd lose and offers to export the current closet first, ticked by default. That safety copy only counts if it goes through the share sheet. If you cancel it, or it fails, the import is cancelled too. On a browser without a share sheet, the safety copy isn't available, and the confirm button reads "Replace without a safety copy" instead.

## 5. MVP features

### 5.1 Closet
| Feature | Details |
|---|---|
| Item catalog | Add, edit and delete items. Shown as a photo grid that can be filtered by category. Hamper items are dimmed. |
| Photos | Taken with the camera or uploaded, then resized to about 800px JPEG on the device. |
| Auto color | Samples the center 50% of the photo, finds the dominant color and snaps it to the nearest palette color. You can override it. |
| Tags | Category, color, pattern, occasions, seasons, warmth (light/medium/heavy) and an optional brand. The allowed values are fixed in §6.8. The brand field autocompletes so spellings stay consistent. |
| Hamper | Mark items dirty by hand. **Laundry done** clears all of them at once. |
| Backup | Export everything to one file and import it again, with a reminder when a backup is overdue (Flow E). |

### 5.2 Today
| Feature | Details |
|---|---|
| Weather | Today's **high and low** from browser geolocation and Open-Meteo (free, no API key). If location isn't available, you can type a city or a temperature. |
| Comfort setting | An **"I run cold / neutral / warm"** setting shifts every temperature threshold by +3°C, 0 or −3°C. |
| Occasion | Casual, work, formal or workout. The last choice is remembered. |
| Color mode | **Auto** (the default), Monochrome, Tonal or Complementary. Kept in a compact selector and remembered between visits. |
| Lock | Locked items are always included. Only the unlocked slots shuffle. |
| Not today | Excludes an item until midnight. |
| Like / dislike | Liked combos are three times as likely to be picked. Disliked combos are never picked again. |
| Explain failures | Says what to change, e.g. "Nothing clean fits a 6°C work day. 3 tops are in the hamper." |

## 6. Outfit rules

### 6.1 Availability
Items in the hamper or marked "not today" are always excluded. Locked items are always included.

### 6.2 Weather: dress for the high, layer for the low
The comfort offset adjusts each threshold. A "runs cold" person treats 12°C like 9°C.

- **Base outfit:** chosen to suit the day's **high**.

  | Feels-like high | Target warmth |
  |---|---|
  | below 10°C | 3 (heavy) |
  | 10–20°C | 2 (medium) |
  | above 20°C | 1 (light) |

  Items within ±1 of the target pass.
- **Outerwear:** added when the day's **low** is below 15°C or rain is forecast. The coat's warmth follows the low.

### 6.3 Other filters
- **Occasion:** keep items tagged with the chosen occasion.
- **Season:** worked out from the month and hemisphere. Items with no season tags count for every season.

### 6.4 Slots
- **Base:** top + bottom, *or* a dress.
- **Shoes:** always included.
- **Outerwear:** only when the weather rule in 6.2 calls for it.

### 6.5 Validity
A combo is valid when its colors pass the selected color mode, it has at most one patterned item, and it hasn't been disliked.

### 6.6 Selection and relaxing the rules
The picker samples random combos, keeps the valid ones, weights liked combos ×3, avoids the outfit shown just before, and picks one.

**If nothing is valid,** it relaxes one rule at a time, in this order, and labels the result with what it relaxed:
1. Allow warmth within ±2 instead of ±1.
2. Drop the season filter.
3. Fall back from the selected color mode to Auto.
4. Allow two patterned items.

The picker **never** relaxes the occasion, the hamper or "not today." If it still finds nothing, it explains which category ran out and why.

### 6.7 Color palette
There are 18 named colors.
- **Neutrals:** black, white, grey, navy, denim, beige and brown.
- **Statement colors:** red, burgundy, pink, orange, yellow, olive, green, teal, blue, light blue and purple.

Each color has a hue value so the color modes can be calculated. Auto mode uses a short list of non-neutral pairs that work together.

### 6.8 Tag values
These lists are fixed, because every backup file stores them. Renaming or removing a value later needs a backup migration (§7). Adding a value doesn't.

| Tag | Values |
|---|---|
| Category | `top`, `bottom`, `dress`, `shoes`, `outerwear` |
| Pattern | `solid`, `striped`, `checked`, `print` |
| Occasion | `casual`, `work`, `formal`, `workout` |
| Season | `spring`, `summer`, `autumn`, `winter` |
| Warmth | `1` light, `2` medium, `3` heavy |
| Color | the 18 palette names in §6.7, in lowercase with hyphens (`light-blue`) |

- **Category** maps one-to-one onto the slots in §6.4. Jumpsuits and overalls count as `dress`, because they fill the whole base slot. Sweaters, cardigans and hoodies count as `top`. Jackets and coats worn over everything count as `outerwear`.
- **Pattern:** the validity rule (§6.5) only asks whether an item is solid, so every value except `solid` counts as patterned. The other three exist so that the closet can be filtered and the tag reads naturally. `print` covers florals, graphics and everything else.
- **Occasion:** every item needs at least one, or the picker could never choose it.
- **Season:** may be empty, which means every season (§6.3).

## 7. Technical design
| Area | Choice | Why |
|---|---|---|
| App | Vite + React + TypeScript, **installable app (PWA)** | Installing to the home screen keeps Safari from clearing the data and makes it feel like a real app |
| Storage | IndexedDB, through Dexie. Asks for persistent storage (`navigator.storage.persist()`) on first launch | Can hold photo files, and data stays on the device. Persistent storage asks the browser not to clear the data when space runs low |
| Validation | zod | Backup files are untrusted input. Schemas check every record and drop unknown fields |
| Weather | Open-Meteo daily high and low, rain probability, and geocoding | Free, no API key |
| Styling | Plain CSS variables, light and dark themes, mobile-first | A clean, minimal catalog look |
| Tests | Vitest, with fake-indexeddb for database tests | Unit tests for the rules and the backup round trip |
| Hosting | GitHub Pages at `https://<user>.github.io/closet-builder/`. Vite `base`, the manifest's `start_url` and `scope`, and the service worker scope are all `/closet-builder/` | Free static HTTPS, deployed from the repo by one Action. A wrong base path breaks installing to the home screen. With a custom domain later, all of these become `/` |

**Data model**
```ts
Item     { id: number /* auto-increment; kept as-is on restore */, name, category, color, pattern,
           occasions[], seasons[], warmth: 1|2|3, brand?, photo?: Blob, inHamper: boolean,
           skipDate?: 'YYYY-MM-DD', createdAt /* ISO */ }
Outfit   { key /* item ids sorted numerically, joined with '|' */, itemIds[], rating?: 'like'|'dislike' }
Settings { comfortOffset: -3|0|3, lastOccasion, lastColorMode,
           location? /* lat/lon rounded to 2 decimals, about 1km */,
           lastBackupAt?, lastBackupSource?: 'share'|'download'|'restore', changesSinceBackup: number }
```
- **First launch:** comfort offset `0`, occasion `casual`, color mode `auto`, no location, `changesSinceBackup` `0`.
- **Outfit keys sort numerically**, because the default sort puts `10` before `9` and would give one outfit two keys.
- **`lastBackupSource`** decides which status line Flow E shows.
- **All writes go through one module (`repo.ts`).** It counts changes for the backup reminder in the same transaction as the write itself.

**Backup file format**
```json
{ "app": "closet-builder", "version": 1, "appVersion": "0.1.0",
  "exportedAt": "2026-10-21T08:00:00.000Z",
  "counts": { "items": 42, "outfits": 17 },
  "settings": { "comfortOffset": 0, "lastOccasion": "work", "lastColorMode": "auto", "location": {...} },
  "items": [{ "id": 17, "...item fields": "", "photo": "data:image/jpeg;base64,... or null" }],
  "outfits": [{ "itemIds": [3, 17, 42], "rating": "like" }] }
```
- **One JSON file, with photos embedded as base64.** It's simple, readable, and needs no zip library. At roughly 100KB per photo, 20 items come to about 3MB and 150 items to about 20MB, which is fine.
- **Version field.** Imports check `version` and convert older files. A file from a newer version is rejected with a clear message rather than imported halfway.
- **`appVersion` and `counts`.** `appVersion` is for bug reports. `counts` catches a file that was cut off but still happens to be valid JSON.
- **Left out of the file:** backup status (`lastBackupAt`, `lastBackupSource`, `changesSinceBackup`), and outfit `key`, which is recomputed from `itemIds` on import.
- **All or nothing.** Imports run inside one database transaction. A broken or truncated file changes nothing. Restored items keep their original IDs, so ratings still point at the right items.
- **Size limits.** Import refuses files over 100MB before reading them. Export warns above 40MB, which is about 300 items. Both limits are provisional until the device test (BACKUP-IMPLEMENTATION.md, step 12d).
- **Saving the file.** On phones, the app uses the share sheet (`navigator.share` with a file) where available, and a normal download everywhere else. A download is shown as "not confirmed" (Flow E). The safety copy before a destructive import never falls back to a download.

**Build order**
0. Spikes: test that photo files can be stored in the test environment, and that the share sheet works on an installed iPhone app (pass criteria in BACKUP-IMPLEMENTATION.md, step 0).
1. Skeleton: database schema, `repo.ts`, first-launch settings, add and edit item with photo resizing, the closet grid and the hamper. Deploy to GitHub Pages and install the app on a phone.
2. Backup and restore (Flow E), following BACKUP-IMPLEMENTATION.md. It comes before the picker so that the closet you catalog while testing is protected.
3. Today: weather, the outfit picker and its rules (§6), lock, "not today", likes and dislikes.

## 8. Future roadmap (after the MVP)
| Area | Feature |
|---|---|
| Data safety | Automatic cloud backup (e.g. to Google Drive); sync across devices |
| Laundry | Automatic dirty tracking: each item gets a wears-before-wash count, and "Wearing this" marks items dirty |
| Weather | Shoes flagged "not for rain"; picking weather from only the hours you're out |
| Planning | Saved outfits (lookbook), an outfit calendar with selfies, a packing list, event planning |
| Insights | Closet stats; a capsule wardrobe builder; shopping gaps with brand links |
| Closet | Care-label scan; multiple closets; an accessories layer |
| Feedback | Item-pair dislikes, if rejecting whole combos turns out to be too slow to teach the app |
| Platform | Optional AI auto-fill from a photo, using your own API key |

**Ideas considered and rejected**
- **Barcode or tag scanning:** there's no free public database that maps a barcode to clothing details, and most clothes no longer have their hang tags.
- **Product listings inside the app:** would need approval from shopping affiliate programs and a server.
- **Morning reminders:** a local-only app can't send scheduled notifications.

## 9. Risks and open questions
- **A backup only helps if you make it.** Export is manual. If you lose your phone and your last export was two months ago, you lose two months of changes. The overdue reminder (Flow E) is the only safeguard. If you ignore it, automatic cloud backup (§8) is the real fix.
- **Backups saved on the same phone.** If the file goes into the phone's local storage instead of iCloud or Google Drive, it disappears along with the phone. The export screen should recommend a cloud location.
- **Backups contain your photos.** The file holds every closet photo. Anyone you send it to sees them all.
- **A forgotten hamper.** Because the hamper is manual, the app only knows what's dirty if you tell it. If you forget **Laundry done**, items stay out of rotation and suggestions get thin. The hamper badge and the failure message ("3 tops are in the hamper") are the only safeguards. If this happens often, move automatic dirty tracking (§8) into the app.
- **Four color modes vs. "can't decide."** Every extra choice works against the main problem. They're kept but tucked away. Watch whether you ever change the mode, and if you don't, remove the other three.
- **Disliking whole combos learns slowly.** A clash between two items will keep coming back with different shoes. "Not today" covers some of this. Watch for it.
- **Small closets.** About 20 items, after occasion, weather and hamper filtering, may leave very few candidates. The relaxation order in §6.6 is meant to soften this, so check how often relaxed results come up.
- **Auto-color accuracy:** busy backgrounds or patterned items can mislead it. The user can always correct the color.

## 10. How we'll know it works
**Tests**
- Unit tests cover:
  - the high and low weather rules and the comfort offset
  - hamper and "not today" exclusion
  - season filtering and each color mode
  - nearest-color matching and locked slots
  - like and dislike behavior
  - the dress vs top+bottom choice
  - the relaxation order and failure messages
  - backup: export → import gives back identical data, including photos; a truncated or wrong-version file changes nothing; importing onto a non-empty phone warns before replacing; the safety copy counts only after a share-sheet save, and cancelling it cancels the import
  - tag values: values outside §6.8 are rejected, and an item with no occasion is rejected
- **Manual test:**
  1. Install the app on a phone.
  2. Catalog about 20 items.
  3. Generate outfits on a cold day and a warm day, with each comfort setting.
  4. Put items in the hamper and confirm they never appear. Then use Laundry done.
  5. Use "Not today", lock an item and shuffle.
  6. Reload and confirm that the data persisted.
  7. Export to iCloud or Drive.
  8. Delete the app, reinstall it and import the file.
  9. Check that the closet, photos, ratings and settings all came back.

**After a month of real use**
- Do you wear the suggested outfit (or one shuffle away from it) on most mornings?
- How often does "nothing fits" or a relaxed result show up?
- Do you ever change the color mode?
- How often is the hamper badge above about 10?
