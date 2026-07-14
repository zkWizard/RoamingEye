import { describe, it, expect } from "vitest";
import type { Position } from "./geojson";
import type { PlateBoundary } from "./plates";
import {
  EARTH_MEAN_RADIUS_KM,
  PLATE_BOUNDARY_LENGTH_UNITS,
  polylineLengthKm,
  summarizePlateBoundaryLengths,
} from "./plateBoundaryLength";
import { BIRD_2003_PLATE_BOUNDARY_SOURCE } from "./plateBoundaryContext";

const boundary = (name: string, points: Position[]): PlateBoundary => ({
  name,
  points,
});

/** One degree of arc on the mean-radius sphere, in km (~111.19). */
const DEG_KM = (EARTH_MEAN_RADIUS_KM * Math.PI) / 180;

describe("polylineLengthKm", () => {
  it("returns 0 for polylines with no measurable span", () => {
    expect(polylineLengthKm([])).toBe(0);
    expect(polylineLengthKm([[0, 0]])).toBe(0);
  });

  it("sums the great-circle length of consecutive vertices", () => {
    // Two one-degree meridian steps from the equator.
    const length = polylineLengthKm([
      [0, 0],
      [0, 1],
      [0, 2],
    ]);
    expect(length).toBeCloseTo(2 * DEG_KM, 6);
  });

  it("measures an antimeridian-spanning span as the minor arc", () => {
    // 179°E -> 179°W at the equator is 2° of longitude, not 358°.
    const length = polylineLengthKm([
      [179, 0],
      [-179, 0],
    ]);
    expect(length).toBeCloseTo(2 * DEG_KM, 6);
  });

  it("breaks the run at an invalid vertex rather than bridging across it", () => {
    // The NaN vertex isolates two 1° spans; a bridge (1° -> 10°) would add ~9°.
    const length = polylineLengthKm([
      [0, 0],
      [0, 1],
      [Number.NaN, Number.NaN],
      [0, 10],
      [0, 11],
    ]);
    expect(length).toBeCloseTo(2 * DEG_KM, 6);
  });

  it("skips out-of-range vertices", () => {
    const length = polylineLengthKm([
      [0, 0],
      [0, 1],
      [500, 500],
      [0, 5],
    ]);
    expect(length).toBeCloseTo(DEG_KM, 6);
  });
});

describe("summarizePlateBoundaryLengths", () => {
  it("sums length per plate pair, unifying reversed label orderings", () => {
    const summary = summarizePlateBoundaryLengths([
      boundary("AF-AN", [
        [0, 0],
        [0, 1],
      ]),
      boundary("AN-AF", [
        [0, 5],
        [0, 7],
      ]),
    ]);

    expect(summary.entries).toHaveLength(1);
    const entry = summary.entries[0];
    expect(entry.name).toBe("AF-AN");
    expect(entry.featureCount).toBe(2);
    expect(entry.lengthKm).toBeCloseTo(3 * DEG_KM, 6);
    // Decoded from the canonical key, so plates read in a stable order even
    // though one feature spelled the pair in reverse.
    expect(entry.plates?.plates.map((p) => p.code)).toEqual(["AF", "AN"]);
    expect(entry.plates?.recognized).toBe(true);
    expect(summary.totalLengthKm).toBeCloseTo(3 * DEG_KM, 6);
    expect(summary.usableBoundaryCount).toBe(2);
    expect(summary.suppliedBoundaryCount).toBe(2);
  });

  it("groups delimiter variants of the same pair together", () => {
    const summary = summarizePlateBoundaryLengths([
      boundary("EU-AF", [
        [0, 0],
        [0, 1],
      ]),
      boundary("EU/AF", [
        [0, 0],
        [0, 1],
      ]),
      boundary("EU\\AF", [
        [0, 0],
        [0, 1],
      ]),
    ]);

    expect(summary.entries).toHaveLength(1);
    expect(summary.entries[0].name).toBe("AF-EU");
    expect(summary.entries[0].featureCount).toBe(3);
    expect(summary.entries[0].lengthKm).toBeCloseTo(3 * DEG_KM, 6);
  });

  it("orders entries by length descending, then name ascending", () => {
    const summary = summarizePlateBoundaryLengths([
      boundary("NA-PA", [
        [0, 0],
        [0, 1],
      ]),
      boundary("AF-AN", [
        [0, 0],
        [0, 3],
      ]),
      boundary("CO-NZ", [
        [0, 0],
        [0, 1],
      ]),
    ]);

    expect(summary.entries.map((e) => e.name)).toEqual([
      "AF-AN",
      "CO-NZ",
      "NA-PA",
    ]);
    expect(summary.entries[0].lengthKm).toBeGreaterThan(
      summary.entries[1].lengthKm
    );
  });

  it("keeps undecodable labels under their trimmed literal string", () => {
    const summary = summarizePlateBoundaryLengths([
      boundary("  Ridge segment  ", [
        [0, 0],
        [0, 1],
      ]),
    ]);

    expect(summary.entries).toHaveLength(1);
    expect(summary.entries[0].name).toBe("Ridge segment");
    expect(summary.entries[0].plates).toBeNull();
  });

  it("groups a two-letter pair with codes outside the vocabulary but marks it unrecognized", () => {
    const summary = summarizePlateBoundaryLengths([
      boundary("XX-YY", [
        [0, 0],
        [0, 1],
      ]),
    ]);

    expect(summary.entries[0].name).toBe("XX-YY");
    expect(summary.entries[0].plates?.recognized).toBe(false);
    expect(summary.entries[0].plates?.plates.map((p) => p.name)).toEqual([
      null,
      null,
    ]);
  });

  it("groups unlabeled features under a null name and sorts them last on ties", () => {
    const summary = summarizePlateBoundaryLengths([
      boundary("", [
        [0, 0],
        [0, 1],
      ]),
      boundary("AF-AN", [
        [0, 0],
        [0, 1],
      ]),
    ]);

    expect(summary.entries).toHaveLength(2);
    expect(summary.entries.map((e) => e.name)).toEqual(["AF-AN", null]);
    expect(summary.entries[1].plates).toBeNull();
  });

  it("excludes features with no measurable span from counts and totals", () => {
    const summary = summarizePlateBoundaryLengths([
      boundary("AF-AN", [[0, 0]]),
      boundary("EU-NA", [
        [Number.NaN, Number.NaN],
        [0, 1],
      ]),
      boundary("PA-NA", [
        [0, 0],
        [0, 1],
      ]),
    ]);

    expect(summary.usableBoundaryCount).toBe(1);
    expect(summary.entries).toHaveLength(1);
    expect(summary.entries[0].name).toBe("NA-PA");
    expect(summary.totalLengthKm).toBeCloseTo(DEG_KM, 6);
  });

  it("returns an empty, provenance-tagged summary for no input", () => {
    const summary = summarizePlateBoundaryLengths([]);
    expect(summary.entries).toEqual([]);
    expect(summary.totalLengthKm).toBe(0);
    expect(summary.suppliedBoundaryCount).toBe(0);
    expect(summary.usableBoundaryCount).toBe(0);
  });

  it("retains provenance, units, and honest limitations", () => {
    const summary = summarizePlateBoundaryLengths([]);
    expect(summary.kind).toBe("bird-2003-plate-boundary-length");
    expect(summary.isForecast).toBe(false);
    expect(summary.provenance).toBe(BIRD_2003_PLATE_BOUNDARY_SOURCE);
    expect(summary.provenance.doi).toBe("10.1029/2001GC000252");
    expect(summary.units).toBe(PLATE_BOUNDARY_LENGTH_UNITS);
    expect(summary.limitations.length).toBeGreaterThan(0);
    // Provenance-first: never claim a rate or a boundary-type split.
    expect(summary.limitations.join(" ")).toMatch(/not.*rate/i);
    expect(summary.limitations.join(" ")).toMatch(
      /divergent, convergent, or transform/i
    );
  });
});
