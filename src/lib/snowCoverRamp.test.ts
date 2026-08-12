import { describe, it, expect } from "vitest";
import {
  MEASURED_SNOW_COVER_INVERSION,
  SNOW_COVER_COLORMAP_DOC,
  SNOW_COVER_FLAG_COLORS,
  auditSnowCoverInversion,
  parseSnowCoverFlagColors,
  parseSnowCoverRampEntries,
  type SnowCoverRampEntry,
} from "./snowCoverRamp";
import { LEGENDS, legendTicks, type GradientLegendSpec } from "./legend";
import { NO_DATA_DISTANCE, PROBE_SCALES } from "./probe";
import { LAYERS } from "./timeline";

/**
 * Verbatim capture of the discrete data ramp in GIBS's
 * MODIS_NDSI_Snow_Cover document (fetched 2026-08-11), as
 * [percent, r, g, b]. Percent 0 is absent because GIBS renders it
 * transparent. The weekly contract test re-fetches the live document and
 * re-runs the same audit, so this fixture cannot silently go stale.
 */
// prettier-ignore
const PUBLISHED_RAMP: [number, number, number, number][] = [
  [1, 240, 240, 128], [2, 240, 240, 129], [3, 240, 240, 130], [4, 240, 240, 131],
  [5, 240, 240, 132], [6, 240, 240, 133], [7, 240, 240, 134], [8, 240, 240, 135],
  [9, 240, 240, 136], [10, 240, 240, 137], [11, 240, 240, 138], [12, 240, 240, 139],
  [13, 240, 240, 140], [14, 240, 240, 141], [15, 240, 240, 142], [16, 240, 240, 143],
  [17, 240, 240, 144], [18, 240, 240, 145], [19, 240, 240, 146], [20, 240, 240, 147],
  [21, 240, 210, 128], [22, 240, 210, 129], [23, 240, 210, 130], [24, 240, 210, 131],
  [25, 240, 210, 132], [26, 240, 210, 133], [27, 240, 210, 134], [28, 240, 210, 135],
  [29, 240, 210, 136], [30, 240, 210, 137], [31, 240, 210, 138], [32, 240, 210, 139],
  [33, 240, 210, 140], [34, 240, 210, 141], [35, 240, 210, 142], [36, 240, 210, 143],
  [37, 240, 210, 144], [38, 240, 210, 145], [39, 240, 210, 146], [40, 240, 210, 147],
  [41, 240, 180, 128], [42, 240, 180, 129], [43, 240, 180, 130], [44, 240, 180, 131],
  [45, 240, 180, 132], [46, 240, 180, 133], [47, 240, 180, 134], [48, 240, 180, 135],
  [49, 240, 180, 136], [50, 240, 180, 137], [51, 240, 180, 138], [52, 240, 180, 139],
  [53, 240, 180, 140], [54, 240, 180, 141], [55, 240, 180, 142], [56, 240, 180, 143],
  [57, 240, 180, 144], [58, 240, 180, 145], [59, 240, 180, 146], [60, 240, 180, 147],
  [61, 240, 150, 128], [62, 240, 150, 129], [63, 240, 150, 130], [64, 240, 150, 131],
  [65, 240, 150, 132], [66, 240, 150, 133], [67, 240, 150, 134], [68, 240, 150, 135],
  [69, 240, 150, 136], [70, 240, 150, 137], [71, 240, 150, 138], [72, 240, 150, 139],
  [73, 240, 150, 140], [74, 240, 150, 141], [75, 240, 150, 142], [76, 240, 150, 143],
  [77, 240, 150, 144], [78, 240, 150, 145], [79, 240, 150, 146], [80, 240, 150, 147],
  [81, 240, 120, 128], [82, 240, 121, 128], [83, 240, 122, 128], [84, 240, 123, 128],
  [85, 240, 124, 128], [86, 240, 125, 128], [87, 240, 126, 128], [88, 240, 127, 128],
  [89, 240, 128, 128], [90, 240, 128, 129], [91, 240, 129, 129], [92, 240, 129, 130],
  [93, 240, 130, 130], [94, 240, 130, 131], [95, 240, 131, 131], [96, 240, 131, 132],
  [97, 240, 132, 132], [98, 240, 132, 133], [99, 240, 133, 133], [100, 255, 0, 0],
];

const publishedEntries: SnowCoverRampEntry[] = PUBLISHED_RAMP.map(
  ([percent, r, g, b]) => ({ percent, rgb: { r, g, b } })
);

/** Minimal stand-in for the shape of the live colormap document. */
function documentFixture(): string {
  const ramp = PUBLISHED_RAMP.map(
    ([percent, r, g, b]) =>
      `<LegendEntry rgb="${r},${g},${b}" tooltip="${percent}" id="${percent}"/>`
  ).join("");
  const flags = SNOW_COVER_FLAG_COLORS.map(
    ({ label, rgb }) =>
      `<LegendEntry rgb="${rgb.r},${rgb.g},${rgb.b}" tooltip="${label}"/>`
  ).join("");
  return [
    '<ColorMaps><ColorMap title="Normalized Difference Snow Index">',
    '<Legend type="discrete" minLabel="1" maxLabel="100">',
    '<LegendEntry rgb="0,255,0" tooltip="0" id="0"/>',
    ramp,
    '</Legend></ColorMap><ColorMap title="Classifications">',
    `<Legend type="classification">${flags}</Legend>`,
    "</ColorMap></ColorMaps>",
  ].join("");
}

describe("snow-cover ramp parsing", () => {
  it("reads the discrete data ramp and skips the undrawn 0%", () => {
    const entries = parseSnowCoverRampEntries(documentFixture());
    expect(entries).toHaveLength(100);
    expect(entries[0]).toEqual({ percent: 1, rgb: { r: 240, g: 240, b: 128 } });
    expect(entries.at(-1)).toEqual({
      percent: 100,
      rgb: { r: 255, g: 0, b: 0 },
    });
    expect(entries.some((entry) => entry.percent === 0)).toBe(false);
  });

  it("keeps the classification flags out of the data ramp", () => {
    const entries = parseSnowCoverRampEntries(documentFixture());
    for (const flag of SNOW_COVER_FLAG_COLORS) {
      expect(
        entries.some(
          (entry) =>
            entry.rgb.r === flag.rgb.r &&
            entry.rgb.g === flag.rgb.g &&
            entry.rgb.b === flag.rgb.b
        ),
        `${flag.label} must not be read as a snow percentage`
      ).toBe(false);
    }
  });

  it("reads the flag colours from the classification legend", () => {
    expect(parseSnowCoverFlagColors(documentFixture())).toEqual([
      ...SNOW_COVER_FLAG_COLORS,
    ]);
  });

  it("returns nothing for a document without the expected legends", () => {
    expect(parseSnowCoverRampEntries("<ColorMaps/>")).toEqual([]);
    expect(parseSnowCoverFlagColors("<ColorMaps/>")).toEqual([]);
  });
});

describe("snow-cover legend ↔ published ramp", () => {
  const audit = auditSnowCoverInversion(publishedEntries);

  it("recovers every published ramp colour", () => {
    // Regression guard: the previous blue → white gradient rejected all 100
    // as no-data, so the cryosphere layer's probe reported snow nowhere it
    // actually falls.
    expect(audit.nulls).toBe(MEASURED_SNOW_COVER_INVERSION.nulls);
    expect(audit.total).toBe(MEASURED_SNOW_COVER_INVERSION.total);
  });

  it("recovers percentages within the committed accuracy", () => {
    expect(audit.rmse).toBeCloseTo(MEASURED_SNOW_COVER_INVERSION.rmse, 1);
    expect(audit.worstAbsError).toBeLessThanOrEqual(
      MEASURED_SNOW_COVER_INVERSION.worstAbsError
    );
    // Trends and season timing depend on order, not just magnitude.
    expect(audit.monotone).toBe(true);
    expect(Math.abs(audit.bias ?? Infinity)).toBeLessThan(1);
  });

  it("rejects every non-measurement flag colour", () => {
    expect(audit.decodedFlags).toEqual([]);
    expect(audit.tightestFlagDistance).toBeGreaterThan(NO_DATA_DISTANCE);
    expect(audit.tightestFlagDistance).toBeCloseTo(
      MEASURED_SNOW_COVER_INVERSION.tightestFlagDistance,
      1
    );
  });

  it("names the colormap the layer is actually rendered with", () => {
    // Provenance: the document GIBS links from this layer's WMTS metadata.
    expect(SNOW_COVER_COLORMAP_DOC).toBe("MODIS_NDSI_Snow_Cover");
    expect(LAYERS.snow.wmsLayer).toBe(
      "MODIS_Terra_L3_Snow_Cover_Monthly_Average_Pct"
    );
  });

  it("keeps the legend bar reading in the units the probe reports", () => {
    const spec = LEGENDS.snow as GradientLegendSpec;
    expect(PROBE_SCALES.snow.unit).toBe("%");
    expect(spec.maxLabel).toBe("100%");
    // The end labels must agree with the probe-scale ticks the bar renders
    // beside them (legendTicks reads PROBE_SCALES): both ends say 0/100.
    expect(spec.minLabel).toBe("0%");
    expect(legendTicks("snow")).toEqual({
      min: "0 %",
      mid: "50 %",
      max: "100 %",
    });
    // The bar's leftmost colour is GIBS's 1%; 0% has no colour at all, and
    // the note — not a mislabelled end — is what carries that.
    expect(spec.interpretationNote).toMatch(/no colour at all for 0%/);
    expect(spec.interpretationNote).toMatch(/flag colours/);
  });
});
