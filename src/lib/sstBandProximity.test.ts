import { describe, expect, it } from "vitest";
import {
  summarizeOceanConditions,
  type SeaSurfaceTemperatureBand,
  type SeaSurfaceTemperatureObservation,
} from "./oceanConditions";
import {
  DEFAULT_NEAR_BOUNDARY_MARGIN,
  SEA_SURFACE_TEMPERATURE_BANDS,
  summarizeSstBandProximity,
} from "./sstBandProximity";
import type { YearMonth } from "./timeline";

const MONTH: YearMonth = { year: 2023, month: 7 };

function water(
  value: number | null,
  overrides: Partial<SeaSurfaceTemperatureObservation> = {}
): SeaSurfaceTemperatureObservation {
  return {
    dataMonth: MONTH,
    value,
    validFraction: 1,
    footprint: "water",
    ...overrides,
  };
}

function proximityFor(
  value: number | null,
  overrides?: Partial<SeaSurfaceTemperatureObservation>,
  margin?: number
) {
  return summarizeSstBandProximity(
    summarizeOceanConditions(water(value, overrides)),
    margin === undefined ? undefined : { nearBoundaryMargin: margin }
  );
}

/** Resolve a band from the exported table's half-open intervals. */
function bandForValueViaTable(value: number): SeaSurfaceTemperatureBand | null {
  for (const def of SEA_SURFACE_TEMPERATURE_BANDS) {
    const lowerOk = def.lowerThreshold === null || value >= def.lowerThreshold;
    const upperOk = def.upperThreshold === null || value < def.upperThreshold;
    if (lowerOk && upperOk) return def.band;
  }
  return null;
}

describe("summarizeSstBandProximity", () => {
  it("reports distances to both band edges for an interior value", () => {
    const summary = proximityFor(15);
    expect(summary.status).toBe("usable");
    expect(summary.band).toBe("temperate");
    expect(summary.observedValue).toBe(15);
    expect(summary.distanceToWarmerBoundary).toBe(5);
    expect(summary.distanceToCoolerBoundary).toBe(5);
    expect(summary.position).toBe("interior");
    // Equal distances resolve deterministically toward the warmer boundary.
    expect(summary.nearestBoundary).toEqual({
      thresholdValue: 20,
      distance: 5,
      direction: "warmer",
      neighborBand: "warm",
    });
  });

  it("flags a value close to the warmer boundary", () => {
    const summary = proximityFor(19.5);
    expect(summary.position).toBe("near-boundary");
    expect(summary.nearestBoundary).toEqual({
      thresholdValue: 20,
      distance: 0.5,
      direction: "warmer",
      neighborBand: "warm",
    });
    expect(summary.distanceToCoolerBoundary).toBe(9.5);
  });

  it("flags a value close to the cooler boundary", () => {
    const summary = proximityFor(10.2);
    expect(summary.position).toBe("near-boundary");
    expect(summary.nearestBoundary).toEqual({
      thresholdValue: 10,
      distance: 0.2,
      direction: "cooler",
      neighborBand: "cool",
    });
  });

  it("rounds floating-point subtraction noise to 0.001 °C", () => {
    const summary = proximityFor(19.9);
    // 20 - 19.9 is 0.09999999999999787 in IEEE-754; it must report as 0.1.
    expect(summary.distanceToWarmerBoundary).toBe(0.1);
    expect(summary.distanceToCoolerBoundary).toBe(9.9);
    expect(summary.position).toBe("near-boundary");
  });

  it("treats a value exactly at a threshold as sitting on that (cooler) edge", () => {
    const summary = proximityFor(10);
    expect(summary.band).toBe("temperate");
    expect(summary.distanceToCoolerBoundary).toBe(0);
    expect(summary.nearestBoundary?.direction).toBe("cooler");
    expect(summary.nearestBoundary?.neighborBand).toBe("cool");
    expect(summary.position).toBe("near-boundary");
  });

  it("leaves the cold open side of the coldest band without a cooler boundary", () => {
    const summary = proximityFor(1);
    expect(summary.band).toBe("near-freezing");
    expect(summary.distanceToCoolerBoundary).toBeNull();
    expect(summary.distanceToWarmerBoundary).toBe(1);
    expect(summary.nearestBoundary).toEqual({
      thresholdValue: 2,
      distance: 1,
      direction: "warmer",
      neighborBand: "cool",
    });
    expect(summary.position).toBe("near-boundary");
  });

  it("leaves the warm open side of the warmest band without a warmer boundary", () => {
    const summary = proximityFor(30);
    expect(summary.band).toBe("very-warm");
    expect(summary.distanceToWarmerBoundary).toBeNull();
    expect(summary.distanceToCoolerBoundary).toBe(2);
    expect(summary.nearestBoundary?.direction).toBe("cooler");
    expect(summary.nearestBoundary?.neighborBand).toBe("warm");
    expect(summary.position).toBe("interior");
  });

  it("honours a caller-supplied near-boundary margin", () => {
    expect(proximityFor(15, undefined, 5).position).toBe("near-boundary");
    expect(proximityFor(15, undefined, 4).position).toBe("interior");
  });

  it("falls back to the default margin for an invalid one", () => {
    const summary = proximityFor(19.5, undefined, -5);
    expect(summary.nearBoundaryMargin).toBe(DEFAULT_NEAR_BOUNDARY_MARGIN);
    expect(summary.position).toBe("near-boundary");
  });

  it("passes a land footprint through as not-usable without inventing a value", () => {
    const summary = proximityFor(15, { footprint: "land" });
    expect(summary.status).toBe("not-usable");
    expect(summary.reason).toBe("land-footprint");
    expect(summary.band).toBeNull();
    expect(summary.observedValue).toBeNull();
    expect(summary.distanceToWarmerBoundary).toBeNull();
    expect(summary.distanceToCoolerBoundary).toBeNull();
    expect(summary.nearestBoundary).toBeNull();
    expect(summary.position).toBeNull();
  });

  it("passes a missing value through as not-usable with its coverage reason", () => {
    const summary = proximityFor(null);
    expect(summary.status).toBe("not-usable");
    expect(summary.reason).toBe("missing-sst-value");
  });

  it("passes an out-of-range value through as not-usable", () => {
    const summary = proximityFor(40);
    expect(summary.status).toBe("not-usable");
    expect(summary.reason).toBe("invalid-value");
    expect(summary.observedValue).toBeNull();
  });

  it("preserves provenance and never presents as a forecast", () => {
    const summary = proximityFor(22);
    expect(summary.isForecast).toBe(false);
    expect(summary.claimScope).toBe("descriptive-band-proximity-only");
    expect(summary.metric.source.shortName).toBeTruthy();
    expect(summary.metric.source.version).toBeTruthy();
    expect(summary.limitations.length).toBeGreaterThan(0);
  });
});

describe("SEA_SURFACE_TEMPERATURE_BANDS", () => {
  it("stays consistent with oceanConditions' canonical band thresholds", () => {
    // Drift guard: for every value across the valid SST range, the exported
    // table must resolve to the same band as summarizeOceanConditions.
    for (
      let value = 0;
      value <= 32;
      value = Math.round((value + 0.25) * 100) / 100
    ) {
      const canonical = summarizeOceanConditions(water(value)).temperatureBand;
      expect(bandForValueViaTable(value)).toBe(canonical);
    }
    // Explicit threshold points, exercised without floating-point stepping.
    for (const threshold of [2, 10, 20, 28]) {
      const canonical = summarizeOceanConditions(
        water(threshold)
      ).temperatureBand;
      expect(bandForValueViaTable(threshold)).toBe(canonical);
    }
  });

  it("forms a contiguous coldest→warmest chain with matched neighbours", () => {
    for (let i = 0; i < SEA_SURFACE_TEMPERATURE_BANDS.length; i += 1) {
      const def = SEA_SURFACE_TEMPERATURE_BANDS[i];
      const cooler = SEA_SURFACE_TEMPERATURE_BANDS[i - 1] ?? null;
      const warmer = SEA_SURFACE_TEMPERATURE_BANDS[i + 1] ?? null;
      expect(def.coolerNeighbor).toBe(cooler ? cooler.band : null);
      expect(def.warmerNeighbor).toBe(warmer ? warmer.band : null);
      if (cooler) expect(def.lowerThreshold).toBe(cooler.upperThreshold);
      else expect(def.lowerThreshold).toBeNull();
      if (!warmer) expect(def.upperThreshold).toBeNull();
    }
  });
});
