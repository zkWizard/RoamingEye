import { describe, expect, it } from "vitest";
import {
  MARINE_PLACE_METRIC,
  marineBoundarySstReading,
  unavailableMarineBoundarySstReading,
} from "./marinePlaceInsight";

describe("marine boundary SST insights", () => {
  it("keeps the source-month SST value and boundary coverage distinct from biology", () => {
    const reading = marineBoundarySstReading({
      dataMonth: { year: 2026, month: 3 },
      observedValue: 18.375,
      validFraction: 0.37,
      sourceImageDimensions: { width: 512, height: 512 },
    });

    expect(reading).toMatchObject({
      id: MARINE_PLACE_METRIC.id,
      value: "18.4 °C",
      kind: "observed-boundary-sea-surface-temperature",
      availability: "available",
      marineBiologyObservation: false,
      isForecast: false,
      dataMonth: { year: 2026, month: 3 },
      observedValue: 18.375,
      validFraction: 0.37,
      sourceImageDimensions: { width: 512, height: 512 },
    });
    expect(reading.detail).toContain("37% sampled boundary coverage");
    expect(reading.detail).toContain("rendered source image 512 x 512 px");
    expect(reading.detail).toContain(
      "MODIS_AQUA_L3_SST_THERMAL_MONTHLY_9KM_DAYTIME_V2019.0 v2019.0"
    );
    expect(reading.detail).toContain("not a marine-biology observation");
  });

  it("does not invent a reading when the sampled boundary has zero SST coverage", () => {
    const reading = marineBoundarySstReading({
      dataMonth: { year: 2026, month: 3 },
      observedValue: null,
      validFraction: 0,
      sourceImageDimensions: { width: 512, height: 512 },
    });

    expect(reading.value).toBe("No usable SST observation");
    expect(reading.availability).toBe("no-usable-sst");
    expect(reading.observedValue).toBeNull();
    expect(reading.validFraction).toBe(0);
    expect(reading.sourceImageDimensions).toEqual({
      width: 512,
      height: 512,
    });
    expect(reading.detail).toContain("0% sampled boundary coverage");
  });

  it("rejects invalid sampling coverage instead of presenting its value", () => {
    const reading = marineBoundarySstReading({
      dataMonth: { year: 2026, month: 3 },
      observedValue: 21.2,
      validFraction: 1.1,
      sourceImageDimensions: { width: 512, height: 512 },
    });

    expect(reading.value).toBe("No usable SST observation");
    expect(reading.availability).toBe("no-usable-sst");
    expect(reading.observedValue).toBeNull();
    expect(reading.validFraction).toBeNull();
    expect(reading.detail).toContain("sampled coverage not supplied");
  });

  it("does not present an SST value outside the configured source scale", () => {
    const reading = marineBoundarySstReading({
      dataMonth: { year: 2026, month: 3 },
      observedValue: 40,
      validFraction: 1,
      sourceImageDimensions: { width: 512, height: 512 },
    });

    expect(reading.value).toBe("No usable SST observation");
    expect(reading.observedValue).toBeNull();
  });

  it("preserves exact low coverage even when display text rounds it", () => {
    const reading = marineBoundarySstReading({
      dataMonth: { year: 2026, month: 3 },
      observedValue: 18.375,
      validFraction: 0.004,
      sourceImageDimensions: { width: 1024, height: 512 },
    });

    expect(reading.value).toBe("18.4 °C");
    expect(reading.detail).toContain("0% sampled boundary coverage");
    expect(reading.validFraction).toBe(0.004);
    expect(reading.sourceImageDimensions).toEqual({
      width: 1024,
      height: 512,
    });
  });

  it("distinguishes sampling failure from sampled no-data", () => {
    const reading = unavailableMarineBoundarySstReading({
      year: 2026,
      month: 3,
    });

    expect(reading).toMatchObject({
      availability: "sampling-unavailable",
      observedValue: null,
      validFraction: null,
      sourceImageDimensions: null,
      marineBiologyObservation: false,
      isForecast: false,
    });
  });
});
