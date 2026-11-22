import { describe, expect, it } from "vitest";
import {
  SATELLITE_GROUPS,
  celestrakGroupUrl,
  drawStride,
  groupCap,
  isLowTier,
  satelliteOverlayId,
} from "./groups";

describe("satellite groups", () => {
  it("uses the CelesTrak group ids the brief names", () => {
    expect(SATELLITE_GROUPS.map((group) => group.id)).toEqual([
      "stations",
      "starlink",
      "gps-ops",
      "weather",
      "resource",
      "visual",
    ]);
  });

  it("builds the GP JSON url", () => {
    expect(celestrakGroupUrl("gps-ops")).toBe(
      "https://celestrak.org/NORAD/elements/gp.php?GROUP=gps-ops&FORMAT=json"
    );
  });

  it("prefixes overlay ids so they cannot collide with map details", () => {
    expect(satelliteOverlayId("starlink")).toBe("sat-starlink");
  });
});

describe("drawStride", () => {
  it("thins Starlink to 1 in 4 at whole-Earth distance", () => {
    expect(drawStride("starlink", 3.2)).toBe(4);
    expect(drawStride("starlink", 2.2)).toBe(4);
    expect(drawStride("starlink", 2.19)).toBe(1);
  });

  it("never thins the other classes", () => {
    expect(drawStride("stations", 3.2)).toBe(1);
    expect(drawStride("gps-ops", 8)).toBe(1);
  });
});

describe("device tier", () => {
  it("treats a coarse pointer as a low tier", () => {
    expect(isLowTier({ coarsePointer: true })).toBe(true);
    expect(isLowTier({ coarsePointer: false, deviceMemoryGb: 8 })).toBe(false);
    expect(isLowTier({ coarsePointer: false, deviceMemoryGb: 2 })).toBe(true);
  });

  it("caps Starlink on a low tier and keeps the full feed on desktop", () => {
    expect(groupCap("starlink", true)).toBe(2500);
    expect(groupCap("starlink", false)).toBe(Number.POSITIVE_INFINITY);
    expect(groupCap("stations", true)).toBe(800);
  });
});
