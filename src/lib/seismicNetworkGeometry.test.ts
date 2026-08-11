import { describe, it, expect } from "vitest";
import {
  DMIN_DEGREES_TO_KM,
  DOCUMENTED_MAX_AZIMUTHAL_GAP_DEG,
  epicenterAzimuthalConstraint,
  nearestStationDistanceKm,
  networkGeometryNote,
  seismicNetworkGeometry,
  summarizeNetworkGeometryCoverage,
} from "./seismicNetworkGeometry";
import { parseEarthquakeFeed, SEISMICITY_SOURCE } from "./earthquakes";
import type { Earthquake, EarthquakeSourceRecord } from "./earthquakes";

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
  lat: 0,
  lon: 0,
  depthKm: 35,
  magnitude: 5,
  time: 1_750_000_000_000,
  place: "somewhere",
  sourceRecord: record(),
  ...extra,
});

describe("epicenterAzimuthalConstraint", () => {
  it("treats the documented 180 degree condition as strictly exceeded", () => {
    // USGS: locations whose azimuthal gap *exceeds* 180 degrees typically have
    // large location and depth uncertainties. 180 itself is not exceeded.
    expect(
      epicenterAzimuthalConstraint(
        record({ azimuthalGapDeg: DOCUMENTED_MAX_AZIMUTHAL_GAP_DEG })
      )
    ).toBe("within-documented-gap");
    expect(
      epicenterAzimuthalConstraint(
        record({ azimuthalGapDeg: DOCUMENTED_MAX_AZIMUTHAL_GAP_DEG + 0.1 })
      )
    ).toBe("exceeds-documented-gap");
  });

  it("classifies gaps either side of the threshold", () => {
    expect(epicenterAzimuthalConstraint(record({ azimuthalGapDeg: 18 }))).toBe(
      "within-documented-gap"
    );
    expect(epicenterAzimuthalConstraint(record({ azimuthalGapDeg: 286 }))).toBe(
      "exceeds-documented-gap"
    );
  });

  it("reports an absent or missing gap as unavailable, not as good coverage", () => {
    expect(
      epicenterAzimuthalConstraint(record({ azimuthalGapDeg: null }))
    ).toBe("unavailable");
    expect(epicenterAzimuthalConstraint(null)).toBe("unavailable");
    expect(epicenterAzimuthalConstraint(undefined)).toBe("unavailable");
  });
});

describe("nearestStationDistanceKm", () => {
  it("converts degrees with the conversion USGS publishes for dmin", () => {
    expect(nearestStationDistanceKm(1)).toBeCloseTo(DMIN_DEGREES_TO_KM, 10);
    expect(nearestStationDistanceKm(2.873)).toBeCloseTo(319.4776, 4);
  });

  it("keeps a reported zero distance distinct from an unavailable one", () => {
    expect(nearestStationDistanceKm(0)).toBe(0);
    expect(nearestStationDistanceKm(null)).toBeNull();
    expect(nearestStationDistanceKm(undefined)).toBeNull();
    expect(nearestStationDistanceKm(-1)).toBeNull();
    expect(nearestStationDistanceKm(Number.NaN)).toBeNull();
  });
});

describe("seismicNetworkGeometry", () => {
  it("reports the retained fields with provenance and no forecast claim", () => {
    const geometry = seismicNetworkGeometry(quake());
    expect(geometry.kind).toBe("usgs-seismic-network-geometry");
    expect(geometry.isForecast).toBe(false);
    expect(geometry.azimuthalConstraint).toBe("within-documented-gap");
    expect(geometry.azimuthalGapDeg).toBe(94);
    expect(geometry.stationCount).toBe(54);
    expect(geometry.nearestStationDeg).toBe(2.873);
    expect(geometry.nearestStationKm).toBeCloseTo(319.4776, 4);
    expect(geometry.travelTimeResidualS).toBe(0.8);
    expect(geometry.source).toBe(SEISMICITY_SOURCE);
    expect(geometry.limitations.length).toBeGreaterThan(0);
  });

  it("makes an event with no source record explicitly unavailable", () => {
    const geometry = seismicNetworkGeometry(quake({ sourceRecord: undefined }));
    expect(geometry.azimuthalConstraint).toBe("unavailable");
    expect(geometry.azimuthalGapDeg).toBeNull();
    expect(geometry.stationCount).toBeNull();
    expect(geometry.nearestStationDeg).toBeNull();
    expect(geometry.nearestStationKm).toBeNull();
    expect(geometry.travelTimeResidualS).toBeNull();
  });

  it("preserves a reported zero station count as a measurement", () => {
    expect(
      seismicNetworkGeometry(
        quake({ sourceRecord: record({ stationCount: 0 }) })
      ).stationCount
    ).toBe(0);
  });
});

describe("networkGeometryNote", () => {
  it("stays silent for a location inside the documented gap", () => {
    expect(networkGeometryNote(quake())).toBeNull();
  });

  it("names the gap and the documented consequence when exceeded", () => {
    const note = networkGeometryNote(
      quake({ sourceRecord: record({ azimuthalGapDeg: 286 }) })
    );
    expect(note).toBe(
      "azimuthal station gap 286° (>180°): USGS documents large location and depth uncertainty"
    );
  });

  it("stays silent when the feed supplied no gap", () => {
    expect(
      networkGeometryNote(
        quake({ sourceRecord: record({ azimuthalGapDeg: null }) })
      )
    ).toBeNull();
  });
});

describe("summarizeNetworkGeometryCoverage", () => {
  it("counts each constraint state without averaging the categories", () => {
    const coverage = summarizeNetworkGeometryCoverage([
      quake({ sourceRecord: record({ azimuthalGapDeg: 94 }) }),
      quake({ sourceRecord: record({ azimuthalGapDeg: 158 }) }),
      quake({ sourceRecord: record({ azimuthalGapDeg: 286 }) }),
      quake({ sourceRecord: record({ azimuthalGapDeg: null }) }),
      quake({ sourceRecord: undefined }),
    ]);
    expect(coverage.suppliedEventCount).toBe(5);
    expect(coverage.byConstraint).toEqual({
      "within-documented-gap": 2,
      "exceeds-documented-gap": 1,
      unavailable: 2,
    });
    expect(coverage.isForecast).toBe(false);
  });

  it("keeps the state counts a partition of the supplied events", () => {
    const coverage = summarizeNetworkGeometryCoverage([]);
    expect(coverage.suppliedEventCount).toBe(0);
    expect(
      Object.values(coverage.byConstraint).reduce((a, b) => a + b, 0)
    ).toBe(0);
  });
});

describe("USGS feed field retention", () => {
  // Regression guard for the defect this module was built on: the parser kept
  // depthError/horizontalError, which the M4.5+ summary feed never populates,
  // while dropping the four network-geometry fields it always supplies.
  it("retains gap, nst, dmin and rms from a feed-shaped feature", () => {
    const [event] = parseEarthquakeFeed({
      features: [
        {
          type: "Feature",
          id: "us7000abcd",
          geometry: { type: "Point", coordinates: [-104.1, 19.2, 35.5] },
          properties: {
            mag: 5,
            place: "offshore",
            time: 1_750_000_000_000,
            nst: 39,
            gap: 286,
            dmin: 7.743,
            rms: 1.1,
            depthError: null,
            horizontalError: null,
          },
        },
      ],
    });

    expect(event.sourceRecord).toMatchObject({
      stationCount: 39,
      azimuthalGapDeg: 286,
      nearestStationDeg: 7.743,
      travelTimeResidualS: 1.1,
      depthErrorKm: null,
      horizontalErrorKm: null,
    });
    expect(seismicNetworkGeometry(event).azimuthalConstraint).toBe(
      "exceeds-documented-gap"
    );
  });

  it("rejects an out-of-range azimuthal gap instead of clamping it", () => {
    const [event] = parseEarthquakeFeed({
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [0, 0, 10] },
          properties: {
            mag: 5,
            time: 1,
            gap: 400,
            nst: -3,
            dmin: -1,
            rms: "not-a-number",
          },
        },
      ],
    });

    expect(event.sourceRecord).toMatchObject({
      azimuthalGapDeg: null,
      stationCount: null,
      nearestStationDeg: null,
      travelTimeResidualS: null,
    });
    expect(seismicNetworkGeometry(event).azimuthalConstraint).toBe(
      "unavailable"
    );
  });
});
