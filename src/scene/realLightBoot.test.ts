import { describe, expect, it } from "vitest";
import {
  formatLightQuery,
  parseLightQuery,
  clockForLayer,
} from "./realLightBoot";

describe("real light share query", () => {
  it("omits the default and names a change", () => {
    expect(formatLightQuery({ real: true, science: true })).toBe("");
    expect(formatLightQuery({ real: false, science: false })).toBe("light=off");
    expect(formatLightQuery({ real: true, science: false })).toBe("light=flat");
  });

  it("reads only the two choices a link is allowed to carry", () => {
    expect(parseLightQuery("#layer=ndvi&light=off")).toEqual({
      real: false,
      science: false,
    });
    expect(parseLightQuery("light=flat")).toEqual({
      real: true,
      science: false,
    });
    expect(parseLightQuery("light=science")).toEqual({
      real: true,
      science: true,
    });
    expect(parseLightQuery("#light=on")).toBeNull();
    expect(parseLightQuery("#layer=ndvi")).toBeNull();
  });
});

describe("clockForLayer", () => {
  const now = new Date("2026-11-22T05:48:00Z");
  const month = { year: 2026, month: 7 };

  it("uses the month only while a monthly layer is drawn", () => {
    expect(
      clockForLayer({
        now,
        month,
        staticLayer: false,
        annual: false,
        scienceDrawn: true,
      }).monthlyLayerVisible
    ).toBe(true);
    expect(
      clockForLayer({
        now,
        month,
        staticLayer: true,
        annual: false,
        scienceDrawn: true,
      }).monthlyLayerVisible
    ).toBe(false);
    expect(
      clockForLayer({
        now,
        month,
        staticLayer: false,
        annual: true,
        scienceDrawn: true,
      }).monthlyLayerVisible
    ).toBe(false);
  });
});
