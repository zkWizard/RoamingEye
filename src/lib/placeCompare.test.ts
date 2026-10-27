import { describe, expect, it } from "vitest";
import { formatProbeValue, PROBE_SCALES } from "./probe";
import {
  describePlaceCompare,
  describePlaceDifference,
  previewBounds,
  resolvePlaceCompareMonth,
} from "./placeCompare";
import { LAYERS, monthRangeForLayer } from "./timeline";
import { parsePlaceCompare, type PlaceCompareQuery } from "./thenNow";

function parsed(input: string): PlaceCompareQuery {
  const query = parsePlaceCompare(input);
  if (!query) throw new Error(`expected a place comparison: ${input}`);
  return query;
}

describe("resolvePlaceCompareMonth", () => {
  const precip = monthRangeForLayer(LAYERS.precip);
  const latest = precip[precip.length - 1];

  it("uses the latest published month when no date is named", () => {
    const resolved = resolvePlaceCompareMonth(
      precip,
      parsed("Houston vs Austin rainfall")
    );
    expect(resolved).toEqual({ month: latest, note: null });
  });

  it("keeps a month the layer has published", () => {
    const resolved = resolvePlaceCompareMonth(
      precip,
      parsed("Houston vs Austin rainfall March 2020")
    );
    expect(resolved).toEqual({
      month: { year: 2020, month: 3 },
      note: null,
    });
  });

  it("falls back when the requested month is not published yet", () => {
    const resolved = resolvePlaceCompareMonth(
      precip,
      parsed("Houston vs Austin rainfall 2026")
    );
    expect(resolved?.month).toEqual(latest);
    expect(resolved?.note).toContain("Sep 2026 isn't published yet");
    expect(resolved?.note).toContain("latest available month");
  });

  it("falls back when the year is outside the record", () => {
    const resolved = resolvePlaceCompareMonth(
      precip,
      parsed("Houston vs Austin rainfall 1990")
    );
    expect(resolved?.month).toEqual(latest);
    expect(resolved?.note).toContain("isn't in this layer's record");
  });
});

describe("describePlaceCompare", () => {
  const today = { year: 2026, month: 10 };

  it("names rain for the season month when that month has finished", () => {
    const described = describePlaceCompare(
      parsed("Houston vs Austin rainfall 2026"),
      today
    );
    expect(described.title).toBe("Houston vs Austin");
    expect(described.subtitle).toBe("Rain · Sep 2026");
  });

  it("names the latest complete month when no date is given", () => {
    const described = describePlaceCompare(
      parsed("compare Houston and Austin heat"),
      today
    );
    expect(described.title).toBe("Houston vs Austin");
    expect(described.subtitle).toBe("Air temperature · latest complete month");
  });

  it("says a future rain month is not complete yet", () => {
    const described = describePlaceCompare(
      parsed("Houston vs Austin rainfall October 2026"),
      today
    );
    expect(described.subtitle).toContain("Oct 2026 isn't complete yet");
    expect(described.subtitle).toContain("latest complete month");
  });
});

describe("describePlaceDifference", () => {
  const note =
    "Sep 2026 isn't published yet. Showing Mar 2026, the latest available month.";

  it("says which place is wetter, and keeps the fallback", () => {
    const scale = PROBE_SCALES.precip;
    const text = describePlaceDifference({
      placeA: "Houston",
      placeB: "Austin",
      layer: "precip",
      monthLabel: "March 2026",
      valueA: 4,
      valueB: 2,
      note,
    });
    expect(text.startsWith(note)).toBe(true);
    expect(text).toContain(
      `Houston's rainfall is ${formatProbeValue(4, scale)}`
    );
    expect(text).toContain(`Austin's is ${formatProbeValue(2, scale)}`);
    expect(text).toContain(
      `Houston is wetter by ${formatProbeValue(2, scale)}`
    );
  });

  it("calls a colormap-sized gap about the same", () => {
    const text = describePlaceDifference({
      placeA: "Houston",
      placeB: "Austin",
      layer: "precip",
      monthLabel: "March 2026",
      valueA: 2,
      valueB: 2,
      note: null,
    });
    expect(text).toContain("about the same rainfall");
  });

  it("names a place with no reading", () => {
    const text = describePlaceDifference({
      placeA: "Houston",
      placeB: "Austin",
      layer: "ndvi",
      monthLabel: "August 2020",
      valueA: 0.4,
      valueB: null,
      note: null,
    });
    expect(text).toContain("Austin has no reading");
    expect(text).toContain("Houston's greenness");
  });
});

describe("previewBounds", () => {
  it("pads a city box and stays inside the map", () => {
    const box = previewBounds([29.5, 30.1, -95.8, -95.0], 29.8, -95.4);
    expect(box[0]).toBeLessThan(29.5);
    expect(box[1]).toBeGreaterThan(30.1);
    expect(box[2]).toBeLessThan(-95.8);
    expect(box[3]).toBeGreaterThan(-95.0);
    expect(box[1]).toBeLessThanOrEqual(80);
  });

  it("frames a point when the box is missing", () => {
    const box = previewBounds(null, 30, -97);
    expect(box[0]).toBeLessThan(30);
    expect(box[1]).toBeGreaterThan(30);
  });
});
