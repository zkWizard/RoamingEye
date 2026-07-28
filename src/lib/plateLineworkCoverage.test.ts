import { describe, expect, it } from "vitest";
import {
  PLATE_LINEWORK_SOURCE,
  plateLineworkCoverage,
} from "./plateLineworkCoverage";

describe("plateLineworkCoverage", () => {
  it("summarizes usable named and unnamed source linework", () => {
    const context = plateLineworkCoverage([
      {
        name: "PA-NA",
        points: [
          [-125, 40],
          [-126, 42],
          [-129, 47],
        ],
      },
      {
        name: " AF-AN ",
        points: [
          [12, -41.5],
          [14, -43],
        ],
      },
      {
        name: "",
        points: [
          [179, -10],
          [-179, -11],
        ],
      },
    ]);

    expect(context.coverage).toEqual({
      status: "available",
      suppliedLineCount: 3,
      usableLineCount: 3,
      namedLineCount: 2,
      unnamedLineCount: 1,
      pointCount: 7,
      segmentCount: 4,
      longitude: { min: -179, max: 179 },
      latitude: { min: -43, max: 47 },
    });
    expect(context.boundaryNames).toEqual(["AF-AN", "PA-NA"]);
    expect(context.provenance).toBe(PLATE_LINEWORK_SOURCE);
    expect(context.units.coordinates).toBe("decimal degrees");
  });

  it("deduplicates names without merging distinct linework", () => {
    const context = plateLineworkCoverage([
      {
        name: "NA-PA",
        points: [
          [-125, 40],
          [-126, 42],
        ],
      },
      {
        name: "NA-PA",
        points: [
          [-128, 45],
          [-129, 47],
        ],
      },
    ]);

    expect(context.boundaryNames).toEqual(["NA-PA"]);
    expect(context.coverage.namedLineCount).toBe(2);
    expect(context.coverage.segmentCount).toBe(2);
  });

  it("preserves an explicit unavailable state for no usable linework", () => {
    const context = plateLineworkCoverage([
      { name: "too-short", points: [[0, 0]] },
      {
        name: "invalid",
        points: [
          [181, 0],
          [10, 20],
        ],
      },
    ]);

    expect(context.coverage).toMatchObject({
      status: "unavailable",
      suppliedLineCount: 2,
      usableLineCount: 0,
      namedLineCount: 0,
      unnamedLineCount: 0,
      pointCount: 0,
      segmentCount: 0,
      longitude: { min: null, max: null },
      latitude: { min: null, max: null },
    });
    expect(context.boundaryNames).toEqual([]);
  });

  it("states interpretation limits without activity or hazard claims", () => {
    const context = plateLineworkCoverage([]);
    const limitations = context.limitations.join(" ");

    expect(limitations).toContain("Bird (2003)");
    expect(limitations).toContain("not measures of boundary length");
    expect(limitations).toContain("does not provide a hazard assessment");
  });
});
