# Closet Builder

A phone web app that suggests a daily outfit using only clothes you own that are clean today. Everything stays on the device: no account, no server.

**Live:** `https://<user>.github.io/closet-builder/` (open it in Safari on an iPhone, then Share → Add to Home Screen)

**Status:** build step 1 of 3, the skeleton. You can catalog items with photos, auto color detection and tags, and use the hamper. Backup and restore come next, then the outfit picker. See [DESIGN.md](DESIGN.md) §7, "Build order".

## Docs
- [DESIGN.md](DESIGN.md): the spec (product, rules, data model, stack)
- [BACKUP-IMPLEMENTATION.md](BACKUP-IMPLEMENTATION.md): build plan for backup and restore
- [BACKUP-PROPOSAL.md](BACKUP-PROPOSAL.md): the first draft that plan revised
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
- **Auto color** samples the center of the photo and snaps it to the 18-color palette ([src/photo/color.ts](src/photo/color.ts)).
- **Deploy:** pushing to `main` runs the tests and publishes to GitHub Pages ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)).
