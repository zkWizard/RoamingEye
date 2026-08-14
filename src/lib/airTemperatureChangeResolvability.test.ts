import { describe, expect, it } from "vitest";
import {
  AIR_TEMPERATURE_CHANGE_RESOLVABILITY_LIMITATIONS,
  AIR_TEMPERATURE_METRIC_ID,
  describeAirTemperatureChangeResolvability,
} from "./airTemperatureChangeResolvability";
import { conventionalUnitConversionFor } from "./climateConventionalUnits";
import { CLIMATE_METRICS } from "./climate";
import { MEASURED_INVERSION } from "./validation";

const SOURCE = CLIMATE_METRICS[AIR_TEMPERATURE_METRIC_ID].source;
const RMSE = MEASURED_INVERSION.airtemp.rmse as number;
const FLOOR = Math.SQRT2 * RMSE;

describe("air-temperature change resolvability", () => {
  it("keeps the premises the floor depends on", () => {
    // A measured figure must exist, or every verdict below is uncharacterized.
    expect(MEASURED_INVERSION.airtemp.rmse).not.toBeNull();
    // The module compares a kelvin error against a difference the readout
    // prints in Celsius. That is only licensed while the conversion applies no
    // scale; if this ever changes the module must withhold, not rescale.
    const conversion = conventionalUnitConversionFor(AIR_TEMPERATURE_METRIC_ID);
    expect(conversion?.scale).toBe(1);
    expect(conversion?.nativeUnit).toBe("K");
  });

  it("calls a difference inside the floor unresolved without asserting equality", () => {
    const result = describeAirTemperatureChangeResolvability(FLOOR / 2, SOURCE);
    expect(result?.resolution).toBe("unresolved");
    expect(result?.differenceFloorK).toBeCloseTo(FLOOR, 10);
    expect(result?.monthRmseK).toBe(RMSE);
    expect(result?.statement).toContain(
      "cannot separate it from colormap-inversion error"
    );
    expect(result?.statement).toContain(
      "does not assert that the two months were equally warm"
    );
    // The supplied difference is reported back unchanged; a verdict never
    // rewrites the comparison it qualifies.
    expect(result?.changeK).toBe(FLOOR / 2);
  });

  it("calls a difference above the floor resolved", () => {
    const result = describeAirTemperatureChangeResolvability(FLOOR * 2, SOURCE);
    expect(result?.resolution).toBe("resolved");
    expect(result?.statement).toContain("distinguishable from");
  });

  it("treats a difference exactly at the floor as unresolved", () => {
    // Strictly-greater is the conservative side of the boundary: a difference
    // that merely equals its own noise floor is not separated from it.
    expect(
      describeAirTemperatureChangeResolvability(FLOOR, SOURCE)?.resolution
    ).toBe("unresolved");
    expect(
      describeAirTemperatureChangeResolvability(-FLOOR, SOURCE)?.resolution
    ).toBe("unresolved");
  });

  it("is symmetric in sign", () => {
    const warm = describeAirTemperatureChangeResolvability(0.4, SOURCE);
    const cool = describeAirTemperatureChangeResolvability(-0.4, SOURCE);
    expect(warm?.resolution).toBe(cool?.resolution);
    expect(warm?.differenceFloorK).toBe(cool?.differenceFloorK);
    expect(warm?.statement).toContain("+0.4 K");
    expect(cool?.statement).toContain("-0.4 K");
  });

  it("returns null rather than a verdict when no finite difference is supplied", () => {
    expect(describeAirTemperatureChangeResolvability(null, SOURCE)).toBeNull();
    expect(
      describeAirTemperatureChangeResolvability(Number.NaN, SOURCE)
    ).toBeNull();
    expect(
      describeAirTemperatureChangeResolvability(
        Number.POSITIVE_INFINITY,
        SOURCE
      )
    ).toBeNull();
  });

  it("carries cited provenance, forecast refusal and scope limits", () => {
    const result = describeAirTemperatureChangeResolvability(0.2, SOURCE);
    expect(result?.isForecast).toBe(false);
    expect(result?.unit).toBe("K");
    expect(result?.source).toBe(SOURCE);
    expect(result?.statement).toContain(
      `${SOURCE.shortName} v${SOURCE.version}`
    );
    expect(result?.limitations).toBe(
      AIR_TEMPERATURE_CHANGE_RESOLVABILITY_LIMITATIONS
    );
    // Every limit names what the figure is not, so none may be empty.
    for (const limit of AIR_TEMPERATURE_CHANGE_RESOLVABILITY_LIMITATIONS) {
      expect(limit.length).toBeGreaterThan(0);
    }
  });

  it("states the floor is well above a tenth of a kelvin", () => {
    // The point of the clause: month-over-month steps of a few tenths are
    // ordinary near the seasonal turning points and throughout the deep
    // tropics, and every one of them sits inside this floor.
    expect(FLOOR).toBeGreaterThan(0.5);
    expect(
      describeAirTemperatureChangeResolvability(0.3, SOURCE)?.resolution
    ).toBe("unresolved");
  });
});
