/**
 * Resilient networking primitives. Open-data endpoints (NASA GIBS, OpenStreetMap
 * Nominatim) are occasionally slow or flaky, and a research tool must degrade
 * gracefully rather than break. Every JSON/data request routes through here for
 * timeouts, bounded exponential-backoff retries, and abort support.
 */

export interface FetchOptions {
  /** Number of retries after the first attempt (default 2). */
  retries?: number;
  /** Per-attempt timeout in ms (default 15000). */
  timeoutMs?: number;
  /** Base backoff in ms; grows exponentially per attempt (default 400). */
  backoffMs?: number;
  /** Caller's abort signal — cancels retries immediately. */
  signal?: AbortSignal;
}

/** Exponential backoff for a given attempt (pure — unit-tested). */
export function backoffDelay(attempt: number, baseMs: number): number {
  return baseMs * 2 ** attempt;
}

/** Whether an error is an abort (so we stop retrying). */
export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<Response> {
  const controller = new AbortController();
  const abort = (): void => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", abort);
  }
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

/** Fetch with a timeout and bounded exponential-backoff retries. */
export async function fetchWithRetry(
  url: string,
  options: FetchOptions = {}
): Promise<Response> {
  const { retries = 2, timeoutMs = 15000, backoffMs = 400, signal } = options;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetchWithTimeout(url, timeoutMs, signal);
    } catch (err) {
      lastError = err;
      if (signal?.aborted || isAbortError(err)) throw err;
      if (attempt < retries) await delay(backoffDelay(attempt, backoffMs));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/** Fetch and parse JSON with retries. */
export async function fetchJson<T>(
  url: string,
  options: FetchOptions = {}
): Promise<T> {
  const res = await fetchWithRetry(url, options);
  return (await res.json()) as T;
}

/** Fetch a binary blob with retries (used for imagery with coverage checks). */
export async function fetchBlob(
  url: string,
  options: FetchOptions = {}
): Promise<Blob> {
  const res = await fetchWithRetry(url, options);
  return res.blob();
}
