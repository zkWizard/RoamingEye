import { describe, expect, it } from "vitest";
import {
  CELESTRAK_TTL_MS,
  cacheFresh,
  loadGroup,
  type CachedGroup,
  type GroupStore,
} from "./cache";
import type { GpRecord } from "./elements";

function memoryStore(
  seed?: CachedGroup
): GroupStore & { saved: CachedGroup | null } {
  const saved = { current: seed ?? null };
  return {
    get saved() {
      return saved.current;
    },
    read: async () => saved.current,
    write: async (_group, entry) => {
      saved.current = entry;
    },
  };
}

const RECORD = { NORAD_CAT_ID: 25544 } as GpRecord;

describe("cacheFresh", () => {
  it("is fresh inside two hours and stale at the boundary", () => {
    expect(cacheFresh(1_000, 1_000 + CELESTRAK_TTL_MS - 1)).toBe(true);
    expect(cacheFresh(1_000, 1_000 + CELESTRAK_TTL_MS)).toBe(false);
    expect(cacheFresh(5_000, 1_000)).toBe(false);
  });
});

describe("loadGroup", () => {
  it("does not fetch again inside two hours", async () => {
    let fetches = 0;
    const store = memoryStore({ fetchedAt: 1_000, records: [RECORD] });
    const records = await loadGroup("stations", {
      now: () => 1_000 + 60_000,
      store,
      fetchRecords: async () => {
        fetches += 1;
        return [];
      },
      inflight: new Map(),
    });
    expect(records).toEqual([RECORD]);
    expect(fetches).toBe(0);
  });

  it("fetches once when the copy is older than two hours", async () => {
    let fetches = 0;
    const store = memoryStore({ fetchedAt: 0, records: [RECORD] });
    const fresh = { ...RECORD, NORAD_CAT_ID: 1 } as GpRecord;
    const records = await loadGroup("stations", {
      now: () => CELESTRAK_TTL_MS,
      store,
      fetchRecords: async () => {
        fetches += 1;
        return [fresh];
      },
      inflight: new Map(),
    });
    expect(fetches).toBe(1);
    expect(records).toEqual([fresh]);
    expect(store.saved?.records).toEqual([fresh]);
  });

  it("shares one fetch between concurrent callers", async () => {
    let fetches = 0;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const store = memoryStore();
    const inflight = new Map();
    const deps = {
      now: () => 10,
      store,
      fetchRecords: async () => {
        fetches += 1;
        await gate;
        return [RECORD];
      },
      inflight,
    };
    const first = loadGroup("starlink", deps);
    const second = loadGroup("starlink", deps);
    release();
    const [a, b] = await Promise.all([first, second]);
    expect(fetches).toBe(1);
    expect(a).toBe(b);
  });

  it("does not cache a failed fetch", async () => {
    const store = memoryStore();
    const inflight = new Map();
    await expect(
      loadGroup("stations", {
        now: () => 10,
        store,
        fetchRecords: async () => {
          throw new Error("offline");
        },
        inflight,
      })
    ).rejects.toThrow("offline");
    expect(store.saved).toBeNull();
    expect(inflight.size).toBe(0);
  });
});
