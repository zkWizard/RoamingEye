import { describe, it, expect } from "vitest";
import type { Earthquake } from "./earthquakes";
import { momentFromMagnitude, SEISMIC_MOMENT_REFERENCE } from "./seismicMoment";
import {
  seismicMomentDepthCentroid,
  SEISMIC_MOMENT_DEPTH_CENTROID_UNITS,
} from "./seismicMomentDepthCentroid";

/** Minimal event with only the fields this helper reads; others are inert. */
function quake(magnitude: number, depthKm: number): Earthquake {
  return { lat: 0, lon: 0, depthKm, magnitude, time: 0, place: "" };
}

describe("seismicMomentDepthCentroid", () => {
  it("puts the centroid at the common depth of equal-moment events", () => {
    // Equal magnitudes carry equal moment, so the moment-weighted centroid is
    // the plain mean of the depths, and it equals the count-weighted mean.
    const result = seismicMomentDepthCentroid([
      quake(5, 10),
      quake(5, 30),
      quake(5, 50),
    ]);
    expect(result.contributingEventCount).toBe(3);
    expect(result.centroidDepthKm).toBeCloseTo(30, 10);
    expect(result.meanDepthKm).toBeCloseTo(30, 10);
    expect(result.energyDepthBiasKm).toBeCloseTo(0, 10);
    expect(result.centroidDepthClass).toBe("shallow");
  });

  it("weights depth by moment: the larger event pulls the centroid", () => {
    // An M4 at 10 km and an M6 at 610 km. The M6 carries 10^(1.5·2) = 1000×
    // the moment of the M4, so the centroid sits at
    //   (m4·10 + 1000·m4·610) / (1001·m4) = 610010/1001 ≈ 609.4 km,
    // far below the count-weighted mean of 310 km.
    const m4 = momentFromMagnitude(4)!;
    const m6 = momentFromMagnitude(6)!;
    const result = seismicMomentDepthCentroid([quake(4, 10), quake(6, 610)]);
    const expectedCentroid = (m4 * 10 + m6 * 610) / (m4 + m6);
    expect(result.centroidDepthKm).toBeCloseTo(expectedCentroid, 6);
    expect(result.centroidDepthKm!).toBeGreaterThan(609);
    expect(result.meanDepthKm).toBeCloseTo(310, 10);
    // Energy sits far deeper than the typical event.
    expect(result.energyDepthBiasKm!).toBeGreaterThan(299);
    expect(result.centroidDepthClass).toBe("deep");
  });

  it("lets one deep great event place the centroid in the deep regime", () => {
    // Ten shallow M4s are numerically dominant but energetically trivial next
    // to a single deep M8 (~10^6× the moment each): the count mean is shallow
    // but the energy centroid is essentially at the great event's depth.
    const events = [
      ...Array.from({ length: 10 }, () => quake(4, 15)),
      quake(8, 550),
    ];
    const result = seismicMomentDepthCentroid(events);
    expect(result.centroidDepthClass).toBe("deep");
    expect(result.centroidDepthKm!).toBeGreaterThan(549);
    expect(result.meanDepthKm!).toBeLessThan(70); // count-weighted mean is shallow
    expect(result.energyDepthBiasKm!).toBeGreaterThan(0);
  });

  it("reports a moment-weighted spread that is zero when depths do not vary", () => {
    const flat = seismicMomentDepthCentroid([
      quake(6, 120),
      quake(4, 120),
      quake(7, 120),
    ]);
    expect(flat.centroidDepthKm).toBeCloseTo(120, 10);
    expect(flat.spreadKm).toBeCloseTo(0, 10);
    expect(flat.centroidDepthClass).toBe("intermediate");

    // Two equal-moment events 20 km each side of the centroid: the
    // moment-weighted population std dev is exactly 20 km.
    const spread = seismicMomentDepthCentroid([quake(5, 100), quake(5, 140)]);
    expect(spread.centroidDepthKm).toBeCloseTo(120, 10);
    expect(spread.spreadKm).toBeCloseTo(20, 10);
  });

  it("skips events without a finite magnitude or a finite depth", () => {
    const result = seismicMomentDepthCentroid([
      quake(6, 20),
      quake(NaN, 20),
      quake(6, NaN),
      quake(Infinity, 100),
      quake(5, Infinity),
    ]);
    expect(result.suppliedEventCount).toBe(5);
    expect(result.contributingEventCount).toBe(1);
    expect(result.skippedEventCount).toBe(4);
    expect(result.centroidDepthKm).toBeCloseTo(20, 10);
    expect(result.totalMomentNm).toBeCloseTo(momentFromMagnitude(6)!, 3);
  });

  it("retains a negative (above-datum) depth as reported", () => {
    const result = seismicMomentDepthCentroid([quake(5, -2), quake(5, 2)]);
    expect(result.centroidDepthKm).toBeCloseTo(0, 10);
    expect(result.contributingEventCount).toBe(2);
    expect(result.centroidDepthClass).toBe("shallow");
  });

  it("is order-independent (moment addition commutes)", () => {
    const a = seismicMomentDepthCentroid([
      quake(4.5, 15),
      quake(6.2, 120),
      quake(7.1, 480),
      quake(5, 40),
    ]);
    const b = seismicMomentDepthCentroid([
      quake(7.1, 480),
      quake(5, 40),
      quake(4.5, 15),
      quake(6.2, 120),
    ]);
    expect(a.centroidDepthKm!).toBeCloseTo(b.centroidDepthKm!, 6);
    expect(a.spreadKm!).toBeCloseTo(b.spreadKm!, 6);
    expect(a.meanDepthKm!).toBeCloseTo(b.meanDepthKm!, 10);
    expect(a.centroidDepthClass).toBe(b.centroidDepthClass);
  });

  it("reports an explicit empty result for no usable events", () => {
    const empty = seismicMomentDepthCentroid([]);
    expect(empty.suppliedEventCount).toBe(0);
    expect(empty.contributingEventCount).toBe(0);
    expect(empty.totalMomentNm).toBe(0);
    expect(empty.centroidDepthKm).toBeNull();
    expect(empty.spreadKm).toBeNull();
    expect(empty.meanDepthKm).toBeNull();
    expect(empty.energyDepthBiasKm).toBeNull();
    expect(empty.centroidDepthClass).toBeNull();

    const allSkipped = seismicMomentDepthCentroid([
      quake(NaN, 10),
      quake(5, NaN),
    ]);
    expect(allSkipped.contributingEventCount).toBe(0);
    expect(allSkipped.skippedEventCount).toBe(2);
    expect(allSkipped.centroidDepthKm).toBeNull();
  });

  it("carries provenance, reference, and native units", () => {
    const result = seismicMomentDepthCentroid([quake(5, 10)]);
    expect(result.kind).toBe("usgs-seismic-moment-depth-centroid");
    expect(result.isForecast).toBe(false);
    expect(result.reference).toBe(SEISMIC_MOMENT_REFERENCE);
    expect(result.reference.assumesMomentMagnitude).toBe(true);
    expect(result.source.name).toContain("USGS");
    expect(result.units).toBe(SEISMIC_MOMENT_DEPTH_CENTROID_UNITS);
    expect(result.limitations.length).toBeGreaterThan(0);
  });
});
