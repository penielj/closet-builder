# Closet Builder: Design Doc

**Status:** v8 (Today specified) · **Date:** 2026-10-21 · **Author:** Peniel Johnson

## 1. Summary
Closet Builder is a personal web app, installable on your phone. Each morning it suggests an outfit made only from clothes you own that are **clean today**, chosen to suit the weather and the occasion. Everything stays on the device, with no account and no server.

## 2. Goals
**Goals**
- An outfit in under 10 seconds, with no decisions needed on a normal day.
- Useful after cataloging about **20 items**.
- Never suggest something that's in the hamper.

**Non-goals:** AI outfit generation, accounts or sync, notifications, shopping.

## 3. Flows

**A. First run.** A welcome screen says "Add the ~20 things you actually wear." A progress meter shows what the picker needs: at least 3 tops, 2 bottoms and 1 pair of shoes, where a dress counts as both a top and a bottom. Today unlocks once that's met. On an iPhone, in Safari rather than the installed app, a banner says: "Add to Home Screen before you start. What you add in Safari stays in Safari."

**B. Add an item.** Take or choose a photo. The app resizes it and pre-selects its color. Fill in the name, category, pattern, occasions, seasons, warmth and an optional brand, then save.

**C. Today.**
- **Location.** The first time Today opens, the app asks for geolocation. If that's denied or fails, Today shows a city box instead of an outfit. After that the saved location is used every day. The weather line has a **Change** link that asks for geolocation again or takes a new city.
- **Weather.** The app waits up to 5 seconds for today's forecast, then shows the outfit with or without it (§5, "No weather"). The weather line shows the actual high and low, not the comfort-adjusted ones, plus the chance of rain.
- **Occasion.** A row of the four occasions, with the one from last time selected. Changing it picks a new outfit, keeping locked items.
- **The outfit.** The app shows one outfit. On it you can:
  - **🔒 Lock** an item so it stays when you shuffle.
  - Mark an item **Not today**, which excludes it until midnight.
  - Send an item **→ Hamper**.
  - Tap **👎** to never see this outfit again. A new outfit is picked straight away.
  - Tap **Shuffle** for a new outfit.

**Today's outfit stays put.** The picked outfit and its locks are saved for the day, so reopening the app shows the same outfit. A new outfit is picked, keeping locked items, only when:
- you tap Shuffle or 👎, or change the occasion
- an item in it goes to the hamper, is marked Not today, or is deleted
- it's a new day (checked when the app opens or comes back to the front). Locks are cleared then too.

Editing an item doesn't trigger a new pick, even if the item would no longer fit.

**D. Hamper.** Any item can go **→ Hamper**, and hamper items are never suggested. The top bar shows "🧺 7 in hamper". **Laundry done** returns everything at once.

**E. Settings.** Opened from a ⚙ button in the top bar. Step 2 builds it with **Comfort** and **Location**. Step 3 adds **Backup**:
- **Export closet** builds one `.closet.json` file that includes the photos. **Save** then opens the phone's share sheet (or downloads the file on a desktop) so you can keep it in iCloud Drive or Google Drive. It's two taps because iPhones only open the share sheet straight after a tap.
- **Import closet** picks a file. If the closet isn't empty, the app asks "Replace your 42 items with the 38 in this backup?", then replaces everything.
- Settings shows "Last backup: 12 days ago · 9 changes since".

## 4. Features
| Area | Feature |
|---|---|
| Closet | A photo grid filtered by category. Add, edit and delete items. Hamper items are dimmed. |
| Photos | Taken with the camera or uploaded, then resized on the device to about 800px JPEG. That also removes EXIF data, including location. |
| Auto color | Samples the center 50% of the photo and snaps the dominant color to the nearest palette color. You can override it. |
| Brand | Autocompletes from existing items, so spellings stay consistent. |
| Weather | Open-Meteo forecast (free, no key): `daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max`, `timezone=auto`, `forecast_days=1`, in °C. The location comes from browser geolocation, or from a typed city looked up with Open-Meteo's geocoding API (first result). |
| Comfort | "I run cold / neutral / warm" sets the comfort offset to +3, 0 or −3. Rule 4 subtracts it, so running cold makes every temperature feel 3°C colder. |

## 5. Outfit rules
1. **Available:** not in the hamper, and `skipDate` isn't today's local date.
2. **Occasion:** the item is tagged with today's occasion.
3. **Season:** the item has no season tags, or one of them is the current season. Seasons go by month: March–May spring, June–August summer, September–November autumn, December–February winter. South of the equator (latitude below 0) they're swapped. With no saved location this rule is skipped.
4. **Warmth:**
   - **Feels like** = the temperature − comfort offset. If you run cold, 12°C feels like 9°C.
   - The feels-like high sets a target warmth: below 10°C heavy (3), 10–20°C medium (2), above 20°C light (1). Exactly 10°C and exactly 20°C are both medium.
   - Tops, bottoms, dresses and shoes pass when they're within ±1 of the target. On a 1–3 scale that only drops heavy items on hot days and light items on cold days, and nothing on medium days. That's intended.
5. **Slots:** top + bottom, or a dress, then shoes, plus a coat when rule 9 calls for one.
6. **Colors:** any number of neutrals, and at most **one** statement color, which can appear on more than one item. The coat isn't counted.
7. **Pattern:** at most one patterned item (anything that isn't `solid`). The coat isn't counted.
8. **Pick:**
   - Build every valid base + shoes combo, which is fast at closet size.
   - Drop the disliked ones.
   - Drop the outfit on screen now, unless it's the only one left. In that case show it again with the note "This is the only outfit that fits."
   - Pick one at random.
   - Locked items are always included, even when they break rules 2–4. They still count toward rules 6 and 7. Putting a locked item in the hamper, marking it Not today or deleting it unlocks it.
9. **Coat:** added after the base and shoes are picked, when the feels-like low is below 15°C or the chance of rain is 50% or more.
   - It's chosen from outerwear that passes rules 1–3. Rule 4's ±1 doesn't apply.
   - When the feels-like low is below 5°C, pick at random among the coats with the highest warmth. Otherwise pick any of them at random.
   - If there's no such coat, the outfit is shown without one, with the note "No clean coat."
   - A locked coat is always shown, even when the weather doesn't call for one.
10. **Nothing fits:** try once more without rule 4. If that fails too, show a message:
    - If no top or dress passes rules 1–3, say "No clean {occasion} tops." Do the same for bottoms (when there are no dresses either) and for shoes. Use the first one that applies, in that order.
    - Otherwise say "Your clean {occasion} clothes don't go together. Try Laundry done, or unlock an item."
11. **No weather:** if the forecast doesn't arrive (offline, no location yet, or the request fails), rule 4 and the coat are skipped, and the weather line says "No weather, so warmth isn't checked." A forecast already fetched today is reused without a new request.

An outfit's identity (its `key`) is its top, bottom or dress plus its shoes, **not** the coat. That way a disliked outfit doesn't come back just because the coat changed. 👎 saves only those IDs.

## 6. Fixed values
| Tag | Values |
|---|---|
| Category | `top`, `bottom`, `dress`, `shoes`, `outerwear` |
| Pattern | `solid`, `striped`, `checked`, `print` |
| Occasion | `casual`, `work`, `formal`, `workout`. Every item needs at least one. |
| Season | `spring`, `summer`, `autumn`, `winter`. Empty means every season. |
| Warmth | `1` light, `2` medium, `3` heavy |
| Color | 18 names, below |

- **Neutrals:** black, white, grey, navy, denim, beige and brown.
- **Statement colors:** red, burgundy, pink, orange, yellow, olive, green, teal, blue, light-blue and purple.

Jumpsuits count as `dress`, sweaters and hoodies as `top`, and jackets and coats as `outerwear`. Backup files store these strings, so renaming or removing one needs a backup `version` bump.

## 7. Technical design
| Area | Choice |
|---|---|
| App | Vite + React + TypeScript, installable to the home screen (PWA) |
| Storage | IndexedDB through Dexie, with photos stored as Blobs. Asks for `navigator.storage.persist()` on launch. |
| Writes | All writes go through `src/db/repo.ts`. Real changes (add, edit or delete an item, a dislike, comfort) bump `changesSinceBackup` in the same transaction. Temporary state (hamper, Not today, occasion, location, `today`) doesn't. |
| Picker | A pure function in `src/closet/picker.ts`: items, settings, forecast, locks, the current outfit, dislikes and a `random()` go in; an outfit (or a "nothing fits" message) and its notes come out. No database or React inside, so rule tests are plain unit tests. |
| Validation | zod, for import files |
| Offline | A service worker caches the built app. Weather needs a connection (§5, rule 11). |
| Hosting | GitHub Pages at `/closet-builder/`, deployed by one Action. Vite `base` and the manifest's `start_url` and `scope` must all match. |
| Tests | Vitest, with fake-indexeddb |

**Data model**
```ts
Item     { id /* auto-increment */, name, category, color, pattern, occasions[], seasons[],
           warmth: 1|2|3, brand?, photo?: Blob, inHamper, skipDate?: 'YYYY-MM-DD', createdAt }
Outfit   { key /* base + shoes ids, sorted numerically, joined with '|' */, itemIds[], rating: 'dislike' }
Settings { comfortOffset: -3|0|3, lastOccasion, location?: { lat, lon, label? } /* rounded to ~1km */,
           lastBackupAt?, changesSinceBackup,
           today?: { date: 'YYYY-MM-DD', itemIds[] /* incl. coat */, locked[],
                     forecast?: { high, low, rainChance } } }
```
- Sort the IDs numerically: the default sort puts `10` before `9`.
- `today` is replaced as a whole when the date changes. It's left out of backups, and an import clears it.
- Dates are the device's local date, never UTC.

**Backup file**
```json
{ "app": "closet-builder", "version": 1, "exportedAt": "2026-10-21T08:00:00.000Z",
  "settings": { ... }, "items": [{ "id": 17, ..., "photo": "data:image/jpeg;base64,..." }],
  "outfits": [{ "itemIds": [3, 17], "rating": "dislike" }] }
```
- **Photos embedded as base64:** about 100KB each, so 150 items come to about 15MB.
- **Checks before writing:** the `app` and `version` fields first, then every record against the zod schemas. A broken file, or one from a newer version, changes nothing and shows a clear message.
- **All or nothing:** the import runs in one transaction. It clears the closet, writes the backup with its original IDs so dislikes still point at the right items, clears `today`, sets `lastBackupAt` and resets the change count.
- **Saving:** `navigator.share` with a file where that works, otherwise a download. The installed iPhone app never falls back to a download, because one can fail there without saying so.

## 8. Build order
1. **Skeleton (done):** the database, `repo.ts`, the item form with photos, the closet grid, the hamper and the Pages deploy. Follow-ups, also done:
   - Create the settings row inside one transaction. React StrictMode runs the effect twice, which can make the second `add()` throw.
   - Wait for the settings row before rendering. `update()` on a missing row does nothing and reports no error, so an early occasion or location write would be lost.
   - **Code cleanup from v7:** remove the color modes (`COLOR_MODES`, `lastColorMode`), `lastBackupSource` and the `'like'` rating.
   - Add the service worker and the iPhone install banner.
2. **Today (done):** location and weather, the picker (§5), the saved daily outfit, lock, Not today, 👎, and Settings with Comfort and Location.
3. **Backup:** export, import and the status line (Flow E). **Blocked** until spike 0.2 (iOS share sheet) passes, see `spikes/RESULTS.md`.

## 9. Later, if it's missed
Liked outfits · color modes (tonal, complementary) · automatic dirty tracking · cloud backup · a backup reminder · counting the coat in the color and pattern rules · replacing only the slot that changed instead of re-picking.

## 10. Testing
- **Unit tests for the picker:**
  - the warmth targets at exactly 10°C and 20°C, and the comfort offset
  - when a coat is added, picking the warmest below 5°C, and the "No clean coat" note
  - hamper and Not today exclusion, season filtering and both hemispheres, and no location skipping the season rule
  - the one-statement-color and one-pattern rules, with the coat not counted
  - locks breaking rules 2–4 but not 6–7, a locked coat, and dislikes
  - the current outfit being dropped, and shown again when it's the only one
  - the retry without warmth, and each "nothing fits" message
  - no forecast: warmth and coat skipped
- **Today's outfit:** reopening the same day keeps it, a new day re-picks and clears locks, and sending a shown item to the hamper re-picks while keeping locks.
- **Backup round trip:** export → import gives back identical items, photos and dislikes, and `today` is cleared. A truncated or wrong-version file changes nothing.
- **Manual:** install on a phone, catalog 20 items, check a cold day and a warm day, deny geolocation and type a city, open it offline, use the hamper, then delete the app, reinstall and import a backup.
