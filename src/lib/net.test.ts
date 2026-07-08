import { describe, it, expect, afterEach, vi } from "vitest";
import {
  backoffDelay,
  extractServiceException,
  fetchBlob,
  fetchJson,
  isAbortError,
  isAcceptableContentType,
  ResponseTypeError,
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
