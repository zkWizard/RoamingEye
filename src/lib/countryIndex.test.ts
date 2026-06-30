import { describe, it, expect } from "vitest";
import { pointInRing, buildCountryIndex } from "./countryIndex";

// A unit square ring from (0,0) to (10,10).
const square: [number, number][] = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
  [0, 0],
];

describe("pointInRing", () => {
  it("detects inside vs outside", () => {
    expect(pointInRing(5, 5, square)).toBe(true);
    expect(pointInRing(15, 5, square)).toBe(false);
    expect(pointInRing(-1, -1, square)).toBe(false);
  });
});

describe("buildCountryIndex", () => {
  const index = buildCountryIndex({
    features: [
      {
        properties: { name: "Squareland" },
        geometry: { type: "Polygon", coordinates: [square] },
      },
      {
        // A polygon with a hole in the middle.
        properties: { name: "Holeystan" },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [20, 20],
              [40, 20],
              [40, 40],
              [20, 40],
              [20, 20],
            ],
            [
              [28, 28],
              [32, 28],
              [32, 32],
              [28, 32],
              [28, 28],
            ],
          ],
        },
      },
    ],
  });

  it("names the country containing a point (lat, lon)", () => {
    expect(index.lookup(5, 5)).toBe("Squareland");
  });

  it("returns null over open water", () => {
    expect(index.lookup(50, 50)).toBeNull();
  });

  it("respects holes", () => {
    expect(index.lookup(25, 25)).toBe("Holeystan"); // in the ring
    expect(index.lookup(30, 30)).toBeNull(); // inside the hole
  });
});
