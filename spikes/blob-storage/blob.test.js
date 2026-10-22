// Spike 0.1 (BACKUP-IMPLEMENTATION.md step 0): can Dexie + fake-indexeddb under
// Vitest's Node environment store a photo Blob and give back the same bytes?
// Also checks the ID rules from §3.8 item 7, which the restore design relies on.
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, it, expect } from 'vitest';

const randomBytes = (n) => {
  const b = new Uint8Array(n);
  for (let i = 0; i < n; i++) b[i] = (i * 31 + 7) & 0xff;
  b.set([0xff, 0xd8, 0xff], 0); // JPEG magic bytes
  return b;
};

const openDb = (name) => {
  const db = new Dexie(name);
  db.version(1).stores({ items: '++id, category, createdAt' });
  return db;
};

describe('Blob storage under fake-indexeddb', () => {
  it('round-trips a 100KB photo Blob byte-for-byte, keeping its type', async () => {
    const db = openDb('blob-roundtrip');
    const bytes = randomBytes(100_000);
    const id = await db.items.add({ name: 'Navy chinos', photo: new Blob([bytes], { type: 'image/jpeg' }) });

    const item = await db.items.get(id);
    expect(item.photo).toBeInstanceOf(Blob);
    expect(item.photo.type).toBe('image/jpeg');
    expect(item.photo.size).toBe(bytes.length);
    expect(new Uint8Array(await item.photo.arrayBuffer())).toEqual(bytes);
  });

  it('round-trips Blobs written inside a rw transaction with bulkAdd', async () => {
    const db = openDb('blob-bulk');
    const photos = [1_000, 50_000, 120_000].map(randomBytes);
    await db.transaction('rw', db.items, () =>
      db.items.bulkAdd(photos.map((p, i) => ({ id: i + 1, photo: new Blob([p], { type: 'image/jpeg' }) }))));

    for (let i = 0; i < photos.length; i++) {
      const item = await db.items.get(i + 1);
      expect(new Uint8Array(await item.photo.arrayBuffer())).toEqual(photos[i]);
    }
  });
});

describe('ID rules the restore depends on (§3.8 item 7)', () => {
  it('keeps explicit IDs on bulkAdd, and new items get an ID above the highest one', async () => {
    const db = openDb('ids-explicit');
    await db.items.bulkAdd([{ id: 3 }, { id: 17 }, { id: 42 }]);
    expect((await db.items.toArray()).map((i) => i.id)).toEqual([3, 17, 42]);
    expect(await db.items.add({ name: 'new' })).toBe(43);
  });

  it('clear() does not reset the key generator, so restored IDs are never reused', async () => {
    const db = openDb('ids-clear');
    for (let i = 0; i < 60; i++) await db.items.add({}); // old phone went up to 60
    await db.transaction('rw', db.items, async () => {
      await db.items.clear();
      await db.items.bulkAdd([{ id: 5 }, { id: 30 }]); // restored file only goes to 30
    });
    expect(await db.items.add({})).toBe(61);
  });
});
