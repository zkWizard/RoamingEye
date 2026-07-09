import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeLru, makeGate, buildSearchUrl } from "./geocoding";

describe("buildSearchUrl", () => {
  it("targets Nominatim and requests boundary polygons", () => {
    const url = buildSearchUrl("Toledo, Spain");
    expect(url).toContain("nominatim.openstreetmap.org/search");
    expect(url).toContain("polygon_geojson=1");
    expect(url).toContain("format=jsonv2");
  });

  it("encodes the query and applies the limit", () => {
    const url = buildSearchUrl("São Paulo", 3);
    expect(url).toContain("q=S%C3%A3o+Paulo");
    expect(url).toContain("limit=3");
  });
});

describe("makeLru", () => {
  it("hits, misses, and evicts the least recently used", () => {
    const lru = makeLru<string, number>(2);
    lru.set("a", 1);
    lru.set("b", 2);
    expect(lru.get("a")).toBe(1); // refresh a
    lru.set("c", 3); // evicts b (LRU)
    expect(lru.get("b")).toBeUndefined();
    expect(lru.get("a")).toBe(1);
    expect(lru.get("c")).toBe(3);
    expect(lru.size).toBe(2);
  });

  it("re-setting a key refreshes recency without growing", () => {
    const lru = makeLru<string, number>(2);
    lru.set("a", 1);
    lru.set("b", 2);
    lru.set("a", 10); // refresh + overwrite
    lru.set("c", 3); // evicts b, not a
    expect(lru.get("a")).toBe(10);
    expect(lru.get("b")).toBeUndefined();
  });
});

describe("makeGate (Nominatim 1 req/s policy)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const isAbort = (err: unknown): boolean =>
    err instanceof DOMException && err.name === "AbortError";

  it("passes the first call immediately", async () => {
    const gate = makeGate(1000, () => Date.now());
    await expect(gate()).resolves.toBeUndefined();
  });

  it("spaces consecutive passes by the minimum interval", async () => {
    const gate = makeGate(1000, () => Date.now());
    await gate();
    let passed = false;
    const second = gate().then(() => {
      passed = true;
    });
    await vi.advanceTimersByTimeAsync(999);
    expect(passed).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await second;
    expect(passed).toBe(true);
  });

  it("a burst collapses to the latest call; earlier waiters abort", async () => {
    const gate = makeGate(1000, () => Date.now());
    await gate(); // pass 1 — network hit
    const outcomes: string[] = [];
    // Three queued calls in quick succession (a user typing through the
    // debounce): only the last may reach the network.
    for (const label of ["stale-1", "stale-2", "latest"]) {
      void gate().then(
        () => outcomes.push(`${label}:passed`),
        (err: unknown) =>
          outcomes.push(isAbort(err) ? `${label}:aborted` : `${label}:failed`)
      );
    }
    await vi.advanceTimersByTimeAsync(1000);
    expect(outcomes.sort()).toEqual([
      "latest:passed",
      "stale-1:aborted",
      "stale-2:aborted",
    ]);
  });

  it("after the interval elapses, calls pass without waiting", async () => {
    const gate = makeGate(1000, () => Date.now());
    await gate();
    await vi.advanceTimersByTimeAsync(1500);
    let passed = false;
    void gate().then(() => {
      passed = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(passed).toBe(true);
  });
});
