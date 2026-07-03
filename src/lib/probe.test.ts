import { describe, it, expect } from "vitest";
import {
  latLonToPixel,
  hexToRgb,
  buildColormapLut,
  invertColormap,
  medianValid,
  seriesStats,
  scaleValue,
  formatProbeValue,
  buildProbeCsv,
  PROBE_SCALES,
} from "./probe";
import { LEGENDS } from "./legend";

describe("latLonToPixel", () => {
  it("maps the equirectangular corners and center", () => {
    // Center of the map: lat 0, lon 0.
    expect(latLonToPixel(0, 0, 1024, 512)).toEqual({ x: 512, y: 256 });
    // Extremes clamp one pixel in so a 3×3 neighborhood always fits.
    expect(latLonToPixel(90, -180, 1024, 512)).toEqual({ x: 1, y: 1 });
    expect(latLonToPixel(-90, 180, 1024, 512)).toEqual({ x: 1022, y: 510 });
  });

  it("puts the northern hemisphere in the top half", () => {
    const { y } = latLonToPixel(45, 0, 1024, 512);
    expect(y).toBeLessThan(256);
  });
});

describe("hexToRgb", () => {
  it("parses channels", () => {
    expect(hexToRgb("#ff0000")).toEqual({ r: 255, g: 0, b: 0 });
    expect(hexToRgb("#a97c50")).toEqual({ r: 169, g: 124, b: 80 });
  });
});

describe("buildColormapLut / invertColormap", () => {
  const lut = buildColormapLut(LEGENDS.ndvi.stops);

  it("endpoints match the first and last stops", () => {
    expect(lut[0]).toEqual(hexToRgb(LEGENDS.ndvi.stops[0].color));
    expect(lut[lut.length - 1]).toEqual(
      hexToRgb(LEGENDS.ndvi.stops.at(-1)!.color)
    );
  });

  it("round-trips: the LUT color at t inverts back to ≈t", () => {
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const rgb = lut[Math.round(t * (lut.length - 1))];
      const inverted = invertColormap(rgb, lut);
      expect(inverted).not.toBeNull();
      expect(Math.abs(inverted! - t)).toBeLessThan(0.05);
    }
  });

  it("tolerates JPEG-scale noise", () => {
    const rgb = lut[128];
    const noisy = { r: rgb.r + 8, g: rgb.g - 6, b: rgb.b + 9 };
    expect(invertColormap(noisy, lut)).not.toBeNull();
  });

  it("returns null for colors far off the gradient (no-data)", () => {
    expect(invertColormap({ r: 0, g: 0, b: 0 }, lut)).toBeNull(); // ocean/space
    expect(invertColormap({ r: 78, g: 161, b: 255 }, lut)).toBeNull(); // UI blue
  });
});

describe("medianValid", () => {
  it("takes the median of valid samples", () => {
    expect(medianValid([0.1, 0.2, 0.3, 0.4, 0.5, null, null, null, null])).toBe(
      0.3
    );
  });

  it("averages the middle pair for even counts", () => {
    expect(
      medianValid([0.2, 0.4, 0.1, 0.3, 0.5, 0.6, null, null, null], 5)
    ).toBe(0.35);
  });

  it("returns null when a majority of the neighborhood is no-data", () => {
    expect(
      medianValid([0.5, 0.5, null, null, null, null, null, null, null])
    ).toBeNull();
  });
});

describe("seriesStats", () => {
  it("computes min/max/mean over valid months only", () => {
    const stats = seriesStats([0.2, null, 0.4, 0.6, null]);
    expect(stats).toMatchObject({ min: 0.2, max: 0.6, count: 3 });
    expect(stats!.mean).toBeCloseTo(0.4);
  });

  it("returns null for an all-no-data series", () => {
    expect(seriesStats([null, null])).toBeNull();
  });
});

describe("scales", () => {
  it("maps gradient position onto the layer scale", () => {
    expect(scaleValue(0.5, PROBE_SCALES.snow)).toBe(50);
    expect(scaleValue(0.75, PROBE_SCALES.ndvi)).toBe(0.75);
  });

  it("marks physical vs fraction-of-scale layers", () => {
    expect(PROBE_SCALES.ndvi.calibrated).toBe(true);
    expect(PROBE_SCALES.snow.calibrated).toBe(true);
    expect(PROBE_SCALES.lst.calibrated).toBe(false);
  });

  it("formats values with the unit", () => {
    expect(formatProbeValue(78.4, PROBE_SCALES.snow)).toBe("78 %");
    expect(formatProbeValue(0.634, PROBE_SCALES.ndvi)).toBe("0.63");
  });
});

describe("buildProbeCsv", () => {
  const csv = buildProbeCsv(
    {
      layerLabel: "Vegetation (NDVI)",
      wmsLayer: "MODIS_Terra_L3_NDVI_Monthly",
      lat: -3.4653,
      lon: -62.2159,
      scale: PROBE_SCALES.ndvi,
      imageWidth: 1024,
      imageHeight: 512,
      generatedIso: "2026-07-03T12:00:00Z",
    },
    [
      { year: 2000, month: 3 },
      { year: 2000, month: 4 },
    ],
    [0.8123, null]
  );

  it("carries provenance in comment headers", () => {
    expect(csv).toContain("# gibs_layer: MODIS_Terra_L3_NDVI_Monthly");
    expect(csv).toContain("# lat: -3.4653");
    expect(csv).toContain("APPROXIMATE");
    expect(csv).toContain("# generated: 2026-07-03T12:00:00Z");
  });

  it("writes one row per month, empty for no-data", () => {
    const rows = csv
      .trim()
      .split("\n")
      .filter((l) => !l.startsWith("#"));
    expect(rows).toEqual(["year_month,value", "2000-03,0.8123", "2000-04,"]);
  });
});
