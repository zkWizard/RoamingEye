import { describe, it, expect } from "vitest";
import type { Earthquake } from "./earthquakes";
import { momentFromMagnitude, SEISMIC_MOMENT_REFERENCE } from "./seismicMoment";
import {
  seismicMomentByDepth,
  DEPTH_CLASS_ORDER,
  SEISMIC_MOMENT_BY_DEPTH_UNITS,
} from "./seismicMomentByDepth";

/** Minimal event with only the fields this helper reads; others are inert. */
function quake(magnitude: number, depthKm: number): Earthquake {
  return { lat: 0, lon: 0, depthKm, magnitude, time: 0, place: "" };
}

describe("seismicMomentByDepth", () => {
  it("assigns each event's moment to its conventional depth regime", () => {
    const result = seismicMomentByDepth([
      quake(5, 10), // shallow (<70 km)
      quake(5, 150), // intermediate (70–300 km)
      quake(5, 500), // deep (>300 km)
    ]);
    const m5 = momentFromMagnitude(5)!;
    expect(result.shares.shallow.eventCount).toBe(1);
    expect(result.shares.intermediate.eventCount).toBe(1);
    expect(result.shares.deep.eventCount).toBe(1);
    expect(result.shares.shallow.totalMomentNm).toBeCloseTo(m5, 3);
    expect(result.shares.deep.totalMomentNm).toBeCloseTo(m5, 3);
    expect(result.totalMomentNm).toBeCloseTo(3 * m5, 3);
  });

  it("respects the shallow/intermediate/deep bin boundaries", () => {
    // 70 km is intermediate (inclusive lower bound), 300 km is intermediate
    // (inclusive upper bound), 300.0001 km is deep — mirrors depthClass().
    const result = seismicMomentByDepth([
      quake(4, 69.9),
      quake(4, 70),
      quake(4, 300),
      quake(4, 300.1),
    ]);
    expect(result.shares.shallow.eventCount).toBe(1);
    expect(result.shares.intermediate.eventCount).toBe(2);
    expect(result.shares.deep.eventCount).toBe(1);
  });

  it("lets one deep great event dominate energy over many shallow events", () => {
    // Ten shallow M4s are numerically dominant but energetically trivial next
    // to a single deep M8 (~10^6 times the moment each) — the count-weighted
    // and energy-weighted views point at different regimes.
    const events = [
      ...Array.from({ length: 10 }, () => quake(4, 15)),
      quake(8, 550),
    ];
    const result = seismicMomentByDepth(events);
    expect(result.shares.shallow.eventCount).toBe(10);
    expect(result.shares.deep.eventCount).toBe(1);
    expect(result.dominantByMoment).toBe("deep");
    expect(result.shares.deep.momentFraction).toBeGreaterThan(0.999);
    expect(result.shares.shallow.momentFraction).toBeLessThan(0.001);
  });

  it("moment fractions cover the contributing set and sum to one", () => {
    const result = seismicMomentByDepth([
      quake(6, 20),
      quake(5, 200),
      quake(7, 450),
    ]);
    const total = DEPTH_CLASS_ORDER.reduce(
      (sum, cls) => sum + result.shares[cls].momentFraction,
      0
    );
    expect(total).toBeCloseTo(1, 12);
  });

  it("reports each regime's summed moment as an equivalent magnitude", () => {
    // Two identical M6 shallow events: one 10^1.5 moment step, i.e. an
    // equivalent Mw of 6 + log10(2)/1.5, well short of a naive 'M12'.
    const result = seismicMomentByDepth([quake(6, 10), quake(6, 30)]);
    expect(result.shares.shallow.equivalentMomentMagnitude).toBeCloseTo(
      6 + Math.log10(2) / 1.5,
      10
    );
    expect(result.shares.intermediate.equivalentMomentMagnitude).toBeNull();
    expect(result.shares.deep.equivalentMomentMagnitude).toBeNull();
  });

  it("breaks an exact moment tie toward the shallower regime", () => {
    // One shallow and one deep event of equal magnitude carry equal moment;
    // the tie resolves to shallow for determinism.
    const result = seismicMomentByDepth([quake(6, 10), quake(6, 500)]);
    expect(result.shares.shallow.totalMomentNm).toBeCloseTo(
      result.shares.deep.totalMomentNm,
      3
    );
    expect(result.dominantByMoment).toBe("shallow");
  });

  it("skips events without a finite magnitude or a finite depth", () => {
    const result = seismicMomentByDepth([
      quake(6, 20),
      quake(NaN, 20),
      quake(6, NaN),
      quake(Infinity, 100),
      quake(5, Infinity),
    ]);
    expect(result.suppliedEventCount).toBe(5);
    expect(result.contributingEventCount).toBe(1);
    expect(result.skippedEventCount).toBe(4);
    expect(result.shares.shallow.eventCount).toBe(1);
    expect(result.totalMomentNm).toBeCloseTo(momentFromMagnitude(6)!, 3);
  });

  it("is order-independent (moment addition commutes)", () => {
    const a = seismicMomentByDepth([
      quake(4.5, 15),
      quake(6.2, 120),
      quake(7.1, 480),
      quake(5, 40),
    ]);
    const b = seismicMomentByDepth([
      quake(7.1, 480),
      quake(5, 40),
      quake(4.5, 15),
      quake(6.2, 120),
    ]);
    // Moments here are ~10^19 N·m, so floating-point addition is not bit-exact
    // when reordered; compare as a ratio (relative, not absolute, tolerance).
    expect(a.totalMomentNm / b.totalMomentNm).toBeCloseTo(1, 12);
    expect(a.dominantByMoment).toBe(b.dominantByMoment);
    for (const cls of DEPTH_CLASS_ORDER) {
      expect(a.shares[cls].momentFraction).toBeCloseTo(
        b.shares[cls].momentFraction,
        12
      );
    }
  });

  it("reports an explicit empty result for no usable events", () => {
    const empty = seismicMomentByDepth([]);
    expect(empty.contributingEventCount).toBe(0);
    expect(empty.totalMomentNm).toBe(0);
    expect(empty.dominantByMoment).toBeNull();
    for (const cls of DEPTH_CLASS_ORDER) {
      expect(empty.shares[cls].eventCount).toBe(0);
      expect(empty.shares[cls].momentFraction).toBe(0);
      expect(empty.shares[cls].equivalentMomentMagnitude).toBeNull();
    }

    const allSkipped = seismicMomentByDepth([quake(NaN, 10), quake(5, NaN)]);
    expect(allSkipped.contributingEventCount).toBe(0);
    expect(allSkipped.skippedEventCount).toBe(2);
    expect(allSkipped.dominantByMoment).toBeNull();
  });

  it("carries provenance, reference, and native units", () => {
    const result = seismicMomentByDepth([quake(5, 10)]);
    expect(result.kind).toBe("usgs-seismic-moment-by-depth");
    expect(result.isForecast).toBe(false);
    expect(result.reference).toBe(SEISMIC_MOMENT_REFERENCE);
    expect(result.reference.assumesMomentMagnitude).toBe(true);
    expect(result.source.name).toContain("USGS");
    expect(result.units).toBe(SEISMIC_MOMENT_BY_DEPTH_UNITS);
    expect(result.limitations.length).toBeGreaterThan(0);
  });
});
