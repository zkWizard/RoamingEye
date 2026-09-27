import { describe, expect, it } from "vitest";
import {
  clipFilename,
  clipLayout,
  clipSize,
  coverCrop,
  pickClipMime,
} from "./clipFrame";

describe("clipSize", () => {
  it("records landscape views 16:9 and portrait ones 9:16", () => {
    expect(clipSize(1440, 900)).toEqual({ width: 1280, height: 720 });
    expect(clipSize(390, 844)).toEqual({ width: 720, height: 1280 });
    expect(clipSize(800, 800)).toEqual({ width: 1280, height: 720 });
  });
});

describe("coverCrop", () => {
  it("takes the centred band of a wider source", () => {
    const crop = coverCrop(2000, 900, { width: 1280, height: 720 });
    expect(crop.sh).toBe(900);
    expect(crop.sw).toBeCloseTo(1600);
    expect(crop.sx).toBeCloseTo(200);
    expect(crop.sy).toBe(0);
  });

  it("takes the centred band of a taller source", () => {
    const crop = coverCrop(780, 1688, { width: 720, height: 1280 });
    expect(crop.sw).toBe(780);
    expect(crop.sh).toBeCloseTo(780 * (1280 / 720));
    expect(crop.sy).toBeCloseTo((1688 - crop.sh) / 2);
  });

  it("never reaches outside the source", () => {
    for (const [w, h] of [
      [1440, 900],
      [390, 844],
      [568, 320],
      [1024, 1366],
    ]) {
      for (const size of [
        { width: 1280, height: 720 },
        { width: 720, height: 1280 },
      ]) {
        const c = coverCrop(w, h, size);
        expect(c.sx).toBeGreaterThanOrEqual(0);
        expect(c.sy).toBeGreaterThanOrEqual(0);
        expect(c.sx + c.sw).toBeLessThanOrEqual(w + 1e-9);
        expect(c.sy + c.sh).toBeLessThanOrEqual(h + 1e-9);
        expect(c.sw / c.sh).toBeCloseTo(size.width / size.height);
      }
    }
  });
});

describe("clipLayout", () => {
  it("keeps every part inside the frame, clear of the edges", () => {
    for (const size of [
      { width: 1280, height: 720 },
      { width: 720, height: 1280 },
    ]) {
      const l = clipLayout(size);
      const inside = (x: number, y: number) =>
        x >= l.margin - 1 &&
        x <= size.width - l.margin + 1 &&
        y >= l.margin - 1 &&
        y <= size.height - l.margin + 1;
      expect(inside(l.title.x, l.title.y)).toBe(true);
      expect(inside(l.month.x, l.month.y)).toBe(true);
      expect(inside(l.legend.x, l.legend.y)).toBe(true);
      expect(inside(l.legend.x + l.legend.width, l.legend.y)).toBe(true);
      expect(inside(l.credit.x, l.credit.y)).toBe(true);
      expect(inside(l.cite.x, l.cite.y)).toBe(true);
    }
  });

  it("gives the citation a full-width line in portrait", () => {
    const port = clipLayout({ width: 720, height: 1280 });
    expect(port.cite.room).toBe(720 - 2 * port.margin);
    // Below the colour scale's values, so the two never share a line.
    expect(port.cite.y).toBeGreaterThan(port.legend.y + port.legend.height);
    const land = clipLayout({ width: 1280, height: 720 });
    expect(land.cite.room).toBeGreaterThan(600);
  });

  it("uses the same type sizes in both orientations", () => {
    const land = clipLayout({ width: 1280, height: 720 });
    const port = clipLayout({ width: 720, height: 1280 });
    expect(port.title.size).toBe(land.title.size);
    expect(port.credit.size).toBe(land.credit.size);
  });
});

describe("pickClipMime", () => {
  it("prefers MP4 where the browser records it", () => {
    expect(pickClipMime(() => true)).toEqual({
      mime: "video/mp4;codecs=avc1.42E01E",
      ext: "mp4",
    });
  });

  it("falls back to WebM", () => {
    expect(pickClipMime((m) => m.startsWith("video/webm"))).toEqual({
      mime: "video/webm;codecs=vp9",
      ext: "webm",
    });
  });

  it("says so when nothing can be recorded", () => {
    expect(pickClipMime(() => false)).toBeNull();
  });
});

describe("clipFilename", () => {
  it("names the subject, the months and the version", () => {
    expect(
      clipFilename(
        "canada-smoke-2023",
        { year: 2023, month: 4 },
        { year: 2023, month: 9 },
        "1.2.0",
        "mp4"
      )
    ).toBe("roamingeye_canada-smoke-2023_2023-04_2023-09_v1.2.0.mp4");
  });
});
