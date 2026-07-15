import { describe, expect, it } from "vitest";
import { SEA_SURFACE_TEMPERATURE_METRIC } from "./oceanConditions";
import { compareSstToSeasonalBaseline } from "./oceanSeasonalBaseline";
import {
  contextualizeOceanSeasonalAnomaly,
  OCEAN_ANOMALY_MAGNITUDE_BAND_THRESHOLDS,
  type OceanAnomalyMagnitudeBand,
  type OceanSeasonalAnomalyContext,
} from "./oceanSeasonalAnomalyContext";
import type { SeaSurfaceTemperatureObservation } from "./oceanConditions";
import {
  DEFAULT_ANOMALY_NEAR_BOUNDARY_MARGIN,
  OCEAN_ANOMALY_MAGNITUDE_BANDS,
  describeOceanSeasonalAnomalyBandProximity,
  summarizeOceanSeasonalAnomalyBandProximity,
} from "./oceanSeasonalAnomalyBandProximity";

/** Classify |z| into a band with the same rule the context module uses. */
function bandFor(standardizedAnomaly: number): OceanAnomalyMagnitudeBand {
  const m = Math.abs(standardizedAnomaly);
  if (m < OCEAN_ANOMALY_MAGNITUDE_BAND_THRESHOLDS.beyondTypicalSpread)
    return "within-typical-spread";
  if (m < OCEAN_ANOMALY_MAGNITUDE_BAND_THRESHOLDS.wellBeyondTypicalSpread)
    return "beyond-typical-spread";
  return "well-beyond-typical-spread";
}

/**
 * A minimal available context fixture at a chosen standardized anomaly, with a
 * band kept consistent with that value. Used to hit precise |z| positions the
 * baseline arithmetic would make fiddly to reproduce.
 */
function context(
  standardizedAnomaly: number,
  extra: Partial<OceanSeasonalAnomalyContext> = {}
): OceanSeasonalAnomalyContext {
  return {
    kind: "standardized-sea-surface-temperature-anomaly",
    isForecast: false,
    claimScope: "descriptive-sea-surface-temperature-only",
    status: "available",
    metric: SEA_SURFACE_TEMPERATURE_METRIC,
    source: SEA_SURFACE_TEMPERATURE_METRIC.source,
    dataMonth: { year: 2023, month: 6 },
    calendarMonth: 6,
    footprint: "water",
    anomaly: standardizedAnomaly,
    anomalyUnit: "°C",
    baselineStandardDeviation: 1,
    baselineSampleCount: 10,
    standardizedAnomaly,
    direction:
      standardizedAnomaly > 0
        ? "warmer"
        : standardizedAnomaly < 0
          ? "cooler"
          : "comparable",
    magnitudeBand: bandFor(standardizedAnomaly),
    reason: null,
    ...extra,
  };
}

function sst(
  year: number,
  month: number,
  value: number | null
): SeaSurfaceTemperatureObservation {
  return {
    dataMonth: { year, month },
    value,
    footprint: "water",
    validFraction: 0.9,
  };
}

describe("summarizeOceanSeasonalAnomalyBandProximity", () => {
  it("flags a reading just past the inner edge as near-boundary", () => {
    const summary = summarizeOceanSeasonalAnomalyBandProximity(context(1.1));

    expect(summary).toMatchObject({
      kind: "standardized-sst-anomaly-band-proximity",
      isForecast: false,
      claimScope: "descriptive-sea-surface-temperature-only",
      status: "usable",
      band: "beyond-typical-spread",
      footprint: "water",
      position: "near-boundary",
      reason: null,
    });
    expect(summary.standardizedMagnitude).toBe(1.1);
    // Edge at |z| = 1 is the less-extreme neighbour (within-typical-spread).
    expect(summary.distanceToLessExtremeBoundary).toBe(0.1);
    expect(summary.distanceToMoreExtremeBoundary).toBe(0.9);
    expect(summary.nearestBoundary).toEqual({
      thresholdMagnitude: 1,
      distance: 0.1,
      direction: "less-extreme",
      neighborBand: "within-typical-spread",
    });
    // Provenance is carried through, never dropped.
    expect(summary.source).toBe(SEA_SURFACE_TEMPERATURE_METRIC.source);
  });

  it("uses the negative anomaly's magnitude and breaks a midpoint tie toward the more-extreme edge", () => {
    // |z| = 1.5 is exactly midway between the |z| = 1 and |z| = 2 edges.
    const summary = summarizeOceanSeasonalAnomalyBandProximity(context(-1.5));

    expect(summary.band).toBe("beyond-typical-spread");
    expect(summary.standardizedMagnitude).toBe(1.5);
    expect(summary.distanceToLessExtremeBoundary).toBe(0.5);
    expect(summary.distanceToMoreExtremeBoundary).toBe(0.5);
    // Tie resolves toward the more-extreme edge so extremity is never understated.
    expect(summary.nearestBoundary?.direction).toBe("more-extreme");
    expect(summary.nearestBoundary?.neighborBand).toBe(
      "well-beyond-typical-spread"
    );
    // 0.5 > default margin 0.25, so the label is comfortably interior.
    expect(summary.position).toBe("interior");
  });

  it("reports only a more-extreme edge in the innermost band", () => {
    const summary = summarizeOceanSeasonalAnomalyBandProximity(context(0.9));

    expect(summary.band).toBe("within-typical-spread");
    expect(summary.distanceToLessExtremeBoundary).toBeNull();
    expect(summary.distanceToMoreExtremeBoundary).toBe(0.1);
    expect(summary.nearestBoundary).toEqual({
      thresholdMagnitude: 1,
      distance: 0.1,
      direction: "more-extreme",
      neighborBand: "beyond-typical-spread",
    });
    expect(summary.position).toBe("near-boundary");
  });

  it("reports only a less-extreme edge in the outermost band", () => {
    const summary = summarizeOceanSeasonalAnomalyBandProximity(context(2.1));

    expect(summary.band).toBe("well-beyond-typical-spread");
    expect(summary.distanceToMoreExtremeBoundary).toBeNull();
    expect(summary.distanceToLessExtremeBoundary).toBe(0.1);
    expect(summary.nearestBoundary).toEqual({
      thresholdMagnitude: 2,
      distance: 0.1,
      direction: "less-extreme",
      neighborBand: "beyond-typical-spread",
    });
    expect(summary.position).toBe("near-boundary");
  });

  it("treats a reading deep inside its band as interior", () => {
    const summary = summarizeOceanSeasonalAnomalyBandProximity(context(0.2));

    expect(summary.band).toBe("within-typical-spread");
    expect(summary.distanceToMoreExtremeBoundary).toBe(0.8);
    expect(summary.position).toBe("interior");
  });

  it("passes an unavailable context through honestly with no distances", () => {
    const flat = context(0, {
      status: "unavailable",
      standardizedAnomaly: null,
      magnitudeBand: null,
      direction: null,
      reason: "no-baseline-variability",
    });
    const summary = summarizeOceanSeasonalAnomalyBandProximity(flat);

    expect(summary.status).toBe("not-usable");
    expect(summary.reason).toBe("no-baseline-variability");
    expect(summary.band).toBeNull();
    expect(summary.standardizedAnomaly).toBeNull();
    expect(summary.standardizedMagnitude).toBeNull();
    expect(summary.distanceToMoreExtremeBoundary).toBeNull();
    expect(summary.distanceToLessExtremeBoundary).toBeNull();
    expect(summary.nearestBoundary).toBeNull();
    expect(summary.position).toBeNull();
    // Footprint and provenance still travel with the passthrough.
    expect(summary.footprint).toBe("water");
    expect(summary.source).toBe(SEA_SURFACE_TEMPERATURE_METRIC.source);
  });

  it("honours a caller margin and falls back to the default on an invalid one", () => {
    const tight = summarizeOceanSeasonalAnomalyBandProximity(context(0.9), {
      nearBoundaryMargin: 0.05,
    });
    // 0.1 from the edge now exceeds the 0.05 margin.
    expect(tight.nearBoundaryMargin).toBe(0.05);
    expect(tight.position).toBe("interior");

    const bad = summarizeOceanSeasonalAnomalyBandProximity(context(0.9), {
      nearBoundaryMargin: -1,
    });
    expect(bad.nearBoundaryMargin).toBe(DEFAULT_ANOMALY_NEAR_BOUNDARY_MARGIN);
    expect(bad.position).toBe("near-boundary");
  });

  it("stays in step with the real baseline→context pipeline", () => {
    // Ten Junes, mean 20 °C; target 3 °C warmer (the context-module fixture).
    const values = [17, 18, 19, 20, 20, 20, 21, 22, 23, 20];
    const comparison = compareSstToSeasonalBaseline(
      sst(2023, 6, 23),
      values.map((value, index) => sst(2010 + index, 6, value)),
      { minimumSamples: 10 }
    );
    const ctx = contextualizeOceanSeasonalAnomaly(comparison);
    expect(ctx.status).toBe("available");

    const summary = summarizeOceanSeasonalAnomalyBandProximity(ctx);
    // The proximity band is exactly the context's own band — no re-derivation.
    expect(summary.band).toBe(ctx.magnitudeBand);
    expect(summary.standardizedMagnitude).toBe(
      Math.round(Math.abs(ctx.standardizedAnomaly as number) * 1000) / 1000
    );
    expect(summary.source).toBe(ctx.source);
    // Inside the middle band, the two edge distances span the full band width (1).
    if (summary.band === "beyond-typical-spread") {
      const sum =
        (summary.distanceToLessExtremeBoundary as number) +
        (summary.distanceToMoreExtremeBoundary as number);
      expect(sum).toBeCloseTo(1, 6);
    }
  });
});

describe("OCEAN_ANOMALY_MAGNITUDE_BANDS", () => {
  it("uses the shared thresholds as the single source of truth", () => {
    const within = OCEAN_ANOMALY_MAGNITUDE_BANDS.find(
      (b) => b.band === "within-typical-spread"
    );
    const beyond = OCEAN_ANOMALY_MAGNITUDE_BANDS.find(
      (b) => b.band === "beyond-typical-spread"
    );
    const well = OCEAN_ANOMALY_MAGNITUDE_BANDS.find(
      (b) => b.band === "well-beyond-typical-spread"
    );

    expect(within?.lowerThreshold).toBeNull();
    expect(within?.upperThreshold).toBe(
      OCEAN_ANOMALY_MAGNITUDE_BAND_THRESHOLDS.beyondTypicalSpread
    );
    expect(beyond?.lowerThreshold).toBe(
      OCEAN_ANOMALY_MAGNITUDE_BAND_THRESHOLDS.beyondTypicalSpread
    );
    expect(beyond?.upperThreshold).toBe(
      OCEAN_ANOMALY_MAGNITUDE_BAND_THRESHOLDS.wellBeyondTypicalSpread
    );
    expect(well?.lowerThreshold).toBe(
      OCEAN_ANOMALY_MAGNITUDE_BAND_THRESHOLDS.wellBeyondTypicalSpread
    );
    expect(well?.upperThreshold).toBeNull();
  });

  it("each definition's half-open interval agrees with bandFor at its edges", () => {
    for (const definition of OCEAN_ANOMALY_MAGNITUDE_BANDS) {
      if (definition.lowerThreshold !== null) {
        // At the lower edge the band starts (inclusive).
        expect(bandFor(definition.lowerThreshold)).toBe(definition.band);
      }
      if (definition.upperThreshold !== null) {
        // Just below the upper edge is still this band; at it, the next band.
        expect(bandFor(definition.upperThreshold - 1e-9)).toBe(definition.band);
        expect(bandFor(definition.upperThreshold)).not.toBe(definition.band);
      }
    }
  });
});

describe("describeOceanSeasonalAnomalyBandProximity", () => {
  it("calls out a marginal band label near an edge and cites the source", () => {
    const sentence = describeOceanSeasonalAnomalyBandProximity(
      summarizeOceanSeasonalAnomalyBandProximity(context(1.05))
    );

    expect(sentence).toContain("Jun 2023");
    expect(sentence).toContain("beyond the typical year-to-year spread");
    expect(sentence).toContain("marginal");
    expect(sentence).toContain("could flip");
    expect(sentence).toContain(
      `Source: ${SEA_SURFACE_TEMPERATURE_METRIC.source.shortName}`
    );
    expect(sentence).toContain("not a probability");
  });

  it("describes an interior reading as comfortably inside its band", () => {
    const sentence = describeOceanSeasonalAnomalyBandProximity(
      summarizeOceanSeasonalAnomalyBandProximity(context(1.5))
    );
    expect(sentence).toContain("comfortably inside the band");
    expect(sentence).not.toContain("marginal");
  });

  it("states not-usable cases honestly", () => {
    const flat = context(0, {
      status: "unavailable",
      standardizedAnomaly: null,
      magnitudeBand: null,
      reason: "insufficient-baseline-spread",
    });
    const sentence = describeOceanSeasonalAnomalyBandProximity(
      summarizeOceanSeasonalAnomalyBandProximity(flat)
    );
    expect(sentence).toContain("no band proximity is reported");
    expect(sentence).toContain("insufficient-baseline-spread");
  });

  it("guards an invalid month instead of formatting garbage", () => {
    const sentence = describeOceanSeasonalAnomalyBandProximity(
      summarizeOceanSeasonalAnomalyBandProximity(
        context(1.05, { dataMonth: { year: 2023, month: 13 } })
      )
    );
    expect(sentence).toContain("an invalid month");
  });
});
