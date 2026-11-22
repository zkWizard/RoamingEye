import type { WindHeader } from "./field";

const DB_NAME = "roamingeye-wind";
const STORE = "field";
const KEY = "latest";
/** Reuse a downloaded field for three hours so a refresh does not fetch it again. */
export const WIND_CACHE_MS = 3 * 60 * 60 * 1000;

export interface CachedWind {
  savedAt: number;
  header: WindHeader;
  buffer: ArrayBuffer;
}

function copyBytes(raw: unknown): ArrayBuffer | null {
  if (raw instanceof ArrayBuffer) return raw;
  if (raw instanceof Uint8Array) {
    const copy = new ArrayBuffer(raw.byteLength);
    new Uint8Array(copy).set(raw);
    return copy;
  }
  return null;
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

export async function readWindCache(
  now = Date.now()
): Promise<CachedWind | null> {
  const db = await openDb();
  if (!db) return null;
  try {
    const hit = await new Promise<CachedWind | null>((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).get(KEY);
      request.onsuccess = () => {
        const value = request.result as CachedWind | undefined;
        if (!value || typeof value.savedAt !== "number") {
          resolve(null);
          return;
        }
        if (now - value.savedAt > WIND_CACHE_MS) {
          resolve(null);
          return;
        }
        const buffer = copyBytes(value.buffer);
        resolve(
          buffer
            ? { savedAt: value.savedAt, header: value.header, buffer }
            : null
        );
      };
      request.onerror = () => resolve(null);
    });
    db.close();
    return hit;
  } catch {
    db.close();
    return null;
  }
}

export async function writeWindCache(entry: CachedWind): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(entry, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
  db.close();
}
