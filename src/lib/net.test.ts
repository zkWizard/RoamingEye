import { describe, it, expect, afterEach, vi } from "vitest";
import {
  backoffDelay,
  extractServiceException,
  fetchBlob,
  fetchJson,
  fetchWithRetry,
  HttpError,
  isAbortError,
  isAcceptableContentType,
  isDefinitiveStatus,
  isOnline,
  OfflineError,
  parseRetryAfter,
  ResponseTypeError,
  RETRY_AFTER_CAP_MS,
} from "./net";

describe("backoffDelay", () => {
  it("grows exponentially from the base", () => {
    expect(backoffDelay(0, 400)).toBe(400);
    expect(backoffDelay(1, 400)).toBe(800);
    expect(backoffDelay(2, 400)).toBe(1600);
  });
});

describe("isAbortError", () => {
  it("recognises an AbortError DOMException", () => {
    expect(isAbortError(new DOMException("aborted", "AbortError"))).toBe(true);
  });

  it("ignores other errors", () => {
    expect(isAbortError(new Error("nope"))).toBe(false);
    expect(isAbortError("nope")).toBe(false);
  });
});

describe("isAcceptableContentType", () => {
  it("accepts JSON-family types for json payloads", () => {
    expect(isAcceptableContentType("application/json", "json")).toBe(true);
    expect(
      isAcceptableContentType("application/geo+json; charset=utf-8", "json")
    ).toBe(true);
  });

  it("tolerates lax static-host types and a missing header", () => {
    // Static hosts disagree on .json/.geojson types; only impossible
    // payloads are rejected.
    expect(isAcceptableContentType("text/plain", "json")).toBe(true);
    expect(isAcceptableContentType("application/octet-stream", "json")).toBe(
      true
    );
    expect(isAcceptableContentType(null, "json")).toBe(true);
    expect(isAcceptableContentType(null, "image")).toBe(true);
  });

  it("rejects HTML and XML for both payload kinds", () => {
    expect(isAcceptableContentType("text/html; charset=utf-8", "json")).toBe(
      false
    );
    expect(isAcceptableContentType("text/html", "image")).toBe(false);
    expect(isAcceptableContentType("text/xml", "json")).toBe(false);
    expect(isAcceptableContentType("application/vnd.ogc.se_xml", "image")).toBe(
      false
    );
  });

  it("accepts imagery types and rejects JSON for image payloads", () => {
    expect(isAcceptableContentType("image/jpeg", "image")).toBe(true);
    expect(isAcceptableContentType("image/png", "image")).toBe(true);
    expect(isAcceptableContentType("application/json", "image")).toBe(false);
  });
});

describe("extractServiceException", () => {
  it("pulls the message out of a WMS ServiceExceptionReport", () => {
    const xml =
      `<?xml version="1.0"?><ServiceExceptionReport>` +
      `<ServiceException code="InvalidDimensionValue">\n  TIME 2026-13-01 is invalid.\n</ServiceException>` +
      `</ServiceExceptionReport>`;
    expect(extractServiceException(xml)).toBe("TIME 2026-13-01 is invalid.");
  });

  it("returns null when no exception element is present", () => {
    expect(extractServiceException("<html>gateway error</html>")).toBeNull();
    expect(extractServiceException("")).toBeNull();
  });
});

describe("status classification", () => {
  it("marks statuses a retry cannot fix as definitive", () => {
    for (const s of [400, 401, 403, 404, 405, 410, 414, 422]) {
      expect(isDefinitiveStatus(s), `status ${s}`).toBe(true);
    }
    for (const s of [408, 425, 429, 500, 502, 503, 504]) {
      expect(isDefinitiveStatus(s), `status ${s}`).toBe(false);
    }
  });
});

describe("parseRetryAfter", () => {
  it("parses delta-seconds, capped", () => {
    expect(parseRetryAfter("2")).toBe(2000);
    expect(parseRetryAfter("9999")).toBe(RETRY_AFTER_CAP_MS);
  });

  it("parses an HTTP-date relative to now, clamped to [0, cap]", () => {
    const now = Date.parse("2026-07-08T12:00:00Z");
    const clock = (): number => now;
    expect(
      parseRetryAfter(
        "Wed, 08 Jul 2026 12:00:05 GMT",
        RETRY_AFTER_CAP_MS,
        clock
      )
    ).toBe(5000);
    // A date in the past means "retry now", never a negative wait.
    expect(
      parseRetryAfter(
        "Wed, 08 Jul 2026 11:00:00 GMT",
        RETRY_AFTER_CAP_MS,
        clock
      )
    ).toBe(0);
  });

  it("returns null for absent or malformed headers", () => {
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter("")).toBeNull();
    expect(parseRetryAfter("soon")).toBeNull();
  });
});

describe("retry semantics by status", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const respondStatus = (
    status: number,
    calls: { count: number },
    headers: Record<string, string> = {}
  ): void => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls.count++;
        // new Response() rejects some statuses in init; a minimal literal
        // covers everything fetchWithTimeout reads.
        return { ok: false, status, headers: new Headers(headers) } as Response;
      })
    );
  };

  it("throws a 404 immediately with the status attached — no retries", async () => {
    const calls = { count: 0 };
    respondStatus(404, calls);
    const err = await fetchWithRetry("https://gibs.test/missing-month", {
      retries: 3,
      backoffMs: 1,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(404);
    expect(calls.count).toBe(1);
  });

  it("retries a 503 through the backoff budget", async () => {
    const calls = { count: 0 };
    respondStatus(503, calls);
    await expect(
      fetchWithRetry("https://gibs.test/wms", { retries: 2, backoffMs: 1 })
    ).rejects.toBeInstanceOf(HttpError);
    expect(calls.count).toBe(3);
  });

  it("waits the server's Retry-After before retrying a 429", async () => {
    vi.useFakeTimers();
    const calls = { count: 0 };
    respondStatus(429, calls, { "retry-after": "2" });
    const pending = fetchWithRetry("https://api.test/limited", {
      retries: 1,
      backoffMs: 1,
    }).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(1999);
    expect(calls.count).toBe(1); // still honoring the server's wait
    await vi.advanceTimersByTimeAsync(1);
    const err = await pending;
    expect((err as HttpError).status).toBe(429);
    expect(calls.count).toBe(2);
  });
});

describe("offline fast-fail", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads as online outside a browser", () => {
    expect(isOnline()).toBe(true);
  });

  it("trusts navigator.onLine === false", () => {
    vi.stubGlobal("navigator", { onLine: false });
    expect(isOnline()).toBe(false);
  });

  it("fails in <50ms with no fetch attempts while offline", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const started = performance.now();
    await expect(
      fetchWithRetry("https://gibs.test/wms", { retries: 3 })
    ).rejects.toBeInstanceOf(OfflineError);
    expect(performance.now() - started).toBeLessThan(50);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("stops retrying when connectivity drops mid-backoff", async () => {
    const nav = { onLine: true };
    vi.stubGlobal("navigator", nav);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        nav.onLine = false; // the network vanishes after the first attempt
        throw new TypeError("network error");
      })
    );
    await expect(
      fetchWithRetry("https://gibs.test/wms", { retries: 2, backoffMs: 1 })
    ).rejects.toBeInstanceOf(OfflineError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("fetch payload validation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const respond = (
    body: string,
    contentType: string,
    calls?: { count: number }
  ): void => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        if (calls) calls.count++;
        return new Response(body, {
          status: 200,
          headers: { "content-type": contentType },
        });
      })
    );
  };

  it("fetchJson rejects an HTML body with a named error", async () => {
    respond("<html>captive portal</html>", "text/html");
    await expect(fetchJson("https://x.test/data.json")).rejects.toBeInstanceOf(
      ResponseTypeError
    );
  });

  it("fetchBlob surfaces the ServiceException text from XML-with-200", async () => {
    const calls = { count: 0 };
    respond(
      `<ServiceExceptionReport><ServiceException>Unknown layer FOO</ServiceException></ServiceExceptionReport>`,
      "application/vnd.ogc.se_xml",
      calls
    );
    await expect(
      fetchBlob("https://gibs.test/wms", { retries: 3 })
    ).rejects.toThrow(/Unknown layer FOO/);
    // Definitive server answer — must not burn the retry budget.
    expect(calls.count).toBe(1);
  });

  it("fetchJson parses a normal JSON response", async () => {
    respond(`{"ok":true}`, "application/json");
    await expect(fetchJson("https://x.test/data.json")).resolves.toEqual({
      ok: true,
    });
  });

  it("fetchBlob accepts imagery", async () => {
    respond("binary-ish", "image/jpeg");
    const blob = await fetchBlob("https://gibs.test/wms");
    expect(blob.size).toBeGreaterThan(0);
  });
});
