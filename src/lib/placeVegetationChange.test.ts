import { describe, expect, it } from "vitest";
import {
  DEFAULT_NDVI_CHANGE_STABILITY_THRESHOLD,
  NDVI_VALID_RANGE,
  isPlausibleNdvi,
  placeVegetationComparison,
} from "./placeVegetationChange";

const JUN = { year: 2026, month: 6 } as const;
const JUL = { year: 2026, month: 7 } as const;

describe("place vegetation comparison", () => {
  it("labels a rise beyond the stability band as greening", () => {
    expect(placeVegetationComparison([JUN, JUL], [0.42, 0.61])).toEqual({
      kind: "compared",
      direction: "greening",
      delta: expect.closeTo(0.19, 10),
      stabilityThreshold: DEFAULT_NDVI_CHANGE_STABILITY_THRESHOLD,
    });
  });

  it("labels a fall beyond the stability band as browning", () => {
    const comparison = placeVegetationComparison([JUN, JUL], [0.61, 0.42]);
    expect(comparison.kind).toBe("compared");
    if (comparison.kind !== "compared") return;
    expect(comparison.direction).toBe("browning");
    expect(comparison.delta).toBeCloseTo(-0.19, 10);
  });

  it("reports a difference inside the stability band as little change", () => {
    // The panel used to print this as "+0.01", a signed change indistinguishable
    // from composite noise. It is now explicitly not a detected change.
    const comparison = placeVegetationComparison([JUN, JUL], [0.5, 0.51]);
    expect(comparison.kind).toBe("compared");
    if (comparison.kind !== "compared") return;
    expect(comparison.direction).toBe("little-change");
    expect(comparison.delta).toBeCloseTo(0.01, 10);
  });

  it("brackets the stability band from both sides", () => {
    // The band edge is deliberately not asserted at exactly the threshold: no
    // pair of doubles differs by exactly 0.05, so an "exactly at the band" case
    // is unconstructible and would only be testing float representation.
    const inside = placeVegetationComparison([JUN, JUL], [0.5, 0.549]);
    const outside = placeVegetationComparison([JUN, JUL], [0.5, 0.56]);
    expect(inside.kind === "compared" && inside.direction).toBe(
      "little-change"
    );
    expect(outside.kind === "compared" && outside.direction).toBe("greening");
  });

  it("reports the band it applied so a caller can state it", () => {
    const comparison = placeVegetationComparison([JUN, JUL], [0.1, 0.9]);
    expect(comparison.kind).toBe("compared");
    if (comparison.kind !== "compared") return;
    expect(comparison.stabilityThreshold).toBe(
      DEFAULT_NDVI_CHANGE_STABILITY_THRESHOLD
    );
  });

  it("refuses to compare months that are not one calendar month apart", () => {
    expect(
      placeVegetationComparison([{ year: 2025, month: 6 }, JUL], [0.42, 0.61])
    ).toEqual({ kind: "not-comparable", reason: "not-consecutive-months" });
    expect(
      placeVegetationComparison([{ year: 2026, month: 5 }, JUL], [0.42, 0.61])
    ).toEqual({ kind: "not-comparable", reason: "not-consecutive-months" });
  });

  it("compares across a year boundary, which is still a consecutive pair", () => {
    const comparison = placeVegetationComparison(
      [
        { year: 2025, month: 12 },
        { year: 2026, month: 1 },
      ],
      [0.3, 0.5]
    );
    expect(comparison.kind).toBe("compared");
  });

  it("keeps each value with its own month, so a reversed pair still reads forwards", () => {
    // Values stay bound to the month they were sampled for; the underlying
    // summary orders the pair chronologically rather than differencing in the
    // order supplied, so the sign can never be inverted by argument order.
    const comparison = placeVegetationComparison([JUL, JUN], [0.42, 0.61]);
    expect(comparison.kind).toBe("compared");
    if (comparison.kind !== "compared") return;
    expect(comparison.direction).toBe("browning");
    expect(comparison.delta).toBeCloseTo(-0.19, 10);
  });

  it("refuses values outside the definitional NDVI range", () => {
    for (const pair of [
      [1.4, 0.6],
      [0.6, 1.4],
      [-1.2, 0.6],
      [Number.NaN, 0.6],
      [0.6, Number.POSITIVE_INFINITY],
    ] as const) {
      expect(placeVegetationComparison([JUN, JUL], [pair[0], pair[1]])).toEqual(
        {
          kind: "not-comparable",
          reason: "ndvi-out-of-range",
        }
      );
    }
  });

  it("accepts the endpoints of the definitional NDVI range", () => {
    expect(isPlausibleNdvi(NDVI_VALID_RANGE.min)).toBe(true);
    expect(isPlausibleNdvi(NDVI_VALID_RANGE.max)).toBe(true);
    expect(isPlausibleNdvi(0)).toBe(true);
    expect(isPlausibleNdvi(null)).toBe(false);
    expect(isPlausibleNdvi(1.000001)).toBe(false);
    expect(isPlausibleNdvi(-1.000001)).toBe(false);
  });

  it("prefers the range verdict when a pair is both out of range and non-adjacent", () => {
    expect(
      placeVegetationComparison([{ year: 2025, month: 6 }, JUL], [1.4, 0.6])
    ).toEqual({ kind: "not-comparable", reason: "ndvi-out-of-range" });
  });

  it("reports a negative NDVI pair, which water and snow legitimately produce", () => {
    const comparison = placeVegetationComparison([JUN, JUL], [-0.2, -0.05]);
    expect(comparison.kind).toBe("compared");
    if (comparison.kind !== "compared") return;
    expect(comparison.direction).toBe("greening");
  });
});
