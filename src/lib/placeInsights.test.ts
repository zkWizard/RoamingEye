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
});
