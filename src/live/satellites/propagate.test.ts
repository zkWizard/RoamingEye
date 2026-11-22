import { describe, expect, it } from "vitest";
import { greatCircleDistance } from "../../lib/geo";
import type { GpRecord } from "./elements";
import { propagateRecord } from "./propagate";

/**
 * ISS (ZARYA), NORAD 25544, CelesTrak GP elements at epoch
 * 2026-11-21T18:49:58.655424Z. Propagated to 2026-11-22T05:55:43Z, the
 * timestamp wheretheiss.at reported for the same moment. Ground distance
 * against that tracker was 0.7 km and altitude agreed to a metre, inside
 * the 50 km acceptance window. The numbers below lock this library's SGP4
 * so a later upgrade cannot drift quietly.
 */
const ISS: GpRecord = {
  OBJECT_NAME: "ISS (ZARYA)",
  OBJECT_ID: "1998-067A",
  EPOCH: "2026-11-21T18:49:58.655424",
  MEAN_MOTION: 15.4953829,
  ECCENTRICITY: 0.0007379,
  INCLINATION: 51.6319,
  RA_OF_ASC_NODE: 240.1895,
  ARG_OF_PERICENTER: 51.3703,
  MEAN_ANOMALY: 308.7945,
  EPHEMERIS_TYPE: 0,
  CLASSIFICATION_TYPE: "U",
  NORAD_CAT_ID: 25544,
  ELEMENT_SET_NO: 999,
  REV_AT_EPOCH: 59618,
  BSTAR: 0.00018759,
  MEAN_MOTION_DOT: 0.00010099,
  MEAN_MOTION_DDOT: 0,
};

const WHEN = Date.parse("2026-11-22T05:55:43.000Z");

describe("propagateRecord", () => {
  it("places the ISS within a kilometre of the locked SGP4 fix", () => {
    const state = propagateRecord(ISS, WHEN);
    expect(state).not.toBeNull();
    if (!state) return;
    expect(state.lat).toBeCloseTo(43.362405475, 4);
    expect(state.lon).toBeCloseTo(135.761486485, 4);
    expect(state.altKm).toBeCloseTo(417.227, 2);
    expect(state.speedKmS).toBeCloseTo(7.669139, 3);
  });

  it("moves about one orbital second of ground track", () => {
    const start = propagateRecord(ISS, WHEN);
    const next = propagateRecord(ISS, WHEN + 1000);
    expect(start).not.toBeNull();
    expect(next).not.toBeNull();
    if (!start || !next) return;
    const km =
      greatCircleDistance(start.lat, start.lon, next.lat, next.lon) / 1000;
    expect(km).toBeGreaterThan(6.5);
    expect(km).toBeLessThan(8);
  });
});
