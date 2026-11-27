import { describe, expect, it } from "vitest";
import {
  parseBuildingHeight,
  parseBuildingMinHeight,
  placeLabelName,
} from "./buildingHeight";

describe("parseBuildingHeight", () => {
  it("prefers render_height from OpenMapTiles", () => {
    expect(parseBuildingHeight({ render_height: 48 })).toBe(48);
  });

  it("falls back through height and levels", () => {
    expect(parseBuildingHeight({ height: 22 })).toBe(22);
    expect(parseBuildingHeight({ "building:levels": 10 })).toBeCloseTo(32, 0);
    expect(parseBuildingHeight(null)).toBe(12);
  });

  it("clamps extreme values", () => {
    expect(parseBuildingHeight({ render_height: 900 })).toBe(420);
    expect(parseBuildingHeight({ render_height: 0.5 })).toBe(2);
  });
});

describe("parseBuildingMinHeight", () => {
  it("reads render_min_height when present", () => {
    expect(parseBuildingMinHeight({ render_min_height: 4 })).toBe(4);
  });
});

describe("placeLabelName", () => {
  it("picks an English name when available", () => {
    expect(placeLabelName({ name: "Paris", "name:en": "Paris" })).toBe("Paris");
    expect(placeLabelName({ "name:fr": "Lyon", name_en: "Lyon" })).toBe("Lyon");
    expect(placeLabelName({ rank: 1 })).toBeNull();
  });
});
