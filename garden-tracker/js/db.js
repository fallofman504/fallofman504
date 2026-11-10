// Tiny IndexedDB wrapper. Everything lives on the phone — no server needed.
const DB_NAME = 'garden-tracker';
const DB_VERSION = 1;
let dbPromise;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('days')) db.createObjectStore('days', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('photos')) {
        const s = db.createObjectStore('photos', { keyPath: 'id' });
        s.createIndex('dayId', 'dayId');
      }
      if (!db.objectStoreNames.contains('weeks')) db.createObjectStore('weeks', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let result;
    Promise.resolve(fn(s)).then((r) => { result = r; });
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

const wrap = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

export const db = {
  get: (store, id) => tx(store, 'readonly', (s) => wrap(s.get(id))),
  put: (store, value) => tx(store, 'readwrite', (s) => { s.put(value); }),
  del: (store, id) => tx(store, 'readwrite', (s) => { s.delete(id); }),
  all: (store) => tx(store, 'readonly', (s) => wrap(s.getAll())),
  photosForDay: (dayId) => tx('photos', 'readonly', (s) => wrap(s.index('dayId').getAll(dayId))),
  async deletePhotosForDay(dayId) {
    const photos = await this.photosForDay(dayId);
    await tx('photos', 'readwrite', (s) => { photos.forEach((p) => s.delete(p.id)); });
  },
};

// Ask the browser not to evict our data when storage gets tight.
export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) await navigator.storage.persist();
  } catch { /* not supported */ }
}
