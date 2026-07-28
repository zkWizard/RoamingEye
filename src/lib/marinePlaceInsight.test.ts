import { describe, expect, it } from "vitest";
import {
  MARINE_PLACE_METRIC,
  marineBoundarySstReading,
  unavailableMarineBoundarySstReading,
} from "./marinePlaceInsight";

describe("marine boundary SST insights", () => {
  it("keeps the source-month SST value and boundary coverage distinct from biology", () => {
    const reading = marineBoundarySstReading({
      geographyLabel: "Monterey Bay",
      dataMonth: { year: 2026, month: 3 },
      observedValue: 18.375,
      validFraction: 0.37,
      sourceImageDimensions: { width: 512, height: 512 },
    });

    expect(reading).toMatchObject({
      id: MARINE_PLACE_METRIC.id,
      value: "18.4 °C",
      kind: "observed-boundary-sea-surface-temperature",
      marineBiologyObservation: false,
      isForecast: false,
      dataMonth: { year: 2026, month: 3 },
      observedValue: 18.375,
      observationStatus: "observed",
      sampledGeography: {
        kind: "searched-area-boundary",
        label: "Monterey Bay",
      },
    });
    expect(reading.coverage).toMatchObject({
      kind: "sea-surface-temperature-coverage",
      marineBiologyObservation: false,
      isForecast: false,
      dataMonth: { year: 2026, month: 3 },
      coverage: {
        status: "unknown",
        footprint: "unknown",
        validFraction: 0.37,
        reason: "unknown-footprint",
      },
      sourceImageDimensions: { width: 512, height: 512 },
    });
    expect(reading.detail).toContain("37% sampled boundary coverage");
    expect(reading.detail).toContain("for Monterey Bay");
    expect(reading.detail).toContain("rendered source image 512 x 512 px");
    expect(reading.detail).toContain(
      "MODIS_AQUA_L3_SST_THERMAL_MONTHLY_9KM_DAYTIME_V2019.0 v2019.0"
    );
    expect(reading.detail).toContain("not a marine-biology observation");
  });

  it("does not invent a reading when the sampled boundary has zero SST coverage", () => {
    const reading = marineBoundarySstReading({
      geographyLabel: "Monterey Bay",
      dataMonth: { year: 2026, month: 3 },
      observedValue: null,
      validFraction: 0,
      sourceImageDimensions: { width: 512, height: 512 },
    });

    expect(reading.value).toBe("No usable SST observation");
    expect(reading.observedValue).toBeNull();
    expect(reading.observationStatus).toBe("no-sst-coverage");
    expect(reading.coverage?.coverage).toEqual({
      status: "no-sst-coverage",
      footprint: "unknown",
      validFraction: 0,
      reason: "zero-sst-coverage",
      // Native sample counts travel with coverage; zero-coverage boundaries
      // carry none rather than an invented zero tally.
      sampleCounts: null,
    });
    expect(reading.detail).toContain("0% sampled boundary coverage");
  });

  it("rejects invalid sampling coverage instead of presenting its value", () => {
    const reading = marineBoundarySstReading({
      geographyLabel: "Monterey Bay",
      dataMonth: { year: 2026, month: 3 },
      observedValue: 21.2,
      validFraction: 1.1,
      sourceImageDimensions: { width: 512, height: 512 },
    });

    expect(reading.value).toBe("No usable SST observation");
    expect(reading.observedValue).toBeNull();
    expect(reading.observationStatus).toBe("invalid-sample");
    expect(reading.coverage?.coverage.reason).toBe("invalid-coverage");
    expect(reading.detail).toContain("sampled coverage not supplied");
  });

  it("does not present an SST value outside the configured source scale", () => {
    const reading = marineBoundarySstReading({
      geographyLabel: "Monterey Bay",
      dataMonth: { year: 2026, month: 3 },
      observedValue: 40,
      validFraction: 1,
      sourceImageDimensions: { width: 512, height: 512 },
    });

    expect(reading.value).toBe("No usable SST observation");
    expect(reading.observedValue).toBeNull();
    expect(reading.observationStatus).toBe("invalid-sample");
  });

  it("keeps source mapping failures distinct from sampled no-coverage", () => {
    const reading = unavailableMarineBoundarySstReading(
      {
        year: 2026,
        month: 3,
      },
      "Monterey Bay"
    );

    expect(reading).toMatchObject({
      value: "Unavailable",
      observationStatus: "source-unavailable",
      coverage: null,
      marineBiologyObservation: false,
      dataMonth: { year: 2026, month: 3 },
    });
  });

  it("withholds SST when rendered image dimensions are malformed", () => {
    const reading = marineBoundarySstReading({
      geographyLabel: "Monterey Bay",
      dataMonth: { year: 2026, month: 3 },
      observedValue: 18.4,
      validFraction: 0.75,
      sourceImageDimensions: { width: 0, height: 512 },
    });

    expect(reading.value).toBe("No usable SST observation");
    expect(reading.observedValue).toBeNull();
    expect(reading.detail).toContain(
      "rendered source image dimensions invalid"
    );
    expect(reading.detail).toContain("not a marine-biology observation");
  });

  it("retains searched geography when SST sampling is unavailable", () => {
    const reading = unavailableMarineBoundarySstReading(
      { year: 2026, month: 3 },
      "  Monterey Bay  "
    );

    expect(reading.sampledGeography).toEqual({
      kind: "searched-area-boundary",
      label: "Monterey Bay",
    });
    expect(reading.detail).toContain("for Monterey Bay");
    expect(reading.value).toBe("Unavailable");
  });

  it("makes a missing geography label explicit instead of inventing one", () => {
    const reading = marineBoundarySstReading({
      geographyLabel: " ",
      dataMonth: { year: 2026, month: 3 },
      observedValue: 18.375,
      validFraction: 1,
      sourceImageDimensions: { width: 512, height: 512 },
    });

    expect(reading.sampledGeography.label).toBe("unknown searched area");
    expect(reading.detail).toContain("for unknown searched area");
  });
});
