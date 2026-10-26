import { describe, expect, it } from "vitest";
import { PLACE_CHANGE_METRICS } from "../placeChange";
import { describeChangePreview } from "./changePreview";
import { sparklinePoints } from "./sparkline";

const ndvi = PLACE_CHANGE_METRICS.find((metric) => metric.layerId === "ndvi")!;
const snow = PLACE_CHANGE_METRICS.find((metric) => metric.layerId === "snow")!;

describe("describeChangePreview", () => {
  it("computes the percent from the two annual means", () => {
    // 0.50 → 0.56 is +12% of the start value. The year is the one sampled.
    const preview = describeChangePreview(ndvi, 2005, 0.5, 0.56);
    expect(preview?.text).toBe("NDVI +12% since 2005");
    expect(preview?.values).toEqual([0.5, 0.56]);
  });

  it("uses the place panel's minus sign for a drop", () => {
    const preview = describeChangePreview(ndvi, 2010, 0.5, 0.4);
    expect(preview?.text).toBe("NDVI −20% since 2010");
  });

  it("hides a metric the place panel would hide", () => {
    expect(describeChangePreview(snow, 2005, 0, 0)).toBeNull();
  });

  it("drops a sample that is not a number", () => {
    expect(describeChangePreview(ndvi, 2005, Number.NaN, 0.5)).toBeNull();
  });
});

describe("sparklinePoints", () => {
  it("draws a rising series upward", () => {
    const points = sparklinePoints([1, 3], 48, 16)
      .split(" ")
      .map((pair) => pair.split(",").map(Number));
    expect(points).toHaveLength(2);
    expect(points[1][0]).toBeGreaterThan(points[0][0]);
    expect(points[1][1]).toBeLessThan(points[0][1]);
  });

  it("keeps a flat series as a horizontal line", () => {
    const points = sparklinePoints([2, 2], 48, 16)
      .split(" ")
      .map((pair) => Number(pair.split(",")[1]));
    expect(points[0]).toBe(points[1]);
  });
});
