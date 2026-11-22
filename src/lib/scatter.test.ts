import { describe, expect, it } from "vitest";
import {
  NIGHT_KEEP,
  RAYLEIGH,
  WARM,
  atmosphereFragmentShader,
  scatterSample,
} from "./scatter";

describe("single-scattering limb", () => {
  it("is blue on the day limb and dark at the disk centre", () => {
    const limb = scatterSample(1, 1);
    const centre = scatterSample(1, 0);
    expect(limb.b).toBeGreaterThan(limb.r);
    expect(limb.b).toBeCloseTo(RAYLEIGH[2], 5);
    expect(limb.alpha).toBeGreaterThan(0.8);
    expect(centre.alpha).toBe(0);
  });

  it("warms the terminator", () => {
    const twilight = scatterSample(0.02, 1);
    const day = scatterSample(1, 1);
    expect(twilight.r).toBeGreaterThan(twilight.b);
    expect(twilight.r / twilight.b).toBeGreaterThan(day.r / day.b);
    expect(twilight.r).toBeCloseTo(WARM[0], 1);
  });

  it("fades on the night side", () => {
    const day = scatterSample(1, 1);
    const night = scatterSample(-1, 1);
    expect(night.alpha).toBeLessThan(day.alpha * 0.25);
    expect(night.alpha).toBeCloseTo((day.alpha * NIGHT_KEEP * 0.05) / 1, 1);
  });

  it("writes those constants into the fragment shader", () => {
    const source = atmosphereFragmentShader();
    expect(source).toContain(
      `vec3(${RAYLEIGH[0]}, ${RAYLEIGH[1]}, ${RAYLEIGH[2]})`
    );
    expect(source).toContain(`vec3(${WARM[0]}, ${WARM[1]}, ${WARM[2]})`);
    expect(source).toContain(`${NIGHT_KEEP}`);
  });
});
