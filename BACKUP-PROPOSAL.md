# Backup & Restore: Technical Proposal (Draft 1)

**Feature:** Export closet to file / Import closet from file (DESIGN.md, Flow E)
**Status:** First draft for discussion · **Date:** 2026-10-21

> **A note on "the codebase."** There is no code yet. `closet-builder/` holds only DESIGN.md. This proposal builds on the architecture the design commits to:
> - a React app, installed to the phone's home screen
> - the phone's built-in browser database, IndexedDB, used through the Dexie library
> - three tables: `items`, `outfits` and `settings`
> - photos stored as image files (Blobs) inside the `items` table
>
> Where this proposal needs the design to change, it says so explicitly (§9).

---

## 1. What this feature has to guarantee

The design has four requirements, and the rest of this document follows from them:

1. **Completeness.** A backup restores the closet exactly: items, photos, hamper state, ratings and preferences.
2. **Atomicity.** An import either fully succeeds or changes nothing. A half-restored closet is worse than no restore.
3. **Forward safety.** A file from an older version of the app can always be read. A file from a newer version is refused cleanly.
4. **Honesty.** The app never says "backed up" when it can't know that. This affects more of the design than it first appears to (§4.4).

---

## 2. Where it sits in the system

```
┌──────────────────────────────── UI layer ─────────────────────────────────┐
│                                                                           │
│  Settings screen               Today screen              Import review    │
│  ┌──────────────────┐          ┌────────────────┐        ┌─────────────┐  │
│  │ Export closet    │          │ Backup reminder│        │ Summary +   │  │
│  │ Import closet    │          │ banner (quiet) │        │ backup-first│  │
│  │ Last exported: … │          └───────┬────────┘        │ + confirm   │  │
│  └───┬──────────┬───┘                  │                 └──────┬──────┘  │
└──────┼──────────┼──────────────────────┼────────────────────────┼─────────┘
       │          │                      │                        │
       ▼          ▼                      ▼                        ▼
┌───────────────────────────── Backup module ───────────────────────────────┐
│                                                                           │
│   Export pipeline      Import pipeline      Change tracker   Reminder rule│
│   (snapshot →          (parse → validate →  (counts edits    (when to     │
│    encode → file)       migrate → summary → that matter)     nudge)       │
│                         replace)                                          │
│                                                                           │
│   ── pure, unit-testable ──────────────────────────────────────────────   │
│   File format + version · validators · migrations · import summary       │
└────────┬──────────────────────┬──────────────────────┬────────────────────┘
         │                      │                      │
         ▼                      ▼                      ▼
┌─────────────────┐   ┌───────────────────┐   ┌───────────────────────────┐
│  Data layer     │   │ Photo codec       │   │ Platform adapter          │
│  Dexie:         │   │ Blob ⇄ base64     │   │ share sheet (phones)      │
│  items, outfits,│   │ (async, outside   │   │ download link (desktop)   │
│  settings       │   │  transactions)    │   │ file picker (import)      │
└─────────────────┘   └───────────────────┘   └───────────────────────────┘
```

The backup module never touches the outfit picker, and the picker never touches the backup module. They share only the data layer. That keeps the feature self-contained: it could be built, tested and shipped before or after the Today screen.

---

## 3. What goes into the file

Not everything in the database belongs in a backup. The table below decides field by field:

| Data | In backup? | Reason |
|---|---|---|
| Items, all tags and the photo | **Yes** | This is the closet itself, the hours of work being protected. |
| `inHamper` | **Yes** | It's real state. After a restore, your dirty clothes are still dirty. |
| `skipDate` ("not today") | Yes, but harmless | It expires at midnight on its own. Leaving it out would need special-case code for no benefit. |
| Outfit ratings (👍/👎) | **Yes** | These are your taste. Losing them means suggestions you already rejected come back. |
| Comfort offset, last occasion, last color mode | **Yes** | Small preferences you'd otherwise have to set again. |
| Saved location | **Yes** | Weather works right away after a restore. If you've moved, the usual "use my location" refreshes it. |
| `lastBackupAt`, `changesSinceBackup` | **No** | This is information *about* backups. Restoring it would make the phone claim an old backup date as its own. |

---

## 4. Export pipeline

### 4.1 Stages

```
 user taps "Export closet"
          │
          ▼
 ┌─────────────────────┐   one read-only database transaction over all three
 │ 1. Snapshot         │   tables, so an edit made mid-export can't leave the
 │                     │   items and outfits out of step
 └─────────┬───────────┘
           │ items (with photo Blobs), outfits, settings, held in memory
           ▼
 ┌─────────────────────┐   ⚠ happens AFTER the transaction closes (see 4.2)
 │ 2. Encode photos    │   Blob → base64 data URL, one at a time
 └─────────┬───────────┘
           ▼
 ┌─────────────────────┐   envelope: app id, format version, exportedAt,
 │ 3. Assemble file    │   app version, counts; built in pieces, not as one
 │                     │   huge string (see 4.3)
 └─────────┬───────────┘
           ▼
 ┌─────────────────────┐   UI changes from "Preparing…" to a
 │ 4. Ready            │   "Save backup" button (see 4.4)
 └─────────┬───────────┘
           │ second tap
           ▼
 ┌─────────────────────┐   share sheet if available, else download link
 │ 5. Hand off         │
 └─────────┬───────────┘
           ▼
 ┌─────────────────────┐   record lastExportAt, reset the change counter,
 │ 6. Record           │   but only if the hand-off didn't fail or get cancelled
 └─────────────────────┘
```

### 4.2 The transaction trap
IndexedDB transactions **close automatically** as soon as the code waits on anything other than the database itself. Converting a photo to text is asynchronous browser work, not a database call. If photos were encoded inside the snapshot transaction, it would close partway through, and later reads would fail or read a different moment in time.

The rule for the whole module is to **finish all database work, then do the slow work.** Export reads everything and then encodes. Import (§5) does the reverse: it decodes everything first, then writes everything in one transaction.

### 4.3 Memory on a phone
For a 150-item closet, the photos take up about 15MB as files and about 20MB once converted to text. If the whole backup were built as one long string, peak memory could briefly reach 3–4 times the file size, which is risky in an iPhone app running from the home screen.

Instead, the file is built from an ordered list of pieces: the opening JSON, each item's JSON, commas, and the closing brackets. The browser joins them into one file without holding a second full copy in memory. Each photo is converted and added one at a time.

### 4.4 Share sheet timing and what "backed up" can mean
Two platform details shape the export UI:

- **Tap timing.** Safari only opens the share sheet if it's called within a short window after a tap. Encoding 150 photos takes longer than that window, so a single "Export" tap that then waits for encoding would fail on exactly the closets that need it most. The **two-step flow** fixes this:
  1. The first tap prepares the file.
  2. A second tap, on "Save backup", opens the share sheet straight away.
- **No delivery confirmation.** When the share sheet closes successfully, all the app knows is that the file was handed to *something*. It might have gone to Files, AirDrop, or a Messages thread you then abandoned. The download fallback gives no confirmation at all.

So the honest label is **"Last exported: 3 days ago"**, not "Last backup." The export screen also tells you to save to iCloud Drive or Google Drive, because a file saved only to the phone's local storage disappears with the phone, which is the exact problem this feature exists to solve.

```
saveFile(file):
    if browser can share files:
        try:   share(file)        → success: mark exported
        catch: user cancelled     → do nothing (not an error, not exported)
               anything else      → fall back to download
    else:
        download(file)            → mark exported (best guess; say so in the UI)
```

### 4.5 File naming
`closet-2026-10-21.closet.json`. The date makes several backups easy to tell apart in Files. The double extension keeps it recognizable as both "ours" and plain JSON. Its type is `application/json`, so every platform will accept it.

---

## 5. Import pipeline

Import is the riskier half, because it **writes**, and because the file is untrusted. It might be truncated, hand-edited, from a future version, or not ours at all.

### 5.1 Stages

```
 file picker
     │
     ▼
 ┌──────────────┐  reject before parsing if > 200MB (no plausible closet is
 │ 1. Read      │  that big; protects memory)
 └──────┬───────┘
        ▼
 ┌──────────────┐  not JSON / cut off               → "This file is incomplete
 │ 2. Parse     │                                      or damaged." STOP
 └──────┬───────┘
        ▼
 ┌──────────────┐  app ≠ "closet-builder"           → "Not a Closet backup." STOP
 │ 3. Envelope  │  version > current                → "Made by a newer version
 │    check     │                                      of the app." STOP
 └──────┬───────┘
        ▼
 ┌──────────────┐  apply migrations v(n) → v(n+1) in order,
 │ 4. Migrate   │  up to the current version
 └──────┬───────┘
        ▼
 ┌──────────────┐  each record checked against the current schema;
 │ 5. Validate  │  bad records collected, never silently fixed
 └──────┬───────┘
        ▼
 ┌──────────────┐  base64 → Blob; only jpeg/png/webp accepted;
 │ 6. Decode    │  a failed photo becomes "item without photo" + warning
 └──────┬───────┘
        ▼
 ┌──────────────┐  what's in the file vs what's on this phone
 │ 7. Summarize │  (pure function, no writes)
 └──────┬───────┘
        ▼
 ┌──────────────┐  "Backup from Oct 14: 42 items, 2 skipped as invalid.
 │ 8. Review    │   This will replace the 47 items on this phone."
 └──────┬───────┘
        │ user confirms
        ▼
 ┌──────────────┐  ONE read-write transaction over all tables.
 │ 9. Apply     │  Any failure (incl. storage full) → full rollback
 └──────────────┘
```

Stages 1–7 never write anything. You can cancel at the review screen and nothing will have happened.

### 5.2 Validation policy
How strict should validation be? If one item has a misspelled category, should that reject the whole file or just the item?

**Proposal: reject the record, not the file, and report every rejection.**

- A bad item is skipped and listed on the review screen by name.
- The import is refused completely only for problems with the file's outer wrapper (stages 2–3), or if **more than half** the records are invalid. Losing that many usually means the file is wrong, not just slightly damaged.

Unknown extra fields are ignored. That isn't for compatibility with newer versions, since those are already refused at stage 3. It's for robustness against hand-edited files.

### 5.3 Restore = Replace (Merge was cut)
Import has exactly one behavior: **the file replaces everything on the phone.**

```
            ┌──────────────────────────────┐
 file ───▶  │  ONE read-write transaction  │
            │   1. clear items, outfits    │
            │   2. write items, outfits    │
            │   3. settings ← file         │
            │      (minus backup metadata) │
            └──────────────┬───────────────┘
                           │
              success ─────┴───── any failure
                 │                    │
         closet = backup      closet = exactly as before
```

The clear and the writes happen **inside one transaction**. If the phone runs out of storage halfway through, the clear is undone as well, and you keep your old closet. This is the main reason for requirement 2 in §1.

**Why there's no Merge.** Merge was considered and cut. The real situation is a new or reset phone, and Replace covers it. Merge would have needed:
- an `updatedAt` timestamp on every record, to decide which version wins
- conflict rules for items changed in both places
- "tombstones" (a remembered list of deleted items), or else deleted items would come back

That's about a third of this feature's complexity for a case nobody has.

### 5.4 The cost of cutting Merge: the review screen must stop mistakes
Without Merge, **importing onto a phone that already has a closet throws that closet away**. For example, if you import a 2-week-old backup by mistake, the last 2 weeks are gone. So the review screen gets stricter whenever the phone isn't empty:

```
if phone has items:
    show "This will replace the 47 items on this phone with 42 from the backup"
    if phone has items NOT in the file, or newer edits than the file:
        warn "You'll lose 5 items added since this backup"   ← named, not just counted
    "Export current closet first" is ticked by default
    confirm button reads "Replace 47 items"   ← not a generic "OK"
else:
    one-tap "Restore 42 items"
```

The "lost items" check compares item IDs between the file and the phone. That's cheap and needs no timestamps.

### 5.5 Orphan ratings
An outfit rating points to item IDs. If the file has a rating for an outfit whose item was skipped as invalid, that rating is dropped. A stored dislike for an impossible combination is harmless, but it is clutter.

---

## 6. Change tracking and the reminder

### 6.1 What counts as a "change"
The reminder fires after "7 days *and* at least one change." So what counts as a change?

If every hamper toggle counted, the counter would never be zero. You touch the hamper almost daily, so the reminder would fire every week regardless. That teaches you to ignore it, which defeats it.

**Proposal:**

| Event | Counts? |
|---|---|
| Item added, deleted, or tags/photo edited | **Yes** |
| Outfit liked or disliked | **Yes**, because your taste is costly to rebuild |
| Comfort offset changed | Yes |
| Hamper in/out, Laundry done | No (temporary state) |
| "Not today", lock, shuffle | No (temporary state) |
| Last occasion / color mode remembered | No (side effects of normal use) |

**How it's implemented.** Dexie can run code automatically whenever a record is created, updated or deleted. Those hooks increment `changesSinceBackup`. For updates, the hook checks *which* fields changed and ignores changes that touch only `inHamper` or `skipDate`. This keeps the rule in one place, instead of every screen having to remember to bump a counter.

### 6.2 Reminder rule

```
showReminder =
     changesSinceBackup > 0
 AND ( never exported AND itemCount ≥ 10        ← first backup, once there's
                                                   something worth losing
       OR daysSince(lastExportAt) ≥ 7 )
 AND not snoozed
```

**How the reminder behaves:**
- **Placement:** one quiet line on the Today screen, below the outfit. It never blocks the outfit.
- **Dismissing:** snoozes it for 3 days.
- **Tapping:** goes straight to the export screen.

The "≥ 10 items" condition prevents nagging during the first-run flow, before the closet holds anything worth backing up.

---

## 7. File format, version 1

```
{
  "app":        "closet-builder",
  "format":     1,                      ← backup-format version (drives migrations)
  "appVersion": "0.1.0",                ← informational only
  "exportedAt": "2026-10-21T08:00:00Z",
  "counts":     { "items": 42, "outfits": 17 },   ← quick check for a cut-off file
  "settings":   { comfortOffset, lastOccasion, lastColorMode, location? },
  "items":      [ { id, name, category, …, inHamper,
                    photo: "data:image/jpeg;base64,…" | null } ],
  "outfits":    [ { key, itemIds, rating } ]
}
```

**Two version numbers.**
- `format` changes only when the shape of the *file* changes.
- `appVersion` changes with every release.

Tying migrations to app releases would create needless migration steps.

**The `counts` field.** It catches a file that was cut off but still happens to be valid JSON. A file that ends exactly after an item and its closing brackets parses fine, but its counts won't match.

**Migrations** are a simple ordered chain. Each step is a small function that takes a file in format *n* and returns format *n+1*. Each one is tested on its own with a stored sample file of the older format.

---

## 8. Module layout

```
src/backup/
  format        file types, current format number, envelope check
  migrations    the ordered migration chain
  validate      per-record checks against the current schema
  summary       file vs phone → counts, skipped records, items you'd lose (pure)
  photoCodec    Blob ⇄ data URL
  exporter      snapshot → encode → assemble
  importer      read → … → apply (calls the pure parts above)
  share         share sheet / download / file picker
  tracking      Dexie hooks + change rules
  reminder      showReminder rule (pure)
src/views/
  BackupSettings, ImportReview, BackupReminder
```

**Most of the logic is pure functions:** `format`, `migrations`, `validate`, `summary` and `reminder` take plain data and return plain data. They can be tested exhaustively with no browser. The parts that touch the browser or database (`exporter`, `importer`, `share`, `tracking`) are kept thin.

---

## 9. Changes this requires in DESIGN.md

1. **Remove Merge from Flow E.** Restore always replaces the closet on the phone (§5.3), with the safeguards in §5.4.
2. **Rename the label** from "Last backup" to **"Last exported"** (§4.4).
3. **Rename the settings fields:** `lastBackupAt` → `lastExportAt`, and add `reminderSnoozedUntil`.
4. **Ask for persistent storage.** On first launch, call `navigator.storage.persist()`. This asks the browser not to evict the app's data under storage pressure. It costs nothing and complements both installing the app and exporting backups.

---

## 10. Testing strategy

**Automated tests (Vitest, with fake-indexeddb standing in for the browser database)**
- **Round trip:** seed the database, export, wipe it, import with Replace, and confirm the result is identical down to the bytes of each photo.
- **Atomicity:** simulate a storage-full error partway through Replace, and confirm the original closet is untouched.
- **Rejections:** a cut-off file, wrong `app`, a future `format`, and a mismatch between `counts` and the real lengths. Each must give the right message and write nothing.
- **Partial validity:** 1 bad item out of 40 imports 39 and reports 1. 25 bad items out of 40 refuses the file.
- **Overwrite safeguards:** importing onto a non-empty phone names the items that would be lost and ticks "Export current closet first" by default. Importing onto an empty phone is one tap. Orphan ratings are dropped.
- **Tracking:** a hamper toggle or "not today" doesn't count, and a tag edit does.
- **Reminder:** a table of cases for the rule in §6.2.
- **Migrations:** one stored sample file for each past format, migrated forward and validated.

**Manual tests, on a real iPhone with the app installed to the home screen (this can't be automated)**
- Export a closet of about 150 items to iCloud Drive and confirm the share sheet appears on the second tap.
- Delete the app, reinstall it, import with Replace, and spot-check photos.
- Cancel the share sheet and confirm "Last exported" doesn't change.
- Import with the Files picker while the app runs from the home screen.
- Repeat export and import on Android Chrome and desktop Safari/Chrome (download fallback).

---

## 11. Open questions for you

1. ~~Is Merge needed in v1?~~ **Decided: no.** See §5.3.
2. **Should the file be encrypted?** It holds photos of everything you own and sits in cloud storage. A password would protect it, but a forgotten password makes the backup useless. My lean is no for v1.
3. **When should the format change?** A single JSON file with embedded photos is right up to a few hundred items. Above roughly 300–400 items (about 50MB), a zip with separate image files would be cheaper on memory. Should that limit be written down now, so it isn't discovered on a phone that crashes?

**Rough effort:** about 2 focused days.
- About 1 day for the pure parts and their tests.
- About half a day for export, import and the screens.
- About half a day for manual testing on real phones.
