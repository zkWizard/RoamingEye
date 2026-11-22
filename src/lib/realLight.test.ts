import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildColormapLut, hexToRgb, invertColormap } from "./probe";
import { LEGENDS } from "./legend";
import {
  displayRgb,
  NIGHT_FLOOR,
  SCIENCE_NIGHT_FLOOR,
  realLightGlsl,
  waterMask,
} from "./realLight";

const NDVI_GREEN = hexToRgb("#126e01");

function unit(rgb: { r: number; g: number; b: number }) {
  return { r: rgb.r / 255, g: rgb.g / 255, b: rgb.b / 255 };
}

function bytes(rgb: { r: number; g: number; b: number }) {
  return {
    r: Math.round(rgb.r * 255),
    g: Math.round(rgb.g * 255),
    b: Math.round(rgb.b * 255),
  };
}

describe("displayRgb", () => {
  const albedo = { r: 0.2, g: 0.5, b: 0.8 };

  it("returns the albedo unchanged when colours stay flat", () => {
    expect(
      displayRgb(albedo, "flat", { nDotL: -1, glint: 1, nDotH: 1 })
    ).toEqual(albedo);
  });

  it("darkens the night side to about a quarter of the albedo", () => {
    const night = displayRgb(albedo, "shaded", { nDotL: -1, glint: 0 });
    expect(night.r).toBeCloseTo(albedo.r * NIGHT_FLOOR, 5);
    expect(night.g).toBeCloseTo(albedo.g * NIGHT_FLOOR, 5);
    expect(night.b).toBeCloseTo(albedo.b * NIGHT_FLOOR, 5);
  });

  it("keeps the day side at the albedo when there is no glint", () => {
    const noon = displayRgb(albedo, "shaded", { nDotL: 1, glint: 0 });
    expect(noon).toEqual(albedo);
  });

  it("spreads the terminator over a soft band", () => {
    const green = { r: 0.05, g: 0.12, b: 0.02 };
    const lum = (c: { r: number; g: number; b: number }) =>
      0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    const steps = [-0.3, -0.1, 0.05, 0.2, 0.45].map((nDotL) =>
      lum(
        displayRgb(green, "shaded", {
          nDotL,
          nightFloor: SCIENCE_NIGHT_FLOOR,
          coolNight: true,
        })
      )
    );
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]).toBeGreaterThan(steps[i - 1]);
    }
  });

  it("keeps a dark green darker at night and at the twilight band", () => {
    const green = { r: 0.05, g: 0.12, b: 0.02 };
    const lum = (c: { r: number; g: number; b: number }) =>
      0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    const day = displayRgb(green, "shaded", {
      nDotL: 1,
      nightFloor: SCIENCE_NIGHT_FLOOR,
      coolNight: true,
    });
    const night = displayRgb(green, "shaded", {
      nDotL: -1,
      nightFloor: SCIENCE_NIGHT_FLOOR,
      coolNight: true,
    });
    const twilight = displayRgb(green, "shaded", {
      nDotL: 0,
      nightFloor: SCIENCE_NIGHT_FLOOR,
      coolNight: true,
    });
    expect(lum(night)).toBeCloseTo(lum(green) * SCIENCE_NIGHT_FLOOR, 1);
    expect(lum(night)).toBeLessThan(lum(day) * 0.55);
    expect(lum(twilight)).toBeLessThan(lum(day));
    expect(night.b / night.g).toBeGreaterThan(day.b / day.g);
    expect(twilight.r).toBeGreaterThan(twilight.b);
  });

  it("warms the terminator", () => {
    const gray = { r: 0.4, g: 0.4, b: 0.4 };
    const twilight = displayRgb(gray, "shaded", { nDotL: 0, glint: 0 });
    expect(twilight.r).toBeGreaterThan(twilight.b);
    expect(twilight.r).toBeGreaterThan(gray.r * NIGHT_FLOOR);
  });

  it("adds a highlight on dark blue water and not on green land", () => {
    const ocean = { r: 0.02, g: 0.05, b: 0.12 };
    const land = { r: 0.15, g: 0.45, b: 0.12 };
    expect(waterMask(ocean)).toBeGreaterThan(0.5);
    expect(waterMask(land)).toBe(0);
    const glinting = displayRgb(ocean, "shaded", {
      nDotL: 1,
      nDotH: 1,
      glint: 1,
    });
    const plain = displayRgb(ocean, "shaded", { nDotL: 1, nDotH: 1, glint: 0 });
    expect(glinting.r).toBeGreaterThan(plain.r);
  });
});

describe("science colours and the probe", () => {
  const legend = LEGENDS.ndvi;
  if (!("stops" in legend)) throw new Error("NDVI legend is a gradient");
  const lut = buildColormapLut(legend.stops);

  it("leaves an NDVI legend colour on the same probe reading when lighting is flat", () => {
    const source = invertColormap(NDVI_GREEN, lut);
    const shown = bytes(displayRgb(unit(NDVI_GREEN), "flat", { nDotL: -1 }));
    expect(source).not.toBeNull();
    expect(invertColormap(shown, lut)).toBeCloseTo(source ?? 0, 5);
    expect(source ?? 0).toBeCloseTo(0.7, 1);
  });

  it("would move that reading if the probe sampled the night-shaded pixel", () => {
    const source = invertColormap(NDVI_GREEN, lut);
    const shaded = bytes(displayRgb(unit(NDVI_GREEN), "shaded", { nDotL: -1 }));
    const shadedReading = invertColormap(shaded, lut);
    expect(shadedReading === null || shadedReading !== source).toBe(true);
  });
});

describe("realLightGlsl", () => {
  it("bakes both night floors into the shader", () => {
    const source = realLightGlsl();
    expect(source).toContain(String(NIGHT_FLOOR));
    expect(source).toContain(String(SCIENCE_NIGHT_FLOOR));
  });

  it("still matches the overlay blend published by 3d-tiles-renderer", () => {
    const src = readFileSync(
      "node_modules/3d-tiles-renderer/src/three/plugins/images/overlays/wrapOverlaysMaterial.js",
      "utf8"
    );
    expect(src).toMatch(
      /tint\.rgb \*= tint\.a;\s*diffuseColor = tint \+ diffuseColor \* \( 1\.0 - tint\.a \);/
    );
  });
});
