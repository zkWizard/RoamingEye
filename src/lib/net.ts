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

// --- Response payload validation ---------------------------------------------
//
// GIBS WMS answers malformed requests with a ServiceExceptionReport XML body
// under HTTP 200 (the WMS 1.3.0 default), and captive portals/proxies serve
// HTML "200 OK" pages. Left unchecked, those bodies fail far downstream —
// opaque JSON parse errors, or garbage decoded into a globe texture. The
// checks below name the problem at the fetch boundary instead.

/** What a caller expects the response body to be. */
export type ExpectedPayload = "json" | "image";

/**
 * Whether a content-type could plausibly be the expected payload. Deliberately
 * permissive — static hosts disagree on the type for .json/.geojson files
 * (text/plain, application/octet-stream, and a missing header all occur in
 * the wild), so only types that can *never* be the payload are rejected:
 * HTML error pages for both, XML for both (WMS exceptions), JSON for imagery.
 */
export function isAcceptableContentType(
  contentType: string | null,
  expected: ExpectedPayload
): boolean {
  if (!contentType) return true; // some CDNs strip it; let the parser decide
  const ct = contentType.toLowerCase();
  if (ct.includes("html") || ct.includes("xml")) return false;
  if (expected === "image" && ct.includes("json")) return false;
  return true;
}

/**
 * Pull the human-readable message out of a WMS ServiceExceptionReport — it
 * names the actual mistake (bad TIME, unknown layer, over-zoomed level),
 * which is gold when debugging a data-layer configuration.
 */
export function extractServiceException(xml: string): string | null {
  // `(?:\s[^>]*)?` keeps <ServiceExceptionReport> from matching as an
  // attribute-less <ServiceException>.
  const match = xml.match(
    /<ServiceException(?:\s[^>]*)?>([\s\S]*?)<\/ServiceException>/i
  );
  const text = match?.[1].trim();
  return text ? text.slice(0, 300) : null;
}

/**
 * A response whose body cannot be the requested payload. Definitive — the
 * server answered, just not with data — so it is thrown after the retry loop
 * completes and never consumes retry attempts (retrying can't fix a
 * ServiceException).
 */
export class ResponseTypeError extends Error {
  constructor(
    url: string,
    readonly contentType: string | null,
    detail?: string
  ) {
    super(
      `Unexpected content-type "${contentType ?? "(none)"}" for ${url}` +
        (detail ? ` — ${detail}` : "")
    );
    this.name = "ResponseTypeError";
  }
}

/** Throw a named error if the response body can't be the expected payload. */
async function assertPayloadType(
  res: Response,
  url: string,
  expected: ExpectedPayload
): Promise<void> {
  const contentType = res.headers.get("content-type");
  if (isAcceptableContentType(contentType, expected)) return;
  let detail: string | undefined;
  if (contentType?.toLowerCase().includes("xml")) {
    try {
      detail = extractServiceException(await res.text()) ?? undefined;
    } catch {
      // Body unreadable — the content-type alone still names the problem.
    }
  }
  throw new ResponseTypeError(url, contentType, detail);
}

// --- Connectivity ---------------------------------------------------------------

/**
 * Thrown instead of attempting a request while the browser reports offline —
 * failing in <1 ms rather than burning the full timeout + backoff budget on
 * a request that cannot succeed. main.ts owns the user-facing banner and the
 * automatic refresh when connectivity returns.
 */
export class OfflineError extends Error {
  constructor(url: string) {
    super(`Offline — not attempting ${url}`);
    this.name = "OfflineError";
  }
}

/**
 * Browser connectivity as reported by the UA. `navigator.onLine === false`
 * is trustworthy ("definitely offline"); `true` merely means "not known to
 * be offline", so requests still carry their own timeouts. Outside a browser
 * (unit tests, tooling) this reads as online.
 */
export function isOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

// --- HTTP status classification -------------------------------------------------
//
// Not every failure deserves a retry. A 404 for a month with no published
// composite is a *normal answer* (the probe asks ~550 of them per chart) —
// retrying it doubles our load on NASA GIBS for nothing. Conversely a 429
// tells us exactly when to come back; ignoring Retry-After and hammering on
// our own schedule is the opposite of API citizenship (RFC 9110 §10.2.3).

/** A non-OK HTTP response, carrying the status so callers can branch. */
export class HttpError extends Error {
  constructor(
    url: string,
    readonly status: number,
    /** Server-requested wait before retrying, already capped. */
    readonly retryAfterMs?: number
  ) {
    super(`HTTP ${status} for ${url}`);
    this.name = "HttpError";
  }
}

/** Statuses a retry cannot fix — the server understood and said no. */
const DEFINITIVE_STATUSES = new Set([400, 401, 403, 404, 405, 410, 414, 422]);

export function isDefinitiveStatus(status: number): boolean {
  return DEFINITIVE_STATUSES.has(status);
}

/** Ceiling on server-requested waits — a hostile or clock-skewed
 * Retry-After must never hang the app. */
export const RETRY_AFTER_CAP_MS = 30_000;

/**
 * Parse a Retry-After header (delta-seconds or HTTP-date) into a capped
 * delay in ms; null when absent or malformed. Injectable clock for tests.
 */
export function parseRetryAfter(
  header: string | null,
  capMs = RETRY_AFTER_CAP_MS,
  now: () => number = () => Date.now()
): number | null {
  const trimmed = header?.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) return Math.min(Number(trimmed) * 1000, capMs);
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return null;
  return Math.min(Math.max(0, date - now()), capMs);
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
    if (!res.ok) {
      throw new HttpError(
        url,
        res.status,
        parseRetryAfter(res.headers.get("retry-after")) ?? undefined
      );
    }
    return res;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

/**
 * Fetch with a timeout and bounded exponential-backoff retries. Definitive
 * HTTP failures (4xx that a retry can't fix) throw immediately without
 * consuming the retry budget; a Retry-After header (429, 503) overrides our
 * backoff for that wait, capped at RETRY_AFTER_CAP_MS.
 */
export async function fetchWithRetry(
  url: string,
  options: FetchOptions = {}
): Promise<Response> {
  const { retries = 2, timeoutMs = 15000, backoffMs = 400, signal } = options;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    // Checked per attempt: connectivity can drop between backoff waits.
    if (!isOnline()) throw new OfflineError(url);
    try {
      return await fetchWithTimeout(url, timeoutMs, signal);
    } catch (err) {
      lastError = err;
      if (signal?.aborted || isAbortError(err)) throw err;
      if (err instanceof HttpError && isDefinitiveStatus(err.status)) {
        throw err;
      }
      if (attempt < retries) {
        const wait =
          err instanceof HttpError && err.retryAfterMs !== undefined
            ? err.retryAfterMs
            : backoffDelay(attempt, backoffMs);
        await delay(wait);
      }
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
  await assertPayloadType(res, url, "json");
  return (await res.json()) as T;
}

/** Fetch a binary blob with retries (used for imagery with coverage checks). */
export async function fetchBlob(
  url: string,
  options: FetchOptions = {}
): Promise<Blob> {
  const res = await fetchWithRetry(url, options);
  await assertPayloadType(res, url, "image");
  return res.blob();
}
