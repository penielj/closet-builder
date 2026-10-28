# Closet Builder

A phone web app that suggests a daily outfit using only clothes you own that are clean today. Everything stays on the device: no account, no server.

**Live:** https://penielj.github.io/closet-builder/ (open it in Safari on an iPhone, then Share → Add to Home Screen)

**Status:** all 3 build steps are done. You can catalog items with photos, auto color detection and tags, use the hamper, get a daily outfit picked for the weather and occasion, and back the closet up to one file and restore it. What's left is the manual phone test in [DESIGN.md](DESIGN.md) §10.

## Docs
- [DESIGN.md](DESIGN.md): the spec (flows, outfit rules, data model, stack)
- [spikes/RESULTS.md](spikes/RESULTS.md): results of the experiments run before building

## Develop
```sh
npm install
npm run dev      # http://localhost:5173/closet-builder/
npm test         # Vitest, with fake-indexeddb standing in for the browser database
npm run build
```

## How it's built
- **Vite + React + TypeScript**, installable to the home screen. Data lives in **IndexedDB through Dexie**, with photos stored as Blobs.
- **One write path.** Every change goes through [src/db/repo.ts](src/db/repo.ts). Meaningful edits count toward the backup reminder in the same transaction as the write. Temporary state, like the hamper, doesn't count.
- **Photos** are resized on the device to 800px JPEG through a canvas. That also strips EXIF data, including GPS location ([src/photo/resize.ts](src/photo/resize.ts)).
- **Outfit picker** is a pure function ([src/closet/picker.ts](src/closet/picker.ts)) with a unit test per rule. [src/closet/daily.ts](src/closet/daily.ts) decides when today's saved outfit is kept and when it's re-picked.
- **Weather** comes from Open-Meteo, free and with no key ([src/weather/openMeteo.ts](src/weather/openMeteo.ts)).
- **Offline:** a small service worker ([src/sw.js](src/sw.js)) caches the built app. The file list is filled in at build time by a plugin in [vite.config.ts](vite.config.ts).
- **Backup** is one `.closet.json` file with the photos embedded as base64, built a photo at a time and checked with zod before an all-or-nothing import ([src/backup/file.ts](src/backup/file.ts)). Saving uses the share sheet ([src/backup/save.ts](src/backup/save.ts)).
- **Auto color** samples the center of the photo and snaps it to the 18-color palette ([src/photo/color.ts](src/photo/color.ts)).
- **Deploy:** pushing to `main` runs the tests and publishes to GitHub Pages ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)).
