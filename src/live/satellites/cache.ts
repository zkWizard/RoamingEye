import type { GpRecord } from "./elements";

/** CelesTrak asks callers not to fetch a group more than once per two hours. */
export const CELESTRAK_TTL_MS = 2 * 60 * 60 * 1000;

export interface CachedGroup {
  fetchedAt: number;
  records: GpRecord[];
}

export interface GroupStore {
  read(group: string): Promise<CachedGroup | null>;
  write(group: string, entry: CachedGroup): Promise<void>;
}

export function cacheFresh(
  fetchedAt: number,
  now: number,
  ttl = CELESTRAK_TTL_MS
): boolean {
  return (
    Number.isFinite(fetchedAt) && now >= fetchedAt && now - fetchedAt < ttl
  );
}

export interface LoadGroupDeps {
  now: () => number;
  store: GroupStore;
  fetchRecords: (group: string) => Promise<GpRecord[]>;
  /** Tests pass their own map. The page shares one, so two toggles do not double-fetch. */
  inflight?: Map<string, Promise<GpRecord[]>>;
}

const pageInflight = new Map<string, Promise<GpRecord[]>>();

/**
 * Return a group's elements, fetching only when the cached copy is missing
 * or older than two hours. Concurrent callers share the in-flight request.
 * A failed fetch is not cached, so the next toggle can try again. A
 * successful fetch is not repeated inside the window, including after a reload
 * when the store is IndexedDB.
 */
export function loadGroup(
  group: string,
  deps: LoadGroupDeps
): Promise<GpRecord[]> {
  const flights = deps.inflight ?? pageInflight;
  const existing = flights.get(group);
  if (existing) return existing;
  const job = loadOnce(group, deps).finally(() => {
    if (flights.get(group) === job) flights.delete(group);
  });
  flights.set(group, job);
  return job;
}

async function loadOnce(
  group: string,
  deps: LoadGroupDeps
): Promise<GpRecord[]> {
  const cached = await deps.store.read(group);
  const now = deps.now();
  if (cached && cacheFresh(cached.fetchedAt, now)) return cached.records;
  const records = await deps.fetchRecords(group);
  try {
    await deps.store.write(group, { fetchedAt: deps.now(), records });
  } catch {
    // A full disk or a private-mode quota miss still leaves the page with
    // the elements. The next load will try the network again.
  }
  return records;
}
