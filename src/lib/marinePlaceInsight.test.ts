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
      geography: { kind: "boundary", label: "Monterey County" },
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
      geography: { kind: "boundary", label: "Monterey County" },
      observationStatus: "observed",
      sampledGeography: {
        kind: "searched-area-boundary",
        label: "Monterey Bay",
      },
      // Coverage and image provenance are also surfaced at the top level for
      // consumers that do not read the structured summary below.
      validFraction: 0.37,
      sourceImageDimensions: { width: 512, height: 512 },
      unavailableReason: null,
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
      geography: { kind: "boundary", label: "Monterey County" },
    });
    expect(reading.detail).toContain(
      "usable SST over 37% of the searched boundary (sparse); mean covers only those pixels"
    );
    expect(reading.spatialSupport).toMatchObject({
      status: "usable-sample",
      validFraction: 0.37,
      tier: "sparse",
      meanScope: "usable-sampled-pixels",
      representsSearchedBoundary: false,
    });
    expect(reading.detail).toContain("sampled within Monterey Bay");
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
      geography: { kind: "boundary", label: "Monterey County" },
    });

    expect(reading.value).toBe("No usable SST observation");
    expect(reading.availability).toBe("no-usable-sst");
    expect(reading.observedValue).toBeNull();
    expect(reading.observationStatus).toBe("no-sst-coverage");
    expect(reading.validFraction).toBe(0);
    expect(reading.sourceImageDimensions).toEqual({
      width: 512,
      height: 512,
    });
    expect(reading.unavailableReason).toBe("zero-sst-coverage");
    expect(reading.coverage?.coverage).toEqual({
      status: "no-sst-coverage",
      footprint: "unknown",
      validFraction: 0,
      reason: "zero-sst-coverage",
      // Native sample counts travel with coverage; zero-coverage boundaries
      // carry none rather than an invented zero tally.
      sampleCounts: null,
    });
    expect(reading.detail).toContain(
      "no usable SST anywhere in the searched boundary"
    );
    expect(reading.spatialSupport).toMatchObject({
      status: "no-usable-sample",
      validFraction: 0,
      meanScope: null,
      reason: "zero-usable-share",
    });
  });

  it("rejects invalid sampling coverage instead of presenting its value", () => {
    const reading = marineBoundarySstReading({
      geographyLabel: "Monterey Bay",
      dataMonth: { year: 2026, month: 3 },
      observedValue: 21.2,
      validFraction: 1.1,
      sourceImageDimensions: { width: 512, height: 512 },
      geography: { kind: "boundary", label: "Monterey County" },
    });

    expect(reading.value).toBe("No usable SST observation");
    expect(reading.availability).toBe("no-usable-sst");
    expect(reading.observedValue).toBeNull();
    expect(reading.observationStatus).toBe("invalid-sample");
    expect(reading.unavailableReason).toBe("invalid-coverage");
    expect(reading.coverage?.coverage.reason).toBe("invalid-coverage");
    expect(reading.validFraction).toBeNull();
    // A rejected fraction was still supplied; saying "not supplied" would
    // hide which of the two happened.
    expect(reading.detail).toContain("sampled boundary share invalid");
    expect(reading.spatialSupport).toMatchObject({
      status: "unclassifiable",
      validFraction: null,
      tier: null,
      reason: "invalid-coverage-fraction",
    });
  });

  it("does not present an SST value outside the configured source scale", () => {
    const reading = marineBoundarySstReading({
      geographyLabel: "Monterey Bay",
      dataMonth: { year: 2026, month: 3 },
      observedValue: 40,
      validFraction: 1,
      sourceImageDimensions: { width: 512, height: 512 },
      geography: { kind: "boundary", label: "Monterey County" },
    });

    expect(reading.value).toBe("No usable SST observation");
    expect(reading.observedValue).toBeNull();
    expect(reading.observationStatus).toBe("invalid-sample");
    expect(reading.unavailableReason).toBe("invalid-sst-value");
  });

  it("withholds SST when source image dimensions are invalid", () => {
    const reading = marineBoundarySstReading({
      geographyLabel: "Monterey Bay",
      dataMonth: { year: 2026, month: 3 },
      observedValue: 18.4,
      validFraction: 0.75,
      sourceImageDimensions: { width: 0, height: 512 },
    });

    expect(reading).toMatchObject({
      value: "No usable SST observation",
      observedValue: null,
      observationStatus: "invalid-sample",
      unavailableReason: "invalid-source-image-dimensions",
    });
    expect(reading.coverage?.sourceImageDimensions).toBeNull();
    expect(reading.detail).toContain(
      "rendered source image dimensions invalid"
    );
    expect(reading.detail).toContain("not a marine-biology observation");
  });

  it("keeps source mapping failures distinct from sampled no-coverage", () => {
    const reading = unavailableMarineBoundarySstReading(
      { year: 2026, month: 3 },
      { kind: "boundary", label: "Monterey County" }
    );

    expect(reading).toMatchObject({
      value: "Unavailable",
      observationStatus: "source-unavailable",
      coverage: null,
      marineBiologyObservation: false,
      dataMonth: { year: 2026, month: 3 },
      unavailableReason: "source-colormap-unavailable",
      geography: { kind: "boundary", label: "Monterey County" },
    });
    expect(reading.detail).toContain("boundary “Monterey County”");
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
    expect(reading.detail).toContain("sampled within unknown searched area");
  });

  it("does not print a stated temperature beside a rounded-down 0% share", () => {
    // A mostly-land searched boundary is the normal case for SST, which is
    // undefined over land. Rounding its sliver of water down to "0%" read as
    // "no data" next to a stated temperature.
    const reading = marineBoundarySstReading({
      geographyLabel: "Monterey Bay",
      dataMonth: { year: 2026, month: 3 },
      observedValue: 18.375,
      validFraction: 0.004,
      sourceImageDimensions: { width: 1024, height: 512 },
    });

    expect(reading.value).toBe("18.4 °C");
    expect(reading.detail).toContain(
      "usable SST over <1% of the searched boundary (sparse); mean covers only those pixels"
    );
    expect(reading.detail).not.toContain("0%");
    // The exact share still travels unrounded for export consumers.
    expect(reading.spatialSupport.validFraction).toBe(0.004);
    expect(reading.validFraction).toBe(0.004);
    expect(reading.sourceImageDimensions).toEqual({
      width: 1024,
      height: 512,
    });
  });

  it("reports a ramp-floor boundary mean as an upper bound, not a measurement", () => {
    // 0.075 °C is the midpoint of the published ramp's lowest bin — the value
    // every sub-zero pixel is decoded as, because GIBS renders all of them in
    // one open end-cap colour. Reporting it as "0.1 °C" would put the Barents
    // or Bering Sea in winter ~1.9 °C warmer than the product observed.
    const reading = marineBoundarySstReading({
      geographyLabel: "Barents Sea",
      dataMonth: { year: 2026, month: 3 },
      observedValue: 0.075,
      validFraction: 0.88,
      sourceImageDimensions: { width: 512, height: 512 },
    });

    expect(reading.value).toBe("≤ 0.1 °C");
    expect(reading.observedValue).toBe(0.075);
    expect(reading.availability).toBe("available");
    expect(reading.observationStatus).toBe("observed");
    expect(reading.rampCensoring).toMatchObject({
      status: "at-ramp-floor",
      possiblyCensored: true,
      boundDirection: "upper",
    });
    expect(reading.detail).toContain("upper bound");
    expect(reading.detail).toContain("not a marine-biology observation");
  });

  it("leaves an in-ramp boundary mean unqualified", () => {
    const reading = marineBoundarySstReading({
      geographyLabel: "Monterey Bay",
      dataMonth: { year: 2026, month: 3 },
      observedValue: 18.375,
      validFraction: 0.37,
      sourceImageDimensions: { width: 512, height: 512 },
    });

    expect(reading.value).toBe("18.4 °C");
    expect(reading.rampCensoring).toMatchObject({
      status: "within-published-ramp",
      possiblyCensored: false,
    });
    expect(reading.detail).not.toContain("upper bound");
    expect(reading.detail).not.toContain("lower bound");
    expect(reading.detail).not.toContain("published colormap");
  });

  it("does not judge ramp position when there is no usable observation", () => {
    const reading = marineBoundarySstReading({
      geographyLabel: "Nebraska",
      dataMonth: { year: 2026, month: 3 },
      observedValue: null,
      validFraction: 0,
      sourceImageDimensions: { width: 512, height: 512 },
    });

    expect(reading.value).toBe("No usable SST observation");
    expect(reading.rampCensoring).toBeNull();
    expect(
      unavailableMarineBoundarySstReading(
        { year: 2026, month: 3 },
        "Monterey Bay"
      ).rampCensoring
    ).toBeNull();
  });

  it("distinguishes sampling failure from sampled no-data", () => {
    const reading = unavailableMarineBoundarySstReading(
      { year: 2026, month: 3 },
      "Monterey Bay"
    );

    expect(reading).toMatchObject({
      availability: "sampling-unavailable",
      observedValue: null,
      validFraction: null,
      sourceImageDimensions: null,
      marineBiologyObservation: false,
      isForecast: false,
    });
  });

  it("keeps source-mapping and boundary-sampling failures distinct", () => {
    const month = { year: 2026, month: 3 };
    const geography = { kind: "boundary", label: "Monterey Bay" } as const;
    const colormap = unavailableMarineBoundarySstReading(
      month,
      geography,
      "source-colormap-unavailable"
    );
    const sampling = unavailableMarineBoundarySstReading(
      month,
      geography,
      "boundary-sampling-failed"
    );

    expect(colormap).toMatchObject({
      observationStatus: "source-unavailable",
      unavailableReason: "source-colormap-unavailable",
    });
    expect(colormap.detail).toContain("published source colormap");
    expect(sampling).toMatchObject({
      observationStatus: "sampling-failed",
      unavailableReason: "boundary-sampling-failed",
    });
    expect(sampling.detail).toContain("searched boundary");
    expect(sampling.detail).not.toContain("published source colormap");
  });
});

describe("same-calendar-month year-over-year boundary SST difference", () => {
  const target = {
    geographyLabel: "Monterey Bay",
    dataMonth: { year: 2026, month: 3 } as const,
    observedValue: 18.375,
    validFraction: 0.62,
    sourceImageDimensions: { width: 512, height: 512 },
  };

  it("differences two supplied observations without claiming a trend", () => {
    const reading = marineBoundarySstReading({
      ...target,
      priorYear: {
        dataMonth: { year: 2025, month: 3 },
        observedValue: 17.5,
        validFraction: 0.58,
      },
    });

    expect(reading.yearOverYear).toMatchObject({
      kind: "same-calendar-month-boundary-sst-difference",
      status: "available",
      isForecast: false,
      isTrend: false,
      claimScope: "descriptive-difference-between-two-observations-only",
      marineBiologyObservation: false,
      priorDataMonth: { year: 2025, month: 3 },
      priorObservedValue: 17.5,
      priorValidFraction: 0.58,
      direction: "warmer",
      differenceUnit: "°C",
      reason: null,
    });
    expect(reading.yearOverYear.difference).toBeCloseTo(0.875, 10);
    // The weaker of the two coverages, never their mean, so the comparison is
    // not presented as better supported than its thinnest month.
    expect(reading.yearOverYear.minValidFraction).toBeCloseTo(0.58, 10);
    expect(reading.yearOverYear.validFractionDelta).toBeCloseTo(0.04, 10);
    expect(reading.detail).toContain("+0.9 °C vs Mar 2025");
    expect(reading.detail).toContain("58% sampled coverage that month");
    expect(reading.detail).toContain("not a trend");
  });

  it("reports a cooler difference and an unchanged pair by sign only", () => {
    const cooler = marineBoundarySstReading({
      ...target,
      priorYear: {
        dataMonth: { year: 2025, month: 3 },
        observedValue: 19.375,
        validFraction: 0.62,
      },
    });
    const unchanged = marineBoundarySstReading({
      ...target,
      priorYear: {
        dataMonth: { year: 2025, month: 3 },
        observedValue: 18.375,
        validFraction: 0.62,
      },
    });

    expect(cooler.yearOverYear.direction).toBe("cooler");
    expect(cooler.yearOverYear.difference).toBeCloseTo(-1, 10);
    expect(cooler.detail).toContain("-1.0 °C vs Mar 2025");
    expect(unchanged.yearOverYear).toMatchObject({
      direction: "unchanged",
      difference: 0,
      validFractionDelta: 0,
    });
  });

  it("refuses a month that is not exactly one year earlier", () => {
    for (const priorMonth of [
      { year: 2025, month: 2 },
      { year: 2026, month: 2 },
      { year: 2024, month: 3 },
      { year: 2025, month: 13 },
    ]) {
      const reading = marineBoundarySstReading({
        ...target,
        priorYear: {
          dataMonth: priorMonth,
          observedValue: 17.5,
          validFraction: 0.58,
        },
      });

      // A neighbouring month would report the seasonal cycle as a change, so
      // the offered month is retained but never differenced.
      expect(reading.yearOverYear).toMatchObject({
        status: "not-same-calendar-month-one-year-earlier",
        priorDataMonth: priorMonth,
        difference: null,
        direction: null,
        priorObservedValue: null,
        reason: "not-same-calendar-month-one-year-earlier",
      });
    }
  });

  it("states an unusable prior year instead of dropping it", () => {
    for (const priorYear of [
      { observedValue: null, validFraction: 0.58 },
      { observedValue: 17.5, validFraction: 0 },
      { observedValue: 17.5, validFraction: 1.4 },
      { observedValue: 17.5, validFraction: Number.NaN },
      { observedValue: Number.POSITIVE_INFINITY, validFraction: 0.58 },
      // Outside the published SST scale, so not a physical source value.
      { observedValue: 500, validFraction: 0.58 },
    ]) {
      const reading = marineBoundarySstReading({
        ...target,
        priorYear: { dataMonth: { year: 2025, month: 3 }, ...priorYear },
      });

      expect(reading.yearOverYear).toMatchObject({
        status: "prior-year-not-usable",
        priorDataMonth: { year: 2025, month: 3 },
        difference: null,
        minValidFraction: null,
        validFractionDelta: null,
      });
      // The target month itself is unaffected by an unusable comparison.
      expect(reading.observedValue).toBe(18.375);
      expect(reading.detail).not.toContain("vs Mar 2025");
    }
  });

  it("does not difference against an unusable target month", () => {
    const reading = marineBoundarySstReading({
      ...target,
      observedValue: null,
      validFraction: 0,
      priorYear: {
        dataMonth: { year: 2025, month: 3 },
        observedValue: 17.5,
        validFraction: 0.58,
      },
    });

    expect(reading.yearOverYear).toMatchObject({
      status: "target-not-usable",
      priorDataMonth: { year: 2025, month: 3 },
      difference: null,
    });
    expect(reading.value).toBe("No usable SST observation");
  });

  it("stays explicit when no prior-year sample was supplied at all", () => {
    const reading = marineBoundarySstReading(target);
    const unavailable = unavailableMarineBoundarySstReading(
      { year: 2026, month: 3 },
      "Monterey Bay"
    );

    expect(reading.yearOverYear).toMatchObject({
      status: "not-supplied",
      priorDataMonth: null,
      difference: null,
      reason: "not-supplied",
    });
    expect(reading.detail).not.toContain("not a trend");
    // Sampling never completed, so there is no target to compare against.
    expect(unavailable.yearOverYear.status).toBe("target-not-usable");
  });
});
