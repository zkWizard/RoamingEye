import { describe, it, expect } from "vitest";
import {
  latLonToPixel,
  hexToRgb,
  buildColormapLut,
  invertColormap,
  medianValid,
  meanValid,
  gridPoints,
  monthlyClimatology,
  anomalySeries,
  seriesStats,
  scaleValue,
  formatProbeValue,
  buildProbeCsv,
  PROBE_SCALES,
} from "./probe";
import { LEGENDS, type GradientLegendSpec } from "./legend";

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
  const ndvi = LEGENDS.ndvi as GradientLegendSpec;
  const lut = buildColormapLut(ndvi.stops);

  it("endpoints match the first and last stops", () => {
    expect(lut[0]).toEqual(hexToRgb(ndvi.stops[0].color));
    expect(lut[lut.length - 1]).toEqual(hexToRgb(ndvi.stops.at(-1)!.color));
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

describe("meanValid", () => {
  it("averages the valid samples", () => {
    expect(meanValid([0.2, 0.4, null, 0.6])).toBeCloseTo(0.4);
  });

  it("returns null when too little of the grid is data", () => {
    // 1 of 8 valid < 25% — a nearly-all-ocean box.
    expect(meanValid([0.5, null, null, null, null, null, null, null])).toBe(
      null
    );
    // 2 of 8 = exactly 25% — coastal box still counts.
    expect(
      meanValid([0.5, 0.7, null, null, null, null, null, null])
    ).toBeCloseTo(0.6);
  });

  it("returns null for an empty grid", () => {
    expect(meanValid([])).toBeNull();
  });
});

describe("gridPoints", () => {
  const bounds = { south: 0, north: 4, west: 10, east: 14 };

  it("lays out n×n cell centers strictly inside the box", () => {
    const points = gridPoints(bounds, 4);
    expect(points).toHaveLength(16);
    for (const p of points) {
      expect(p.lat).toBeGreaterThan(bounds.south);
      expect(p.lat).toBeLessThan(bounds.north);
      expect(p.lon).toBeGreaterThan(bounds.west);
      expect(p.lon).toBeLessThan(bounds.east);
    }
    // First cell center sits half a cell in from the corner.
    expect(points[0]).toEqual({ lat: 0.5, lon: 10.5 });
  });
});

describe("climatology & anomalies", () => {
  // Two years of a two-season cycle: Jan low, Jul high — with a drought Jul.
  const months = [
    { year: 2020, month: 1 },
    { year: 2020, month: 7 },
    { year: 2021, month: 1 },
    { year: 2021, month: 7 },
  ];
  const values = [0.2, 0.8, 0.2, 0.4]; // 2021 Jul is anomalously low

  it("computes the per-calendar-month mean", () => {
    const clim = monthlyClimatology(months, values);
    expect(clim[0]).toBeCloseTo(0.2); // January
    expect(clim[6]).toBeCloseTo(0.6); // July: (0.8 + 0.4) / 2
    expect(clim[3]).toBeNull(); // no April data
  });

  it("subtracts the seasonal cycle, exposing the anomaly", () => {
    const anomalies = anomalySeries(months, values);
    expect(anomalies[0]).toBeCloseTo(0); // ordinary January
    expect(anomalies[1]).toBeCloseTo(0.2); // good July
    expect(anomalies[3]).toBeCloseTo(-0.2); // drought July
  });

  it("propagates nulls through the anomaly series", () => {
    const anomalies = anomalySeries(months, [0.2, null, 0.2, 0.4]);
    expect(anomalies[1]).toBeNull();
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
  const meta = {
    layerLabel: "Vegetation (NDVI)",
    wmsLayer: "MODIS_Terra_L3_NDVI_Monthly",
    lat: -3.4653,
    lon: -62.2159,
    scale: PROBE_SCALES.ndvi,
    mode: "point" as const,
    imageWidth: 1024,
    imageHeight: 512,
    generatedIso: "2026-07-03T12:00:00Z",
  };
  const csv = buildProbeCsv(
    meta,
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
    expect(csv).toContain("point probe");
  });

  it("writes one row per month with anomaly, empty for no-data", () => {
    const rows = csv
      .trim()
      .split("\n")
      .filter((l) => !l.startsWith("#"));
    // Single March sample → March climatology = itself → anomaly 0.
    expect(rows).toEqual([
      "year_month,value,anomaly",
      "2000-03,0.8123,0.0000",
      "2000-04,,",
    ]);
  });

  it("writes values on the layer scale (snow fractions become percent)", () => {
    const snowCsv = buildProbeCsv(
      { ...meta, scale: PROBE_SCALES.snow },
      [{ year: 2001, month: 1 }],
      [0.62]
    );
    expect(snowCsv).toContain("2001-01,62.0000,0.0000");
  });

  it("records the region bounds in area mode", () => {
    const areaCsv = buildProbeCsv(
      {
        ...meta,
        mode: "area" as const,
        sampledBounds: { south: -4, north: -3, west: -63, east: -62 },
      },
      [{ year: 2001, month: 1 }],
      [0.5]
    );
    expect(areaCsv).toContain("area probe");
    expect(areaCsv).toContain(
      "# region: -4.000,-63.000,-3.000,-62.000 (S,W,N,E)"
    );
  });
});
