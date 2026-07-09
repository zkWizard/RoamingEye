import { describe, it, expect } from "vitest";
import {
  latLonToPixel,
  hexToRgb,
  buildColormapLut,
  invertColormap,
  medianValid,
  weightedMeanValid,
  areaWeight,
  gridPoints,
  dragBounds,
  boundsUsable,
  crossesAntimeridian,
  normalizeLon,
  regionGridSize,
  monthlyClimatology,
  anomalySeries,
  seriesStats,
  scaleValue,
  formatProbeValue,
  buildProbeCsv,
  PROBE_SCALES,
} from "./probe";
import { LEGENDS, type GradientLegendSpec } from "./legend";
import { decodeViewState } from "./viewState";

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

describe("weightedMeanValid", () => {
  const ones = (n: number): number[] => new Array<number>(n).fill(1);

  it("averages the valid samples (uniform weights = plain mean)", () => {
    expect(weightedMeanValid([0.2, 0.4, null, 0.6], ones(4))).toBeCloseTo(0.4);
  });

  it("weights samples by their area share", () => {
    // A value of 1 at the equator (weight cos 0° = 1) and 0 at 60°N
    // (weight cos 60° = 0.5): the weighted mean is 1·1/(1+0.5) = 2/3 —
    // not the unweighted 0.5.
    expect(
      weightedMeanValid([1, 0], [areaWeight(0), areaWeight(60)])
    ).toBeCloseTo(2 / 3);
  });

  it("is invariant under weighting when all values are equal", () => {
    expect(weightedMeanValid([0.3, 0.3, 0.3], [1, 0.5, 0.25])).toBeCloseTo(0.3);
  });

  it("matches the unweighted mean for an equator-symmetric grid", () => {
    // Mirrored latitudes carry mirrored (equal) weights, so a +φ/−φ pair
    // averages exactly as it would unweighted.
    const w = [areaWeight(45), areaWeight(-45)];
    expect(weightedMeanValid([0.2, 0.8], w)).toBeCloseTo(0.5);
  });

  it("gates on the valid *area* fraction, not the sample count", () => {
    // Three of four samples valid — but they're tiny polar slivers holding
    // 13% of the box's area. Count-based gating would pass this; area-based
    // gating correctly refuses to call it a region mean.
    expect(
      weightedMeanValid([null, 0.5, 0.5, 0.5], [1.0, 0.05, 0.05, 0.05])
    ).toBeNull();
    // 2 of 8 equal-weight cells = exactly 25% — coastal box still counts.
    expect(
      weightedMeanValid([0.5, 0.7, null, null, null, null, null, null], ones(8))
    ).toBeCloseTo(0.6);
  });

  it("returns null for an empty grid", () => {
    expect(weightedMeanValid([], [])).toBeNull();
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

  it("normalizes longitudes for a box crossing the antimeridian", () => {
    // A 4°-wide Fiji box in continuous longitudes: 178 → 182.
    const seam = { south: -18, north: -14, west: 178, east: 182 };
    const points = gridPoints(seam, 4);
    expect(points).toHaveLength(16);
    const lons = [...new Set(points.map((p) => p.lon))].sort((a, b) => a - b);
    // Cell centers 178.5, 179.5, 180.5→-179.5, 181.5→-178.5 — both sides of
    // the seam, all in [-180, 180), and symmetric with the equivalent box at
    // Greenwich (the pixel math sees ordinary longitudes).
    expect(lons).toEqual([-179.5, -178.5, 178.5, 179.5]);
    const greenwich = gridPoints({ ...seam, west: -2, east: 2 }, 4);
    expect(greenwich.map((p) => p.lat)).toEqual(points.map((p) => p.lat));
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
    // Calibrated from GIBS colormap metadata (see lib/colormap.ts).
    expect(PROBE_SCALES.lst.calibrated).toBe(true);
    expect(PROBE_SCALES.lst.unit).toBe("K");
    // Terrain's shaded-relief legend stays inversion-ambiguous — honest
    // fraction-of-scale, no fake Kelvin.
    expect(PROBE_SCALES.terrain.calibrated).toBe(false);
  });

  it("maps calibrated physical scales onto real values", () => {
    // Mid-ramp air temperature: 220 + 0.5 × (310 − 220) = 265 K.
    expect(scaleValue(0.5, PROBE_SCALES.airtemp)).toBe(265);
    expect(
      formatProbeValue(
        scaleValue(0.5, PROBE_SCALES.airtemp),
        PROBE_SCALES.airtemp
      )
    ).toBe("265 K");
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

  it("stamps tool version and reproduction URL when provided", () => {
    const stamped = buildProbeCsv(
      {
        ...meta,
        toolVersion: "1.0.0",
        viewUrl:
          "https://zkwizard.github.io/RoamingEye/#layer=ndvi&t=2026-05&probe=-3.4653,-62.2159",
      },
      [{ year: 2001, month: 1 }],
      [0.5]
    );
    expect(stamped).toContain("# tool_version: 1.0.0");
    expect(stamped).toContain(
      "# view_url: https://zkwizard.github.io/RoamingEye/#layer=ndvi&t=2026-05&probe=-3.4653,-62.2159"
    );
    // The stamped link must actually reproduce the view it claims to.
    const hash = stamped.match(/# view_url: [^#\n]*#(.*)/)?.[1] ?? "";
    const restored = decodeViewState(hash);
    expect(restored.layer).toBe("ndvi");
    expect(restored.month).toEqual({ year: 2026, month: 5 });
    expect(restored.probe).toEqual({ lat: -3.4653, lon: -62.2159 });
    // Headers stay optional — a meta without them produces no empty lines.
    expect(csv).not.toContain("# tool_version");
    expect(csv).not.toContain("# view_url");
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

  it("marks an antimeridian-crossing region unambiguously", () => {
    const seamCsv = buildProbeCsv(
      {
        ...meta,
        mode: "region" as const,
        sampledBounds: { south: -18, north: -14, west: 178, east: 182 },
      },
      [{ year: 2001, month: 1 }],
      [0.5]
    );
    // Normalized longitudes, west > east — the RFC 7946 bbox convention.
    expect(seamCsv).toContain(
      "# region: -18.000,178.000,-14.000,-178.000 (S,W,N,E) — crosses the antimeridian (west > east)"
    );
  });
});

describe("dragBounds", () => {
  it("normalizes corners regardless of drag direction", () => {
    const expected = { south: -5, north: 10, west: 20, east: 40 };
    expect(dragBounds({ lat: -5, lon: 20 }, { lat: 10, lon: 40 })).toEqual(
      expected
    );
    expect(dragBounds({ lat: 10, lon: 40 }, { lat: -5, lon: 20 })).toEqual(
      expected
    );
  });

  it("clamps latitudes away from the poles", () => {
    const b = dragBounds({ lat: -89.9, lon: 0 }, { lat: 89.9, lon: 10 });
    expect(b.south).toBe(-85);
    expect(b.north).toBe(85);
  });

  it("takes the short arc across the antimeridian", () => {
    // A drag from 178°E across the seam to 178°W is a 4° box, not 356°.
    const b = dragBounds({ lat: -18, lon: 178 }, { lat: -16, lon: -178 });
    expect(b).toEqual({ south: -18, north: -16, west: 178, east: 182 });
    // Direction-independent, like the non-crossing case.
    expect(dragBounds({ lat: -16, lon: -178 }, { lat: -18, lon: 178 })).toEqual(
      b
    );
    expect(crossesAntimeridian(b)).toBe(true);
  });

  it("leaves wide but non-crossing drags alone", () => {
    const b = dragBounds({ lat: 0, lon: -80 }, { lat: 10, lon: 80 });
    expect(b).toEqual({ south: 0, north: 10, west: -80, east: 80 });
    expect(crossesAntimeridian(b)).toBe(false);
  });
});

describe("normalizeLon", () => {
  it("wraps continuous longitudes into [-180, 180)", () => {
    expect(normalizeLon(181)).toBe(-179);
    expect(normalizeLon(-181)).toBe(179);
    expect(normalizeLon(360)).toBe(0);
    expect(normalizeLon(540)).toBe(-180);
    expect(normalizeLon(179.5)).toBe(179.5);
    expect(normalizeLon(-180)).toBe(-180);
  });
});

describe("boundsUsable", () => {
  it("rejects stray clicks and accepts real boxes", () => {
    expect(boundsUsable({ south: 0, north: 0.05, west: 0, east: 0.05 })).toBe(
      false
    );
    expect(boundsUsable({ south: 0, north: 1, west: 0, east: 0.1 })).toBe(
      false
    );
    expect(boundsUsable({ south: 0, north: 1, west: 0, east: 1 })).toBe(true);
  });
});

describe("regionGridSize", () => {
  it("scales with the box span within bounds", () => {
    expect(regionGridSize({ south: 0, north: 1, west: 0, east: 1 })).toBe(8); // small boxes stay dense
    expect(regionGridSize({ south: 0, north: 4, west: 0, east: 4 })).toBe(16);
    expect(regionGridSize({ south: -20, north: 20, west: -30, east: 30 })).toBe(
      28
    ); // continental boxes cap
  });

  it("uses the larger of the two spans", () => {
    expect(regionGridSize({ south: 0, north: 0.5, west: 0, east: 5 })).toBe(20);
  });
});
