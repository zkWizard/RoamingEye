import { describe, it, expect } from "vitest";
import {
  seismicIntereventTimeDistribution,
  BURSTINESS_REFERENCE,
  POISSON_BURSTINESS_BAND,
} from "./seismicIntereventTime";
import { SEISMICITY_SOURCE } from "./earthquakes";
import type { Earthquake } from "./earthquakes";

/** Event at a given UTC epoch time (ms); other fields are irrelevant here. */
const quakeAt = (
  time: number,
  extra: Partial<Earthquake> = {}
): Earthquake => ({
  lat: 0,
  lon: 0,
  depthKm: 10,
  magnitude: 5,
  time,
  place: "somewhere",
  ...extra,
});

/** Build events from second offsets so the intervals are easy to reason about. */
const quakesFromSeconds = (offsetsSeconds: readonly number[]): Earthquake[] =>
  offsetsSeconds.map((seconds) => quakeAt(1_750_000_000_000 + seconds * 1000));

describe("seismicIntereventTimeDistribution", () => {
  it("reports interval order statistics and mean in seconds", () => {
    // Events at t = 0, 10, 30, 60 s → intervals 10, 20, 30 s.
    const result = seismicIntereventTimeDistribution(
      quakesFromSeconds([0, 10, 30, 60])
    );
    expect(result.usableEventCount).toBe(4);
    expect(result.intervals).toMatchObject({
      count: 3,
      minSeconds: 10,
      medianSeconds: 20,
      maxSeconds: 30,
      meanSeconds: 20,
    });
  });

  it("gives an evenly spaced sequence Cv 0, burstiness −1 and a quasi-regular label", () => {
    // Perfectly periodic: intervals all 100 s → σ = 0, Cv = 0, B = −1.
    const result = seismicIntereventTimeDistribution(
      quakesFromSeconds([0, 100, 200, 300, 400])
    );
    expect(result.intervals?.standardDeviationSeconds).toBe(0);
    expect(result.intervals?.coefficientOfVariation).toBe(0);
    expect(result.intervals?.burstiness).toBe(-1);
    expect(result.intervals?.regularity).toBe("quasi-regular");
  });

  it("labels a strongly over-dispersed sequence as clustered with positive burstiness", () => {
    // One long quiet gap then a tight burst → Cv > 1, B > 0.
    const result = seismicIntereventTimeDistribution(
      quakesFromSeconds([0, 1000, 1001, 1002, 1003])
    );
    const cv = result.intervals?.coefficientOfVariation ?? 0;
    const b = result.intervals?.burstiness ?? 0;
    expect(cv).toBeGreaterThan(1);
    expect(b).toBeGreaterThan(POISSON_BURSTINESS_BAND);
    expect(result.intervals?.regularity).toBe("clustered");
  });

  it("computes Cv and burstiness consistent with their definitions", () => {
    // Intervals 10 and 30 s: μ = 20, σ = 10 (population), Cv = 0.5,
    // B = (0.5 − 1)/(0.5 + 1) = −1/3.
    const result = seismicIntereventTimeDistribution(
      quakesFromSeconds([0, 10, 40])
    );
    expect(result.intervals?.meanSeconds).toBe(20);
    expect(result.intervals?.standardDeviationSeconds).toBe(10);
    expect(result.intervals?.coefficientOfVariation).toBeCloseTo(0.5, 12);
    expect(result.intervals?.burstiness).toBeCloseTo(-1 / 3, 12);
    expect(result.intervals?.regularity).toBe("quasi-regular");
  });

  it("is independent of the order the events are supplied in", () => {
    const ordered = seismicIntereventTimeDistribution(
      quakesFromSeconds([0, 10, 30, 60])
    );
    const shuffled = seismicIntereventTimeDistribution(
      quakesFromSeconds([60, 0, 30, 10])
    );
    expect(shuffled.intervals).toEqual(ordered.intervals);
  });

  it("retains a zero interval for duplicate timestamps", () => {
    // Two events share a timestamp then a 20 s gap: intervals 0 and 20 s.
    const result = seismicIntereventTimeDistribution(
      quakesFromSeconds([0, 0, 20])
    );
    expect(result.intervals?.minSeconds).toBe(0);
    expect(result.intervals?.maxSeconds).toBe(20);
    expect(result.intervals?.count).toBe(2);
  });

  it("marks Cv/burstiness undefined when every event shares one timestamp", () => {
    // All intervals zero → mean interval 0 → Cv undefined.
    const result = seismicIntereventTimeDistribution(
      quakesFromSeconds([0, 0, 0])
    );
    expect(result.intervals?.meanSeconds).toBe(0);
    expect(result.intervals?.coefficientOfVariation).toBeNull();
    expect(result.intervals?.burstiness).toBeNull();
    expect(result.intervals?.regularity).toBe("undefined");
  });

  it("excludes non-finite times but still counts them supplied", () => {
    const result = seismicIntereventTimeDistribution([
      quakeAt(1_750_000_000_000),
      quakeAt(Number.NaN),
      quakeAt(1_750_000_010_000),
      quakeAt(Number.POSITIVE_INFINITY),
    ]);
    expect(result.suppliedEventCount).toBe(4);
    expect(result.usableEventCount).toBe(2);
    expect(result.intervals?.count).toBe(1);
    expect(result.intervals?.minSeconds).toBe(10);
  });

  it("leaves Cv/burstiness undefined for a single interval (one gap)", () => {
    // Two usable events → one interval; dispersion needs at least two intervals.
    const result = seismicIntereventTimeDistribution(
      quakesFromSeconds([0, 42])
    );
    expect(result.intervals?.count).toBe(1);
    expect(result.intervals?.meanSeconds).toBe(42);
    expect(result.intervals?.standardDeviationSeconds).toBe(0);
    expect(result.intervals?.coefficientOfVariation).toBeNull();
    expect(result.intervals?.burstiness).toBeNull();
    expect(result.intervals?.regularity).toBe("undefined");
  });

  it("returns a null distribution when fewer than two events have a finite time", () => {
    const oneEvent = seismicIntereventTimeDistribution([
      quakeAt(1_750_000_000_000),
    ]);
    expect(oneEvent.intervals).toBeNull();
    expect(oneEvent.usableEventCount).toBe(1);
    expect(oneEvent.suppliedEventCount).toBe(1);

    const none = seismicIntereventTimeDistribution([]);
    expect(none.intervals).toBeNull();
    expect(none.usableEventCount).toBe(0);
    expect(none.suppliedEventCount).toBe(0);
  });

  it("carries provenance, the burstiness reference, and is not a forecast", () => {
    const result = seismicIntereventTimeDistribution(
      quakesFromSeconds([0, 10, 30])
    );
    expect(result.kind).toBe("usgs-seismic-interevent-time-distribution");
    expect(result.isForecast).toBe(false);
    expect(result.source).toBe(SEISMICITY_SOURCE);
    expect(result.reference).toBe(BURSTINESS_REFERENCE);
    expect(result.units.interval).toMatch(/seconds/i);
    expect(result.limitations.length).toBeGreaterThan(0);
    expect(result.limitations.join(" ")).toMatch(/not a .*forecast/i);
  });
});
