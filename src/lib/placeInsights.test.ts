import { describe, expect, it } from "vitest";
import {
  PLACE_COLORMAP_DOCS,
  PLACE_METRICS,
  latestComparisonMonths,
  nativePlaceSampleValues,
  placeInsightPhysicalReading,
  placeInsightReading,
} from "./placeInsights";
import type { YearMonth } from "./timeline";

describe("place insights", () => {
  it("binds vegetation sampling to the MOD13A3 rendered colormap", () => {
    expect(PLACE_COLORMAP_DOCS.ndvi).toBe("MODIS_L3_NDVI");
  });

  it("withholds rendered vegetation positions from native-value exports", () => {
    expect(nativePlaceSampleValues([0, 0.5, 1, null], "display-ramp")).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });

  it("preserves values decoded through authoritative physical colormaps", () => {
    expect(
      nativePlaceSampleValues([0.0001, null], "authoritative-colormap")
    ).toEqual([0.0001, null]);
  });

  it("uses each product's own latest two months", () => {
    expect(latestComparisonMonths("precip")).toEqual([
      { year: 2025, month: 12 },
      { year: 2026, month: 1 },
    ]);
    expect(latestComparisonMonths("ndvi")).not.toBeNull();
  });

  it("reports rainfall as a monthly total and compares it month over month", () => {
    const rainfall = PLACE_METRICS.find((metric) => metric.id === "rainfall");
    if (!rainfall) throw new Error("rainfall metric missing");
    expect(
      placeInsightReading(
        rainfall,
        [
          { year: 2025, month: 12 },
          { year: 2026, month: 1 },
        ],
        [0.1, 0.2]
      )
    ).toEqual({
      id: "rainfall",
      value: "268 mm",
      detail: "+134 mm vs Dec 2025 · Jan 2026",
    });
  });

  it("uses the physical GLDAS rainfall rate when NASA's colormap is available", () => {
    const rainfall = PLACE_METRICS.find((metric) => metric.id === "rainfall");
    if (!rainfall) throw new Error("rainfall metric missing");
    expect(
      placeInsightPhysicalReading(
        rainfall,
        [
          { year: 2025, month: 12 },
          { year: 2026, month: 1 },
        ],
        [4.32, 8.64]
      )
    ).toEqual({
      id: "rainfall",
      value: "268 mm",
      detail: "+134 mm vs Dec 2025 · Jan 2026",
    });
  });

  it("says how much of a rainfall step is month length, not weather", () => {
    const rainfall = PLACE_METRICS.find((metric) => metric.id === "rainfall");
    if (!rainfall) throw new Error("rainfall metric missing");
    // 3.0 mm/day in February, 2.8 mm/day in March: the total rises 3 mm only
    // because March is three days longer. Reported as wetter, unqualified, it
    // would invert what the rain actually did.
    expect(
      placeInsightPhysicalReading(
        rainfall,
        [
          { year: 2026, month: 2 },
          { year: 2026, month: 3 },
        ],
        [3, 87 / 31]
      )
    ).toEqual({
      id: "rainfall",
      value: "87 mm",
      detail:
        "+3 mm vs Feb 2026 · Mar 2026; +9 mm of that is 28 d → 31 d month length, and the daily rate moved the other way (3.0 → 2.8 mm/day)",
    });
  });

  it("leaves non-rainfall metrics free of month-length qualification", () => {
    const air = PLACE_METRICS.find((metric) => metric.id === "air");
    if (!air) throw new Error("air metric missing");
    expect(
      placeInsightPhysicalReading(
        air,
        [
          { year: 2026, month: 2 },
          { year: 2026, month: 3 },
        ],
        [283.15, 285.15]
      ).detail
    ).toBe("+2.0 C vs Feb 2026 · Mar 2026");
  });

  it("preserves native NDVI values decoded from NASA's colormap", () => {
    const vegetation = PLACE_METRICS.find(
      (metric) => metric.id === "vegetation"
    );
    if (!vegetation) throw new Error("vegetation metric missing");
    expect(
      placeInsightPhysicalReading(
        vegetation,
        [
          { year: 2026, month: 1 },
          { year: 2026, month: 2 },
        ],
        [-0.15, 0.34]
      )
    ).toEqual({
      id: "vegetation",
      value: "0.34",
      detail:
        "Greening +0.49 NDVI vs Jan 2026 · Feb 2026 · annual cycle not removed",
    });
  });

  it("renders air temperature in Celsius and reports missing coverage honestly", () => {
    const air = PLACE_METRICS.find((metric) => metric.id === "air");
    if (!air) throw new Error("air metric missing");
    expect(
      placeInsightReading(
        air,
        [
          { year: 2026, month: 2 },
          { year: 2026, month: 3 },
        ],
        [0.5, 0.6]
      )
    ).toEqual({
      id: "air",
      value: "0.9 C",
      detail: "+9.0 C vs Feb 2026 · Mar 2026",
    });
    expect(
      placeInsightReading(
        air,
        [
          { year: 2026, month: 2 },
          { year: 2026, month: 3 },
        ],
        [0.5, null]
      )
    ).toEqual({
      id: "air",
      value: "Unavailable",
      detail: "No usable Mar 2026 coverage",
    });
  });
  it("qualifies the vegetation card's month-over-month NDVI step", () => {
    const vegetation = PLACE_METRICS.find(
      (metric) => metric.id === "vegetation"
    );
    if (!vegetation) throw new Error("vegetation metric missing");
    const months: [YearMonth, YearMonth] = [
      { year: 2026, month: 1 },
      { year: 2026, month: 2 },
    ];

    // A step beyond the stability band is named as an index direction, and the
    // reading always says the annual cycle has not been removed so the number
    // cannot be read as an anomaly against a baseline.
    expect(placeInsightReading(vegetation, months, [0.3, 0.5])).toEqual({
      id: "vegetation",
      value: "0.50",
      detail:
        "Greening +0.20 NDVI vs Jan 2026 · Feb 2026 · annual cycle not removed",
    });
    expect(placeInsightReading(vegetation, months, [0.5, 0.3]).detail).toBe(
      "Browning -0.20 NDVI vs Jan 2026 · Feb 2026 · annual cycle not removed"
    );

    // A difference inside the band is not a detected change. This used to be
    // printed as a bare signed delta indistinguishable from composite noise.
    expect(placeInsightReading(vegetation, months, [0.5, 0.52]).detail).toBe(
      "Little change (+0.02 NDVI, within the 0.05 stability band) vs Jan 2026 · Feb 2026 · annual cycle not removed"
    );
  });

  it("withholds a vegetation comparison the two sampled months cannot support", () => {
    const vegetation = PLACE_METRICS.find(
      (metric) => metric.id === "vegetation"
    );
    if (!vegetation) throw new Error("vegetation metric missing");

    // Non-adjacent months are still reported as a single-month regional mean —
    // the value is real — but nothing is labelled "month over month".
    const gapped = placeInsightReading(
      vegetation,
      [
        { year: 2025, month: 2 },
        { year: 2026, month: 2 },
      ],
      [0.3, 0.5]
    );
    expect(gapped.value).toBe("0.50");
    expect(gapped.detail).toBe(
      "Feb 2026 regional mean; Feb 2025 is not the preceding month, so no month-over-month change is reported"
    );

    // NDVI is bounded by its own definition, so an out-of-range decode is
    // withheld rather than shown as a greenness reading.
    expect(
      placeInsightPhysicalReading(
        vegetation,
        [
          { year: 2026, month: 1 },
          { year: 2026, month: 2 },
        ],
        [0.3, 1.4]
      )
    ).toEqual({
      id: "vegetation",
      value: "Unavailable",
      detail: "Feb 2026 value is outside the valid -1 to 1 NDVI range",
    });
    expect(
      placeInsightPhysicalReading(
        vegetation,
        [
          { year: 2026, month: 1 },
          { year: 2026, month: 2 },
        ],
        [1.4, 0.5]
      ).detail
    ).toBe(
      "Feb 2026 regional mean; Jan 2026 is outside the valid -1 to 1 NDVI range and was not compared"
    );
  });

  it("keeps sampling provenance on every vegetation comparison outcome", () => {
    const vegetation = PLACE_METRICS.find(
      (metric) => metric.id === "vegetation"
    );
    if (!vegetation) throw new Error("vegetation metric missing");
    const provenance = {
      validFractions: [1, 0.6],
      sourceImageDimensions: { width: 512, height: 512 },
    };
    const suffix =
      "Feb 2026: 60% sampled coverage; rendered source image 512 x 512 px; approximate regional mean";

    for (const values of [
      [0.3, 0.5],
      [0.5, 0.52],
    ]) {
      expect(
        placeInsightReading(
          vegetation,
          [
            { year: 2026, month: 1 },
            { year: 2026, month: 2 },
          ],
          values,
          provenance
        ).detail
      ).toContain(suffix);
    }
    expect(
      placeInsightReading(
        vegetation,
        [
          { year: 2025, month: 2 },
          { year: 2026, month: 2 },
        ],
        [0.3, 0.5],
        provenance
      ).detail
    ).toContain(suffix);
  });

  it("leaves the other place metrics differencing unconditionally", () => {
    // The stability band and adjacency rule are NDVI-specific; applying them to
    // rainfall, soil moisture, or air temperature would be unfounded.
    const air = PLACE_METRICS.find((metric) => metric.id === "air");
    if (!air) throw new Error("air metric missing");
    expect(
      placeInsightReading(
        air,
        [
          { year: 2025, month: 2 },
          { year: 2026, month: 2 },
        ],
        [0.5, 0.501]
      ).detail
    ).toBe("+0.1 C vs Feb 2025 · Feb 2026");
  });

  it("ties small and large regional means to coverage and rendered-image provenance", () => {
    const vegetation = PLACE_METRICS.find(
      (metric) => metric.id === "vegetation"
    );
    if (!vegetation) throw new Error("vegetation metric missing");
    const months: [
      { year: number; month: number },
      { year: number; month: number },
    ] = [
      { year: 2026, month: 1 },
      { year: 2026, month: 2 },
    ];

    expect(
      placeInsightReading(vegetation, months, [0.3, 0.4], {
        validFractions: [1, 1],
        sourceImageDimensions: { width: 512, height: 512 },
      }).detail
    ).toContain(
      "Feb 2026: 100% sampled coverage; rendered source image 512 x 512 px; approximate regional mean"
    );
    expect(
      placeInsightReading(vegetation, months, [0.3, 0.4], {
        validFractions: [0.8, 0.76],
        sourceImageDimensions: { width: 1024, height: 512 },
      }).detail
    ).toContain(
      "Feb 2026: 76% sampled coverage; rendered source image 1024 x 512 px; approximate regional mean"
    );
  });

  it("makes partial coastal and missing regional coverage explicit", () => {
    const vegetation = PLACE_METRICS.find(
      (metric) => metric.id === "vegetation"
    );
    if (!vegetation) throw new Error("vegetation metric missing");
    const months: [
      { year: number; month: number },
      { year: number; month: number },
    ] = [
      { year: 2026, month: 1 },
      { year: 2026, month: 2 },
    ];
    const provenance = {
      validFractions: [0.9, 0.25],
      sourceImageDimensions: { width: 512, height: 512 },
    };

    expect(
      placeInsightReading(vegetation, months, [0.3, 0.4], provenance).detail
    ).toContain("Feb 2026: 25% sampled coverage");
    expect(
      placeInsightReading(vegetation, months, [0.3, null], provenance).detail
    ).toContain("No usable Feb 2026 coverage; 25% sampled coverage");
  });

  it("does not present a single in-boundary fallback sample as a regional mean", () => {
    const vegetation = PLACE_METRICS.find(
      (metric) => metric.id === "vegetation"
    );
    if (!vegetation) throw new Error("vegetation metric missing");
    const detail = placeInsightReading(
      vegetation,
      [
        { year: 2026, month: 1 },
        { year: 2026, month: 2 },
      ],
      [0.3, 0.4],
      {
        validFractions: [1, 1],
        sourceImageDimensions: { width: 512, height: 512 },
        geometrySamplingStrategy: "boundary-point",
      }
    ).detail;
    expect(detail).toContain("single in-boundary image sample has data");
    expect(detail).toContain(
      "single boundary point estimate, not a regional mean"
    );
    expect(detail).not.toContain("100% sampled coverage");
  });
});
