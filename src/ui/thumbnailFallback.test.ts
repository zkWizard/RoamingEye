import { describe, expect, it } from "vitest";
import {
  initialThumb,
  thumbOnError,
  thumbOnLoad,
  thumbRetryUrl,
} from "./thumbnailFallback";

const URL =
  "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?WIDTH=280";

describe("view-card thumbnail fallback", () => {
  it("shows the gradient immediately when the URL is empty", () => {
    expect(initialThumb("")).toEqual({
      src: null,
      showImage: false,
      fallback: true,
    });
  });

  it("requests a real URL without painting it until it decodes", () => {
    expect(initialThumb(URL)).toEqual({
      src: URL,
      showImage: false,
      fallback: false,
    });
  });

  it("retries once, still hidden, then falls back", () => {
    const first = thumbOnError(URL, 0);
    expect(first).toEqual({
      src: thumbRetryUrl(URL),
      showImage: false,
      fallback: false,
    });
    expect(first.src).toBe(`${URL}&retry=1`);
    expect(thumbRetryUrl(`${URL}&retry=1`)).toBe(`${URL}&retry=1`);

    expect(thumbOnError(URL, 1)).toEqual({
      src: null,
      showImage: false,
      fallback: true,
    });
  });

  it("falls back when there is nothing to retry", () => {
    expect(thumbOnError("", 0)).toEqual({
      src: null,
      showImage: false,
      fallback: true,
    });
  });

  it("reveals a decoded image and rejects a zero-width one", () => {
    expect(thumbOnLoad(280)).toEqual({ showImage: true, fallback: false });
    expect(thumbOnLoad(0)).toEqual({
      src: null,
      showImage: false,
      fallback: true,
    });
  });
});
