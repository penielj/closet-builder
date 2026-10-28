# Closet Builder: Design Doc

**Status:** v11 (wear tracking, quiet-luxury look) · **Date:** 2026-10-28 · **Author:** Peniel Johnson

## 1. Summary
Closet Builder is a personal web app, installable on your phone. Each morning it suggests an outfit made only from clothes you own that are **clean today**, chosen to suit the weather and the occasion. Everything stays on the device, with no account and no server.

## 2. Goals
**Goals**
- An outfit in under 10 seconds, with no decisions needed on a normal day.
- Useful after cataloging about **20 items**.
- Never suggest something that's in the hamper.

**Non-goals:** AI outfit generation, accounts or sync, notifications, shopping. Recognizing an item's category from its photo on the device isn't outfit generation: it only pre-fills the form, like auto color (spike 0.3, §8 step 4).

## 3. Flows

**A. First run.** A welcome screen says "Add the ~20 things you actually wear." A progress meter shows what the picker needs: at least 3 tops, 2 bottoms and 1 pair of shoes, where a dress counts as both a top and a bottom. Today unlocks once that's met. On an iPhone, in Safari rather than the installed app, a banner says: "Add to Home Screen before you start. What you add in Safari stays in Safari."

**B. Add an item.** Take or choose a photo of the garment laid flat or hung up. The app cuts the garment out onto white (§4, "Cutout"), resizes it and pre-selects its color. While the cutout runs, the form shows its progress (the first one also downloads the model) and a **Use photo as is** button that skips it. A **Cut out the background** checkbox turns it off, remembered on this phone. An iPhone cutout (touch and hold the clothing in Photos, share the lifted subject, save it) still works: its transparent area is filled with white. Fill in the name, category, pattern, occasions, seasons, warmth and an optional brand, then save.

**C. Today.**
- **Location.** The first time Today opens, the app asks for geolocation. If that's denied or fails, Today shows a city box instead of an outfit. After that the saved location is used every day. The weather line has a **Change** link that asks for geolocation again or takes a new city.
- **Weather.** The app waits up to 5 seconds for today's forecast, then shows the outfit with or without it (§5, "No weather"). The weather line shows the actual high and low, not the comfort-adjusted ones, plus the chance of rain.
- **Occasion.** A row of the four occasions, with the one from last time selected. Changing it picks a new outfit, keeping locked items.
- **The outfit.** The app shows one outfit as a grid of equal squares, two across, like product shots: shirt and pants (or a dress) first, then the layers picked to go with them: sweater, shoes, jacket, hat and bag (§5). Each garment is trimmed and shown cut out on the page itself, white or black in dark mode, with no text in the grid. Below it, a list names each piece (brand, name) with its **Not today** and **Hamper** links. On it you can:
  - **Swipe** a piece's photo sideways to change only that piece (§5, rule 12). The photo follows the finger and snaps to the next choice, and a counter ("2/4") shows where you are.
  - **Lock** a piece with the lock icon in its photo's top-right corner, so it stays when you shuffle. A locked piece doesn't swipe.
  - Mark a piece **Not today**, which excludes it until midnight. In the Closet tab it's dimmed with a **Wear today** button that undoes it.
  - Send a piece to the **Hamper**.
  - **Remove** a layer (sweater, jacket, hat or bag) for the day, or tap a dashed **+ Sweater**, **+ Jacket**, **+ Hat** or **+ Bag** square to put one on. A square shows only when one of those fits and isn't in the outfit (rule 15).
  - Tap **Not for me** (a 👎) to never see this outfit again. A new outfit is picked straight away.
  - Tap **Shuffle** for a new outfit.
  - Tap **Wore this** once you've worn it (rule 16). Each piece counts a wear, pieces at their limit go to the hamper, and the outfit stays as it is for the rest of the day: no swiping, locks or layer changes, and the list says "To the hamper" or the wear count instead of the links. A line reads "Worn today. 1 piece went to the hamper."

**Today's outfit stays put.** The picked outfit and its locks are saved for the day, so reopening the app shows the same outfit. A new outfit is picked, keeping locked items, only when:
- you tap Shuffle or 👎, or change the occasion (a swipe changes only the swiped item)
- an item in it goes to the hamper, is marked Not today, or is deleted: then only that piece's slot is refilled (rule 15), unless the base can't be completed
- it's a new day (checked when the app opens or comes back to the front). Locks are cleared then too.

Editing an item doesn't trigger a new pick, even if the item would no longer fit.

**D. Hamper.** Any item can go **→ Hamper**, and hamper items are never suggested. The top bar shows "HAMPER (7)". **Laundry done** returns everything at once.

**E. Settings.** Opened from **SETTINGS** in the top bar. A **Cutouts** panel says how many photos aren't cut out yet (they show on a white square in dark mode) and has **Cut out N photos**, which cuts them out one at a time with progress and a **Stop** button. Step 2 builds it with **Comfort** and **Location**. Step 3 adds **Backup**:
- **Export closet** builds one `.closet.json` file that includes the photos. **Save** then opens the phone's share sheet (or downloads the file on a desktop) so you can keep it in iCloud Drive or Google Drive. It's two taps because iPhones only open the share sheet straight after a tap.
- **Import closet** picks a file. If the closet isn't empty, the app asks "Replace your 42 items with the 38 in this backup?", then replaces everything.
- Settings shows "Last backup: 12 days ago · 9 changes since".
- **Disliked outfits** lists every 👎 by its pieces' names, each with **Forget**, which counts as a real change.

## 4. Features
| Area | Feature |
|---|---|
| Look | Quiet luxury, for people who shop SSENSE and Grailed and buy Le Labo and Diptyque: warm paper (#f6f4ef; warm black #11100e in dark mode), square corners, hairlines, no shadows, and three voices. Names and screen titles are in a serif (Cormorant Garamond, the Diptyque note), labels in a typewriter face (Courier Prime: brands, filters, counts, notes, and Today's label line "College Park · 28 Oct 2026 · 20° / 8° · rain 0%", the Le Labo note), buttons and tabs in a small tracked Helvetica (the SSENSE note). Both faces are bundled (Latin only, about 90KB), so they work offline. Garments are shown whole and alone: a photo with a cutout mask is shown with the mask as its transparency, trimmed to the garment, straight on the page's background, white or black. A photo without a mask keeps a white square, and on Today it's trimmed to its non-white pixels (all channels below 245) instead. Both trims keep a 2% margin and happen at display time, so older photos get them too (`src/photo/trim.ts`). Today's grid squares are all the same size. |
| Closet | A photo grid filtered by category, each item with its brand (bold, uppercase) over its name. Add, edit and delete items. Hamper and Not today items are dimmed. |
| Cutout | RMBG-1.4 (BRIA; free for non-commercial use) runs on the device through transformers.js: on the GPU at half precision (~88MB) when the phone has WebGPU, otherwise on the CPU at 8 bits (~44MB). The model predicts a mask at 1024×1024, and the photo gets that mask as its transparency. The usual resize then saves the garment on white as the JPEG, plus the transparency as a grayscale PNG mask next to it (any photo with transparency, an iPhone cutout too, gets one), so it can also be shown on black. The library comes from jsdelivr and is kept in Cache Storage, and the model is cached by the library, so after the first download it works offline. Any failure keeps the photo as it is, with a note (`src/photo/cutout.ts`). Worn clothes keep the person: the model keeps the subject. |
| Photos | Taken with the camera or uploaded, then resized on the device to about 800px JPEG. That also removes EXIF data, including location. Transparent areas (an iPhone cutout) are filled with white, since JPEG has no transparency and would turn them black. The add-item form suggests laying the item flat on a white sheet in daylight. |
| Auto-whiten | When the outer 5% of the photo is a plain, light surface (average level at least 150, channel spread at most 60, little variation), each channel is scaled so that surface becomes pure white, and anything at 235 or above after scaling becomes 255. That also takes out a warm cast from indoor light. Dark, colored or busy backgrounds, and already-white ones, are left alone (`src/photo/whiten.ts`). |
| Auto color | Samples the center 50% of the photo and snaps the dominant color to the nearest palette color. Transparent pixels are skipped, so a cutout's background isn't counted. A whitened photo is sampled after the correction, so a warm cast doesn't turn white into beige. You can override it. |
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
5. **Slots:** the base is a top + bottom, or a dress, with shoes. It's what outfits are built from, compared by and disliked by. The layers go on after it, in order: a sweater (rule 13), a coat (rule 9), then a hat and a bag (rule 14).
6. **Colors:** any number of neutrals, and at most **one** statement color, which can appear on more than one item. The base and the sweater count; coats, hats and bags don't.
7. **Pattern:** at most one patterned item (anything that isn't `solid`). The base and the sweater count; coats, hats and bags don't.
8. **Pick:**
   - Build every valid base + shoes combo, which is fast at closet size.
   - Drop the disliked ones.
   - Drop the outfit on screen now, unless it's the only one left. In that case show it again with the note "This is the only outfit that fits."
   - Change as much as possible: keep only the outfits that share the fewest unlocked items with the one on screen (phone test 2: Shuffle kept the same top). An unlocked item that's in every outfit left gets the note "{Name} is the only {top} that fits today."
   - Pick one of those at random.
   - Locked items are always included, even when they break rules 2–4. They still count toward rules 6 and 7, and a locked sweater only allows bases that go with it. Putting a locked item in the hamper, marking it Not today or deleting it unlocks it.
9. **Coat:** added after the base and shoes are picked, when the feels-like low is below 15°C or the chance of rain is 50% or more.
   - It's chosen from outerwear that passes rules 1–3. Rule 4's ±1 doesn't apply.
   - When the feels-like low is below 5°C, pick at random among the coats with the highest warmth. Otherwise pick any of them at random.
   - If there's no such coat, the outfit is shown without one, with the note "No clean coat." The note only shows to someone who owns a coat.
   - A locked coat is always shown, even when the weather doesn't call for one.
10. **Nothing fits:** try once more without rule 4. If that fails too, show a message:
    - If no top or dress passes rules 1–3, say "No {occasion} tops for today." Do the same for bottoms (when there are no dresses either) and for shoes. Use the first one that applies, in that order.
    - Under it, list that slot's items, each with why it's out and a way back in: "In the hamper" (**Take out**), "Marked Not today" (**Wear today**, which clears `skipDate`), "Not tagged {Occasion}" or "Summer only, and it's autumn" (**Edit**). Phone test 2: with one of three tops marked Not today, the screen said only "No clean casual tops," and the other two were out for season or occasion tags without saying so.
    - Otherwise, the first that applies:
      - Locks are set and an outfit would fit without them: "Your locked items don't go with anything clean. Unlock one to see more outfits."
      - An outfit would fit without the 👎s: "You've given a 👎 to every {occasion} outfit that's left." with a **Forget my 👎s** button, which clears every dislike and counts as a real change.
      - Otherwise: "Your clean {occasion} clothes don't go together: an outfit can have only one statement color and one pattern." When something is in the hamper, add "Try Laundry done."
    - Locks can't be seen without an outfit, so the message lists the locked items, each with an **Unlock** button (phone test 1: the old message said "unlock an item" with no way to see which).
11. **No weather:** if the forecast doesn't arrive (offline, no location yet, or the request fails), rule 4 and the coat are skipped, and the weather line says "No weather, so warmth isn't checked." A forecast already fetched today is reused without a new request.

12. **Swipe:** each piece on Today is a carousel of its slot's choices. Settling on another one replaces only that piece, keeping the rest of the outfit and its locks.
    - The choices are items of the same category that pass rules 1–4 (rule 4 only with a forecast), keep rules 6 and 7 with the rest of the outfit (sweater included), and don't make a disliked outfit. A sweater's choices pass rules 1–3, 6 and 7. A coat's, hat's or bag's pass rules 1–3 only. They're worked out again whenever the outfit changes, so changing the top can change what the bottom offers.
    - They're ordered by when they were added, and the piece on screen is among them. The carousel is a native horizontal scroller that snaps one photo at a time (no wrapping), and a choice counts once the scrolling has stopped for 120ms, and only if a finger, trackpad or wheel started it. A resize or rotation also moves a snapping scroller; that snaps back instead of changing the outfit.
    - A locked piece shows only itself and doesn't scroll. With nothing else to choose, the carousel has one photo and no counter.
    - The new outfit is saved for the day like any other pick. Swiping isn't a real change, so it doesn't count toward the backup reminder.
13. **Sweater:** added after the base when the feels-like high is below 18°C (with the comfort offset; no forecast, no sweater). It's chosen at random from sweaters that pass rules 1–3 and keep rules 6 and 7 with the base. Rule 4 doesn't apply. If none goes with the base, the note says "No clean sweater goes with this," but only when there are any sweaters at all. A locked sweater is always shown.
14. **Hat and bag:** picked last, at random from those that pass rules 1–3, whenever there is one; without one nothing is added and nothing is said. A locked one is always shown. They're accessories, so rules 6 and 7 don't count them.
15. **Only the slot that changed:** when pieces leave today's outfit (hamper, Not today, deleted), the rest stays and only their slots are refilled. A base slot takes a piece that fits with the rest (rules 1–4, 6 and 7 with the sweater on, and the 👎s); a layer is replaced by another of its kind that fits, or left out. If the base can't be completed, or nothing of it is left, a new outfit is picked. Adding a layer by hand picks at random from the same choices.
16. **Wear tracking:** **Wore this** adds a wear to each piece and sets its `lastWorn`. A piece whose wears reach its **Wash after** goes to the hamper on its own; taking it out (or Laundry done) means washed, so its count starts again. Wash after is set per item in its form, or falls back to its category: tops 1; bottoms, dresses and sweaters 3; shoes, coats, hats and bags never. Workout-only clothes default to 1. Wears are temporary state, like the hamper, so they don't count toward the backup reminder; a Wash after setting does. Closet shows "2/3 wears", or "Worn 4×" for what never goes on its own.
17. **Rotation:** among the outfits that are left, prefer those with the fewest unlocked pieces worn in the last 3 days, and pick layers from rested pieces first. When everything was worn recently, all of it is still allowed.

An outfit's identity (its `key`) is its top, bottom or dress plus its shoes, **not** the coat. That way a disliked outfit doesn't come back just because the coat changed. 👎 saves only those IDs.

## 6. Fixed values
| Tag | Values |
|---|---|
| Category | `top`, `bottom`, `dress`, `sweater`, `shoes`, `outerwear`, `hat`, `bag` (in outfit order). The last three, and `sweater`, were added in v10; adding values needs no backup version bump. |
| Pattern | `solid`, `striped`, `checked`, `print` |
| Occasion | `casual`, `work`, `formal`, `workout`. Every item needs at least one. |
| Season | `spring`, `summer`, `autumn`, `winter`. Empty means every season. |
| Warmth | `1` light, `2` medium, `3` heavy |
| Color | 18 names, below |

- **Neutrals:** black, white, grey, navy, denim, beige and brown.
- **Statement colors:** red, burgundy, pink, orange, yellow, olive, green, teal, blue, light-blue and purple.

Jumpsuits count as `dress`; sweaters, cardigans and hoodies as `sweater` (before v10 they were `top`: move them in Closet); jackets and coats as `outerwear`. Backup files store these strings, so renaming or removing one needs a backup `version` bump.

## 7. Technical design
| Area | Choice |
|---|---|
| App | Vite + React + TypeScript, installable to the home screen (PWA) |
| Storage | IndexedDB through Dexie, with photos stored as Blobs in their own `photos` table (below). Asks for `navigator.storage.persist()` on launch. |
| Writes | All writes go through `src/db/repo.ts`. Real changes (add, edit or delete an item, a dislike, comfort) bump `changesSinceBackup` in the same transaction. Temporary state (hamper, Not today, occasion, location, `today`) doesn't. A write that fails shows a message instead of failing silently. |
| Picker | A pure function in `src/closet/picker.ts`: items, settings, forecast, locks, the current outfit, dislikes and a `random()` go in; an outfit (or a "nothing fits" message) and its notes come out. No database or React inside, so rule tests are plain unit tests. |
| Validation | zod, for import files |
| Offline | A service worker caches the built app. Weather needs a connection (§5, rule 11). |
| Hosting | GitHub Pages at `/closet-builder/`, deployed by one Action. Vite `base` and the manifest's `start_url` and `scope` must all match. |
| Tests | Vitest, with fake-indexeddb |

**Data model**
```ts
Item     { id /* auto-increment */, name, category, color, pattern, occasions[], seasons[],
           warmth: 1|2|3, brand?, inHamper, skipDate?: 'YYYY-MM-DD', createdAt,
           wears?, lastWorn?: 'YYYY-MM-DD', washAfter? /* 0 never; unset: the category's */ }
Photo    { itemId /* primary key, = Item.id */, blob: Blob /* JPEG on white */, mask?: Blob /* PNG, from a cutout */ }
Outfit   { key /* base + shoes ids, sorted numerically, joined with '|' */, itemIds[], rating: 'dislike' }
Settings { comfortOffset: -3|0|3, lastOccasion, location?: { lat, lon, label? } /* rounded to ~1km */,
           lastBackupAt?, changesSinceBackup,
           today?: { date: 'YYYY-MM-DD', itemIds[] /* incl. coat */, locked[],
                     forecast?: { high, low, rainChance }, worn?: boolean } }
```
- **Why photos have their own table:** an update rewrites the whole record. When the photo lived on the item, Laundry done re-saved every photo in the hamper, and on the iPhone the items stayed in the hamper until the app was closed and reopened, then showed no photos until it was reopened again (phone test 1). Now hamper, Not today and item edits that keep the photo never touch the `photos` table. Deleting an item deletes its photo in the same transaction. Database version 3 moves existing photos over.
- Sort the IDs numerically: the default sort puts `10` before `9`.
- `today` is replaced as a whole when the date changes. It's left out of backups, and an import clears it.
- Dates are the device's local date, never UTC.

**Backup file**
```json
{ "app": "closet-builder", "version": 1, "exportedAt": "2026-10-21T08:00:00.000Z",
  "settings": { ... }, "items": [{ "id": 17, ..., "photo": "data:image/jpeg;base64,..." }],
  "outfits": [{ "itemIds": [3, 17], "rating": "dislike" }] }
```
- **Photos embedded as base64:** about 100KB each, so 150 items come to about 15MB. Each photo stays on its item in the file, so the `photos` table doesn't change the format or its `version`. A cutout's mask is an optional `mask` data URL next to `photo`; older files simply have none, and older apps drop it. Wear tracking's `wears`, `lastWorn` and `washAfter` are optional item fields the same way.
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
3. **Backup (done):** export, import and the status line (Flow E). Spike 0.2 (iOS share sheet) passed first, on 2026-10-27, see `spikes/RESULTS.md`.
4. **Phone test 1 fixes:** from using the app on an iPhone, 2026-10-28.
   - **Hamper bug:** the `photos` table (§7) and messages for failed writes. Add a test that Laundry done leaves the `photos` table untouched.
   - **Cutouts:** fill transparent areas with white before the JPEG is made, and skip transparent pixels in auto color (Flow B, §4).
   - **Swipe** to change one item (§5, rule 12).
   - **Spike 0.3, category from the photo:** a test page at `public/spike/`, deleted once the results are in `spikes/RESULTS.md`. It runs an on-device zero-shot image model in the browser (a CLIP-style model through transformers.js) against the five categories, described in words ("a shirt or sweater", "pants, shorts or a skirt", "a dress or jumpsuit", "shoes", "a jacket or coat"). Run it in the same session as phone test 2, on the photos taken for it. Pass criteria, from the installed app on the iPhone:
     - at least 18 of 20 real photos get the right category
     - under 3 seconds per photo once the model is loaded
     - the one-time download is under 100MB and works offline afterwards
     - no crash or reload
   - If spike 0.3 passes, step 5 builds it in: the category is pre-selected from the photo the way the color is, and you can change it. If it fails, the form starts on the last category used instead.
   - **Catalog look:** whole photos on white tiles and auto-whiten (§4).
   - **Spike 0.4, background removal:** RMBG-1.4 on the same spike page and library, in the same session as 0.3, on 20 photos of clothes laid flat or hung on ordinary backgrounds. Pass: at least 16 rated Good, under 5 seconds per photo, no crash or reload. Its license allows non-commercial use only, which fits a personal app. Criteria and the Mac numbers are in `spikes/RESULTS.md`.
   - **Cutout in Add item, built before spike 0.4 ran** (2026-10-28, by choice): the SSENSE look needs it, and it falls back to the plain photo on any failure, with a **Use photo as is** button for a slow one. Spike 0.4 still decides whether it stays on by default and which device it prefers; the total download with category recognition gets decided with both results in hand.
   - **SSENSE look** (§4 "Look") and the swipe carousel on Today (rule 12), replacing the 50px swipe gesture, which had no feedback while dragging.
   - **v10, from the second round of feedback:** Today as a grid of equal squares; the base (shirt and pants) picked first, then a sweater by weather, the coat, a hat and a bag (rules 5, 13, 14; new categories `sweater`, `hat`, `bag`); garments shown cut out on white or black by theme, with the cutout mask stored next to each photo and a **Cut out N photos** button in Settings for older ones.

## 9. Later, if it's missed
Liked outfits · color modes (tonal, complementary) · cloud backup · a backup reminder · counting the coat in the color and pattern rules.

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
- **Slot choices (swipe carousel):** ordered by when items were added with the shown one included, rules 1–4 applied (warmth only with a forecast), rules 6 and 7 kept with the rest of the outfit, dislikes skipped, coats by rules 1–3 only, and just the item when nothing else fits.
- **Manual (phone test):** install on a phone, catalog 20 items, check a cold day and a warm day, deny geolocation and type a city, open it offline, use the hamper, then delete the app, reinstall and import a backup.
  - **Phone test 2 adds:** after Laundry done and "Take out", items leave the hamper at once and keep their photos, without reopening the app. Existing photos survive the update to database version 3. A cutout photo saves with a white background and the right auto color. Each piece's carousel follows the finger, settles on a choice and saves it, and a locked piece doesn't move. Adding an item cuts the garment out onto white: note how long the first one (with the download) and later ones take, and whether **Use photo as is** works. Run spikes 0.3 and 0.4 in the same session.
