import { describe, expect, it } from "vitest";
import {
  PLACE_METRICS,
  latestComparisonMonths,
  placeInsightPhysicalReading,
  placeInsightReading,
} from "./placeInsights";

describe("place insights", () => {
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
