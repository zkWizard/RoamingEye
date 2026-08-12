import { describe, expect, it } from "vitest";
import {
  NDVI_MAX_INVERSION_DISTANCE,
  VEGETATION_INDEX_NO_DATA_RGB,
  VEGETATION_INDEX_NO_DATA_SEPARATION,
  colorDistance,
  defaultThresholdMisreadsNoData,
  placeInversionDistanceFor,
  vegetationIndexNoDataSeparability,
  type VegetationIndexId,
} from "./vegetationIndexNoData";
import { LEGENDS } from "./legend";
import { NO_DATA_DISTANCE, hexToRgb, invertColormapEntries } from "./probe";
import { PLACE_COLORMAP_DOCS } from "./placeInsights";

const INDICES: VegetationIndexId[] = ["ndvi", "evi"];

/**
 * The published dark ends measured from the live GIBS colormaps (see the
 * module doc and the weekly contract test). Reproduced here as a fixed ramp so
 * the behaviour is pinned without a network call: a dense 1.0-unit polyline
 * running into each index's darkest published colour.
 */
function rampEndingAt(darkest: { r: number; g: number; b: number }): {
  rgb: { r: number; g: number; b: number };
  value: number;
}[] {
  const entries = [];
  for (let i = 0; i < 40; i++) {
    entries.push({
      rgb: { r: darkest.r, g: darkest.g + (39 - i), b: darkest.b },
      value: 0.6 + i * 0.01,
    });
  }
  return entries;
}

const NDVI_RAMP = rampEndingAt({ r: 0, g: 24, b: 0 });
const EVI_RAMP = rampEndingAt({ r: 0, g: 0, b: 0 });

describe("vegetation-index no-data", () => {
  it("treats the JPEG transport's black as the no-data colour", () => {
    expect(VEGETATION_INDEX_NO_DATA_RGB).toEqual({ r: 0, g: 0, b: 0 });
  });

  it("keeps both ramps inside the app-wide threshold, so both need handling", () => {
    for (const index of INDICES) {
      expect(
        VEGETATION_INDEX_NO_DATA_SEPARATION[index],
        `${index} separation must stay below the app-wide default`
      ).toBeLessThan(NO_DATA_DISTANCE);
      expect(defaultThresholdMisreadsNoData(index)).toBe(true);
    }
  });

  it("classifies NDVI as separable and EVI as inseparable", () => {
    expect(vegetationIndexNoDataSeparability("ndvi")).toBe("separable");
    expect(vegetationIndexNoDataSeparability("evi")).toBe("inseparable");
    // EVI's ramp contains the no-data colour itself: not a tuning problem.
    expect(VEGETATION_INDEX_NO_DATA_SEPARATION.evi).toBe(0);
  });

  it("reads undrawn NDVI as near-maximum greenness under the default", () => {
    const misread = invertColormapEntries(
      VEGETATION_INDEX_NO_DATA_RGB,
      NDVI_RAMP
    );
    expect(misread).not.toBeNull();
    // The failure mode being fixed: no data lands at the top of the index.
    expect(misread!).toBeGreaterThan(0.9);
  });

  it("rejects undrawn NDVI at the layer threshold", () => {
    expect(
      invertColormapEntries(
        VEGETATION_INDEX_NO_DATA_RGB,
        NDVI_RAMP,
        NDVI_MAX_INVERSION_DISTANCE
      )
    ).toBeNull();
  });

  it("keeps the threshold under half the measured separation", () => {
    expect(NDVI_MAX_INVERSION_DISTANCE).toBeLessThan(
      VEGETATION_INDEX_NO_DATA_SEPARATION.ndvi / 2
    );
  });

  it("costs the NDVI ramp none of its published colours", () => {
    for (const entry of NDVI_RAMP) {
      expect(
        invertColormapEntries(
          entry.rgb,
          NDVI_RAMP,
          NDVI_MAX_INVERSION_DISTANCE
        ),
        `published NDVI colour for ${entry.value} must stay usable`
      ).toBe(entry.value);
    }
  });

  it("cannot separate EVI no-data at any threshold", () => {
    for (const threshold of [NDVI_MAX_INVERSION_DISTANCE, 1, 0.5]) {
      expect(
        invertColormapEntries(
          VEGETATION_INDEX_NO_DATA_RGB,
          EVI_RAMP,
          threshold
        ),
        "EVI's own ramp contains black, so no threshold rejects it"
      ).not.toBeNull();
    }
    expect(placeInversionDistanceFor("evi")).toBeNull();
    expect(placeInversionDistanceFor("ndvi")).toBe(NDVI_MAX_INVERSION_DISTANCE);
  });

  it("keeps EVI off the authoritative-colormap place path", () => {
    // There is no threshold that would make this safe; the guard is that the
    // layer is never registered for physical place decoding in the first place.
    expect(Object.keys(PLACE_COLORMAP_DOCS)).not.toContain("evi");
  });

  it("leaves the display legends able to reject black on their own", () => {
    // The hand-drawn ramps stop well short of black, so the point/area probe
    // and the display-ramp place fallback need no override.
    for (const index of INDICES) {
      const spec = LEGENDS[index];
      if (!("stops" in spec)) throw new Error(`${index} legend has no stops`);
      const darkest = spec.stops[spec.stops.length - 1];
      expect(
        colorDistance(VEGETATION_INDEX_NO_DATA_RGB, hexToRgb(darkest.color)),
        `${index} display legend must stay clear of no-data black`
      ).toBeGreaterThan(NO_DATA_DISTANCE);
    }
  });
});
