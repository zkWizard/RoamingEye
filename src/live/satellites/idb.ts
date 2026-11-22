import type { CachedGroup, GroupStore } from "./cache";

const DB_NAME = "roamingeye-celestrak";
const STORE = "groups";

function memoryStore(): GroupStore {
  const map = new Map<string, CachedGroup>();
  return {
    read: async (group) => map.get(group) ?? null,
    write: async (group, entry) => {
      map.set(group, entry);
    },
  };
}

/**
 * IndexedDB holds each group's elements for the two-hour CelesTrak window,
 * including across a reload. Starlink's JSON is several megabytes, past what
 * sessionStorage can be relied on to keep. If IndexedDB is missing or
 * refuses the open, the page keeps the elements in memory for this visit.
 */
export function openGroupStore(): Promise<GroupStore> {
  if (typeof indexedDB === "undefined") return Promise.resolve(memoryStore());
  return new Promise((resolve) => {
    let settled = false;
    const finish = (store: GroupStore) => {
      if (settled) return;
      settled = true;
      resolve(store);
    };
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, 1);
    } catch {
      finish(memoryStore());
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onerror = () => finish(memoryStore());
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      finish({
        read(group) {
          return new Promise((done) => {
            try {
              const tx = db.transaction(STORE, "readonly");
              const get = tx.objectStore(STORE).get(group);
              get.onsuccess = () =>
                done((get.result as CachedGroup | undefined) ?? null);
              get.onerror = () => done(null);
            } catch {
              done(null);
            }
          });
        },
        write(group, entry) {
          return new Promise((done, reject) => {
            try {
              const tx = db.transaction(STORE, "readwrite");
              tx.objectStore(STORE).put(entry, group);
              tx.oncomplete = () => done();
              tx.onerror = () =>
                reject(tx.error ?? new Error("cache write failed"));
              tx.onabort = () =>
                reject(tx.error ?? new Error("cache write aborted"));
            } catch (err) {
              reject(err);
            }
          });
        },
      });
    };
  });
}
