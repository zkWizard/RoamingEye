import { describe, expect, it } from "vitest";
import { longitudeArc, placeFixFromGeometry, pointBox } from "./outline";

describe("longitudeArc", () => {
  it("frames a date-line cluster on the short arc", () => {
    const arc = longitudeArc([177.2, 178.4, 179.1, -179.8]);
    expect(arc).not.toBeNull();
    expect(arc!.span).toBeCloseTo(3, 0);
    expect(arc!.west).toBeCloseTo(177.2, 3);
    expect(arc!.east).toBeCloseTo(-179.8, 3);
    expect(arc!.center).toBeCloseTo(178.7, 1);
    expect(arc!.west).toBeGreaterThan(arc!.east);
  });

  it("keeps a wide outline wide", () => {
    const arc = longitudeArc([-170, -100, -30, 40, 110, 170]);
    expect(arc!.span).toBeGreaterThan(180);
  });

  it("frames Spain on a small arc that does not cross the date line", () => {
    const arc = longitudeArc([-9.3, -3.2, 0.4, 3.1]);
    expect(arc!.span).toBeGreaterThan(10);
    expect(arc!.span).toBeLessThan(20);
    expect(arc!.west).toBeLessThan(arc!.east);
  });
});

describe("pointBox", () => {
  it("wraps a pad that crosses the date line", () => {
    const [south, north, west, east] = pointBox(0, 179.8, 0.4);
    expect(south).toBeCloseTo(-0.4);
    expect(north).toBeCloseTo(0.4);
    expect(west).toBeCloseTo(179.4);
    expect(east).toBeCloseTo(-179.8);
    expect(west).toBeGreaterThan(east);
  });
});

describe("placeFixFromGeometry", () => {
  it("reads a polygon and ignores a geometry with no coordinates", () => {
    const fix = placeFixFromGeometry({
      type: "Polygon",
      coordinates: [
        [
          [177, -19],
          [179, -16],
          [-179.5, -17],
          [178, -18],
          [177, -19],
        ],
      ],
    });
    expect(fix).not.toBeNull();
    expect(fix!.boundingBox[2]).toBeGreaterThan(fix!.boundingBox[3]);
    expect(fix!.lon).toBeGreaterThan(170);
    expect(placeFixFromGeometry({ type: "Polygon" })).toBeNull();
  });
});
