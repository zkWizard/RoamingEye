import { describe, expect, it } from "vitest";
import { parseGpList, type GpRecord } from "./elements";

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

describe("parseGpList", () => {
  it("keeps a CelesTrak GP record", () => {
    expect(parseGpList([ISS])).toEqual([ISS]);
  });

  it("keeps country and object type when the feed sends them", () => {
    const parsed = parseGpList([
      { ...ISS, COUNTRY_CODE: "US", OBJECT_TYPE: "PAY" },
    ]);
    expect(parsed[0]?.COUNTRY_CODE).toBe("US");
    expect(parsed[0]?.OBJECT_TYPE).toBe("PAY");
  });

  it("drops a broken row and keeps the rest", () => {
    const parsed = parseGpList([{ OBJECT_NAME: "nope" }, ISS]);
    expect(parsed).toEqual([ISS]);
  });

  it("refuses a payload that is not a list", () => {
    expect(() => parseGpList({ error: "no" })).toThrow(/unexpected payload/);
  });

  it("refuses a list that contains no usable record", () => {
    expect(() => parseGpList([{ OBJECT_NAME: "nope" }])).toThrow(
      /could not be read/
    );
  });

  it("accepts an empty list", () => {
    expect(parseGpList([])).toEqual([]);
  });
});
