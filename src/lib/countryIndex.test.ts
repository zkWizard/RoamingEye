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

  it("uses the short arc for polygons crossing the antimeridian", () => {
    const dateline = buildCountryIndex({
      features: [
        {
          properties: { name: "Dateline Islands" },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [178, -10],
                [-178, -10],
                [-178, 10],
                [178, 10],
                [178, -10],
              ],
            ],
          },
        },
      ],
    });

    expect(dateline.lookup(0, 179)).toBe("Dateline Islands");
    expect(dateline.lookup(0, -179)).toBe("Dateline Islands");
    expect(dateline.lookup(0, 0)).toBeNull();
  });

  it("keeps antimeridian-crossing holes unavailable", () => {
    const dateline = buildCountryIndex({
      features: [
        {
          properties: { name: "Dateline Atoll" },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [176, -10],
                [-176, -10],
                [-176, 10],
                [176, 10],
                [176, -10],
              ],
              [
                [179, -2],
                [-179, -2],
                [-179, 2],
                [179, 2],
                [179, -2],
              ],
            ],
          },
        },
      ],
    });

    expect(dateline.lookup(5, 179.5)).toBe("Dateline Atoll");
    expect(dateline.lookup(0, 179.5)).toBeNull();
    expect(dateline.lookup(0, -179.5)).toBeNull();
  });

  it("indexes MultiPolygon pieces in their own longitude frames", () => {
    const islands = buildCountryIndex({
      features: [
        {
          properties: { name: "Separated Islands" },
          geometry: {
            type: "MultiPolygon",
            coordinates: [
              [
                [
                  [178, -5],
                  [-179, -5],
                  [-179, 5],
                  [178, 5],
                  [178, -5],
                ],
              ],
              [
                [
                  [20, -5],
                  [22, -5],
                  [22, 5],
                  [20, 5],
                  [20, -5],
                ],
              ],
            ],
          },
        },
      ],
    });

    expect(islands.lookup(0, -179.5)).toBe("Separated Islands");
    expect(islands.lookup(0, 21)).toBe("Separated Islands");
    expect(islands.lookup(0, 100)).toBeNull();
  });
});
