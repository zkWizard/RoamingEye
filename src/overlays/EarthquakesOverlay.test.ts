import { describe, expect, it } from "vitest";
import { MAGNITUDE_SIZE_BUCKETS } from "../lib/earthquakes";
import type { Earthquake, EarthquakeSourceRecord } from "../lib/earthquakes";
import { reportedDepthBasisNote } from "../lib/seismicFixedDepth";
import { networkGeometryNote } from "../lib/seismicNetworkGeometry";
import { POINT_THRESHOLD } from "../scene/HoverInspector";

/**
 * The quake overlay is the only one that varies marker size per record, so it
 * is the only one whose hover hit radius cannot be a single constant. These
 * pin the relationship the overlay declares through `HoverPointSource.hitRadius`
 * — not the seismology, which lives in lib/earthquakes.test.ts.
 */
describe("magnitude marker hit radius", () => {
  const radiusOf = (size: number) => size / 2;

  it("draws a larger marker for a larger magnitude", () => {
    const sizes = MAGNITUDE_SIZE_BUCKETS.map((b) => b.size);
    const descendingByMinimum = [...MAGNITUDE_SIZE_BUCKETS]
      .sort((a, b) => b.min - a.min)
      .map((b) => b.size);
    expect(sizes).toEqual(descendingByMinimum);
    expect(new Set(sizes).size).toBe(sizes.length);
  });

  it("leaves the strongest events smaller than their marker under one radius", () => {
    // The defect this radius closes: at the shared default, an M6.5+ marker is
    // nameable only well inside its own edge, so the events the size channel
    // exists to make prominent were the hardest to identify.
    const strongest = MAGNITUDE_SIZE_BUCKETS[0];
    expect(strongest.min).toBe(6.5);
    expect(radiusOf(strongest.size)).toBeGreaterThan(POINT_THRESHOLD * 2);
  });

  it("keeps the default as a floor for the smallest markers", () => {
    // Below the default the inspector clamps, so declaring a radius can only
    // widen a hit region — the smallest bucket keeps the aim it accepts today.
    const smallest = MAGNITUDE_SIZE_BUCKETS[MAGNITUDE_SIZE_BUCKETS.length - 1];
    expect(radiusOf(smallest.size)).toBeLessThan(POINT_THRESHOLD);
    expect(Math.max(radiusOf(smallest.size), POINT_THRESHOLD)).toBe(
      POINT_THRESHOLD
    );
  });
});

/**
 * The marker readout carries at most one location-quality clause. Two of them
 * can apply to the same event — a depth sitting on a conventional default and a
 * station gap past the threshold USGS publishes — and the overlay picks rather
 * than concatenates. These pin that choice, not the wording of either clause,
 * which lives in lib/seismicFixedDepth.test.ts and
 * lib/seismicNetworkGeometry.test.ts.
 */
describe("marker readout location-quality note", () => {
  // Mirrors the expression in EarthquakesOverlay.load's `describe` callback.
  const noteFor = (quake: Earthquake) =>
    networkGeometryNote(quake) ?? reportedDepthBasisNote(quake.depthKm);

  const record = (
    extra: Partial<EarthquakeSourceRecord> = {}
  ): EarthquakeSourceRecord => ({
    id: "us7000test",
    url: null,
    updatedTime: null,
    magnitudeType: "mww",
    reviewStatus: "reviewed",
    horizontalErrorKm: null,
    depthErrorKm: null,
    stationCount: 54,
    azimuthalGapDeg: 94,
    nearestStationDeg: 2.873,
    travelTimeResidualS: 0.8,
    ...extra,
  });

  const quake = (extra: Partial<Earthquake> = {}): Earthquake => ({
    lat: -6.1,
    lon: 154.2,
    depthKm: 47.3,
    magnitude: 5.2,
    magnitudeType: "mww",
    time: Date.UTC(2026, 6, 14, 3, 12, 0),
    place: "63 km SW of Kokopo, Papua New Guinea",
    sourceRecord: record(),
    ...extra,
  });

  it("says nothing for a resolved depth inside the documented gap", () => {
    expect(noteFor(quake())).toBeNull();
  });

  it("qualifies a depth that sits on a conventional default value", () => {
    expect(noteFor(quake({ depthKm: 10 }))).toBe(
      "conventional default depth value; resolution not reported"
    );
  });

  it("qualifies a weakly constrained location that has a free depth", () => {
    const note = noteFor(
      quake({ sourceRecord: record({ azimuthalGapDeg: 286 }) })
    );
    expect(note).toContain("azimuthal station gap 286°");
  });

  it("prefers the station gap over the default depth when both apply", () => {
    // The gap qualifies the whole location solution — place and depth together
    // — so it says strictly more than the default-depth clause does.
    const note = noteFor(
      quake({ depthKm: 10, sourceRecord: record({ azimuthalGapDeg: 286 }) })
    );
    expect(note).toContain("azimuthal station gap 286°");
    expect(note).not.toContain("conventional default depth value");
  });

  it("never trails a second location-quality clause on one readout", () => {
    const both = quake({
      depthKm: 10,
      sourceRecord: record({ azimuthalGapDeg: 286 }),
    });
    // One clause means one separator's worth of content: the readout appends
    // `· ${note}` once, so the note itself must not carry a joined pair.
    expect(noteFor(both)?.includes("·")).toBe(false);
  });
});
