import { describe, expect, it } from "vitest";
import {
  colorAlong,
  cssRamp,
  glslRampFunction,
  SPEED_STOPS,
  TEMP_STOPS,
} from "./ramp";
import { compass16, formatWindReadout, updatedAgoLabel } from "./readout";
import { windParticleCount, windPointSize } from "./tier";
import { componentsFromSpeedDirection, speedAndDirection } from "./field";

describe("colour ramps", () => {
  it("returns a stop colour on the stop and a blend between them", () => {
    expect(colorAlong(SPEED_STOPS, 0)).toEqual([48, 72, 168]);
    expect(colorAlong(SPEED_STOPS, 100)).toEqual([170, 24, 90]);
    const mid = colorAlong(TEMP_STOPS, -25);
    expect(mid[2]).toBeGreaterThan(mid[0]);
  });

  it("builds a CSS gradient and a GLSL function from the same stops", () => {
    expect(cssRamp(SPEED_STOPS)).toContain("linear-gradient");
    expect(cssRamp(SPEED_STOPS)).toContain("rgb(48, 72, 168)");
    const glsl = glslRampFunction("rampSpeed", SPEED_STOPS);
    expect(glsl).toContain("vec3 rampSpeed(float x)");
    expect(glsl).toContain("55.0");
  });
});

describe("wind readout", () => {
  it("names the compass point the wind comes from", () => {
    expect(compass16(0)).toBe("N");
    expect(compass16(225)).toBe("SW");
    expect(compass16(359)).toBe("N");
    const { u, v } = componentsFromSpeedDirection(14, 315);
    const motion = speedAndDirection(u, v);
    const text = formatWindReadout({ u, v, t: 3.2, ...motion }, false);
    expect(text).toContain("m/s from the NW");
    expect(formatWindReadout({ u, v, t: 3.2, ...motion }, true)).toContain(
      "3°C"
    );
  });

  it("says how many hours ago the field was built", () => {
    const now = Date.parse("2026-11-22T08:30:00Z");
    expect(updatedAgoLabel("2026-11-22T06:00:00Z", now)).toBe(
      "updated 2 h ago"
    );
    expect(updatedAgoLabel("2026-11-22T08:10:00Z", now)).toBe(
      "updated 0 h ago"
    );
    expect(updatedAgoLabel("not-a-time", now)).toBe("updated time unknown");
  });
});

describe("particle tier", () => {
  it("uses 40k until the device or the pixel ratio is limited", () => {
    expect(
      windParticleCount({
        hardwareConcurrency: 8,
        pixelRatio: 2,
        maxPixelRatio: 2,
      })
    ).toBe(40_000);
    expect(
      windParticleCount({
        deviceMemoryGb: 4,
        hardwareConcurrency: 8,
        pixelRatio: 2,
        maxPixelRatio: 2,
      })
    ).toBe(10_000);
    expect(
      windParticleCount({
        hardwareConcurrency: 2,
        pixelRatio: 1,
        maxPixelRatio: 1,
      })
    ).toBe(10_000);
    expect(
      windParticleCount({
        hardwareConcurrency: 8,
        pixelRatio: 1,
        maxPixelRatio: 2,
      })
    ).toBe(10_000);
  });

  it("stamps a smaller point when the camera is close", () => {
    expect(windPointSize(3.2)).toBeGreaterThan(windPointSize(1.3));
    expect(windPointSize(1.2)).toBeGreaterThanOrEqual(0.65);
    expect(windPointSize(4)).toBeLessThanOrEqual(1.35);
  });
});
