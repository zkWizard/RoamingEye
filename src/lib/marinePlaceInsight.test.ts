import { describe, expect, it } from "vitest";
import {
  MARINE_PLACE_METRIC,
  marineBoundarySstReading,
  unavailableMarineBoundarySstReading,
} from "./marinePlaceInsight";
import { SST_SAMPLING_GATE_NOTE } from "./sstObservingConstraints";
import { MARINE_BOUNDARY_SST_COVERAGE_DISPARITY_LIMIT } from "./marineBoundarySstChange";

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
    // A reported mean must not read as a full-diurnal, all-weather monthly
    // mean: the cited product composites Aqua's daytime overpass on
    // cloud-screened days only.
    expect(reading.detail).toContain(SST_SAMPLING_GATE_NOTE);
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
    // The sampling-gate note qualifies a reported value. With no value to
    // qualify, appending it would imply one was withheld for a sampling reason
    // rather than absent for lack of coverage.
    expect(reading.detail).not.toContain(SST_SAMPLING_GATE_NOTE);
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

  it("claims no bound for an in-ramp boundary mean but says the screen is blind to the pixels", () => {
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
    // The mean is an area-weighted mean of per-pixel decodes, so its silence is
    // not evidence of an uncensored boundary — the probe says this for its own
    // averaged footprints and the place card samples through the same combiner.
    expect(reading.detail).toContain(
      "not evidence the boundary held no censored pixel"
    );
  });

  it("says a marked boundary mean's bound was read off the mean not its pixels", () => {
    const reading = marineBoundarySstReading({
      geographyLabel: "Barents Sea",
      dataMonth: { year: 2026, month: 3 },
      observedValue: 0.075,
      validFraction: 0.88,
      sourceImageDimensions: { width: 512, height: 512 },
    });

    expect(reading.detail).toContain(
      "that bound screens the boundary mean and not the pixels behind it"
    );
    // The two wordings are alternatives, never both: one explains a mark, the
    // other a silence.
    expect(reading.detail).not.toContain(
      "not evidence the boundary held no censored pixel"
    );
  });

  it("stays silent about averaged censoring with no usable observation", () => {
    for (const reading of [
      marineBoundarySstReading({
        geographyLabel: "Nebraska",
        dataMonth: { year: 2026, month: 3 },
        observedValue: null,
        validFraction: 0,
        sourceImageDimensions: { width: 512, height: 512 },
      }),
      unavailableMarineBoundarySstReading({ year: 2026, month: 3 }, "Nebraska"),
    ]) {
      expect(reading.detail).not.toContain("censored pixel");
      expect(reading.detail).not.toContain("per-pixel decodes");
    }
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

  // The difference is reduced from the same two boundary means the card already
  // qualifies as blind to per-pixel censoring, and its end-cap screen reads
  // those means — so the qualification has to reach it too, or the card states
  // an incomplete rule twice and corrects it once.
  it("carries the averaged-censoring qualification onto the stated difference", () => {
    const reading = marineBoundarySstReading({
      ...target,
      priorYear: {
        dataMonth: { year: 2025, month: 3 },
        observedValue: 17.5,
        validFraction: 0.58,
      },
    });

    expect(reading.detail).toContain(
      "the year-over-year difference above is taken between two such means"
    );
    expect(reading.detail).toContain(
      "not evidence that either month was uncensored"
    );
    // Still a statement about the colour ramp, never about the water.
    expect(reading.detail).not.toMatch(/heatwave|anomal|ecosystem|habitat/i);
  });

  it("qualifies a bounded difference by its inequality's reach instead", () => {
    // A prior-year month decoded into the ramp's open low cap bounds the
    // difference on one side, so the card prints an inequality on it.
    const reading = marineBoundarySstReading({
      ...target,
      priorYear: {
        dataMonth: { year: 2025, month: 3 },
        observedValue: 0.075,
        validFraction: 0.58,
      },
    });

    expect(reading.yearOverYear.differenceBound).toBe("lower");
    expect(reading.detail).toContain(
      "leaves censoring inside either month's footprint undetected"
    );
    expect(reading.detail).not.toContain("absence of an inequality");
  });

  it("adds no difference qualification when none is stated", () => {
    // No prior year at all, and a pair the colormap censored in opposing
    // directions: neither card states a difference, so neither gains a clause.
    const noPrior = marineBoundarySstReading(target);
    const withheld = marineBoundarySstReading({
      ...target,
      observedValue: 0.075,
      priorYear: {
        dataMonth: { year: 2025, month: 3 },
        observedValue: 0.075,
        validFraction: 0.58,
      },
    });

    expect(withheld.yearOverYear.status).toBe("censored-endpoints");
    for (const detail of [noPrior.detail, withheld.detail]) {
      expect(detail).not.toContain("year-over-year difference above");
    }
    // The value's own qualification is untouched on both.
    expect(noPrior.detail).toContain(
      "not evidence the boundary held no censored pixel"
    );
    expect(withheld.detail).toContain(
      "screens the boundary mean and not the pixels"
    );
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

describe("year-over-year SST differences respect the colormap's open end caps", () => {
  const IMAGE = { width: 512, height: 512 };

  function withPriorYear(observedValue: number, priorObservedValue: number) {
    return marineBoundarySstReading({
      geographyLabel: "Persian Gulf",
      dataMonth: { year: 2026, month: 8 },
      observedValue,
      validFraction: 0.7,
      sourceImageDimensions: IMAGE,
      priorYear: {
        dataMonth: { year: 2025, month: 8 },
        observedValue: priorObservedValue,
        validFraction: 0.68,
      },
    });
  }

  it("never reports 'unchanged' when both months saturate the warm cap", () => {
    // Both Augusts decode to the ceiling bin, so the difference is exactly 0 —
    // which previously read as "unchanged" about an unknowable change.
    const reading = withPriorYear(31.9, 31.9);
    expect(reading.yearOverYear.status).toBe("censored-endpoints");
    expect(reading.yearOverYear.direction).toBeNull();
    expect(reading.yearOverYear.difference).toBeNull();
    expect(reading.detail).not.toMatch(/unchanged/i);
    expect(reading.detail).toContain("no year-over-year difference stated");
  });

  it("renders a one-sided bound with its inequality", () => {
    const reading = withPriorYear(31.9, 24);
    expect(reading.yearOverYear.status).toBe("available");
    expect(reading.yearOverYear.differenceBound).toBe("lower");
    expect(reading.yearOverYear.direction).toBe("warmer");
    expect(reading.detail).toContain("≥ +7.9");
    expect(reading.detail).toContain("bounds this difference on one side only");
  });

  it("withholds the difference when both months sit on the cold cap", () => {
    // A sub-polar boundary sampled two Augusts apart: both decode into the floor
    // bin, so the two caps bound the difference in opposing directions.
    const reading = withPriorYear(0.05, 0.1);
    expect(reading.yearOverYear.status).toBe("censored-endpoints");
    expect(reading.yearOverYear.direction).toBeNull();
  });

  it("bounds the difference from above when the prior year is capped", () => {
    const reading = withPriorYear(24, 31.9);
    expect(reading.yearOverYear.differenceBound).toBe("upper");
    expect(reading.yearOverYear.direction).toBe("cooler");
    expect(reading.detail).toContain("≤ -7.9");
  });

  it("leaves an uncensored pair reporting a plain difference", () => {
    const reading = withPriorYear(18.4, 17.5);
    expect(reading.yearOverYear.status).toBe("available");
    expect(reading.yearOverYear.differenceBound).toBeNull();
    expect(reading.yearOverYear.direction).toBe("warmer");
    expect(reading.detail).not.toContain("≥");
  });
});

describe("marine boundary SST year-over-year coverage comparability", () => {
  const base = {
    geographyLabel: "Monterey Bay",
    dataMonth: { year: 2026, month: 3 } as const,
    observedValue: 18.375,
    sourceImageDimensions: { width: 512, height: 512 },
  };

  function withCoverages(targetFraction: number, priorFraction: number) {
    return marineBoundarySstReading({
      ...base,
      validFraction: targetFraction,
      priorYear: {
        dataMonth: { year: 2025, month: 3 },
        observedValue: 17.5,
        validFraction: priorFraction,
      },
    });
  }

  it("withholds the difference when the two months' usable shares differ grossly", () => {
    // A cloudy prior March cleared over a third of the bay; this March cleared
    // nearly all of it. Their arithmetic difference may record which water was
    // visible rather than how much the water warmed.
    const reading = withCoverages(0.94, 0.35);

    expect(reading.yearOverYear.status).toBe("incomparable-coverage");
    expect(reading.yearOverYear.difference).toBeNull();
    expect(reading.yearOverYear.direction).toBeNull();
    expect(reading.yearOverYear.priorObservedValue).toBeNull();
    expect(reading.yearOverYear.reason).toBe("coverage-disparity");
  });

  it("keeps the two support figures that justify withholding, and names them", () => {
    const reading = withCoverages(0.94, 0.35);

    expect(reading.yearOverYear.minValidFraction).toBeCloseTo(0.35, 10);
    expect(reading.yearOverYear.validFractionDelta).toBeCloseTo(0.59, 10);
    expect(reading.detail).toContain("no year-over-year difference stated");
    expect(reading.detail).toContain("Mar 2025 sampled 35% of the boundary");
    expect(reading.detail).toContain("59 points");
    // Nothing that could be read back as a stated difference survives.
    expect(reading.detail).not.toMatch(/°C vs Mar 2025/);
  });

  it("applies the same disparity convention as the month-over-month change", () => {
    // Exactly at the limit still compares, matching the sibling's inclusive
    // test; both operands are binary-exact so the boundary is unambiguous.
    const atLimit = withCoverages(0.5, 0.25);
    const pastLimit = withCoverages(0.5, 0.2);

    expect(MARINE_BOUNDARY_SST_COVERAGE_DISPARITY_LIMIT).toBe(0.25);
    expect(atLimit.yearOverYear.status).toBe("available");
    expect(pastLimit.yearOverYear.status).toBe("incomparable-coverage");
  });

  it("screens coverage before censoring so a doubly capped pair still names the support failure", () => {
    const reading = marineBoundarySstReading({
      ...base,
      observedValue: 31.9,
      validFraction: 0.94,
      priorYear: {
        dataMonth: { year: 2025, month: 3 },
        observedValue: 31.9,
        validFraction: 0.35,
      },
    });

    expect(reading.yearOverYear.status).toBe("incomparable-coverage");
    expect(reading.detail).not.toMatch(/unchanged/i);
  });

  it("leaves like-for-like coverage reporting a plain difference", () => {
    const reading = withCoverages(0.62, 0.58);

    expect(reading.yearOverYear.status).toBe("available");
    expect(reading.detail).toContain("+0.9 °C vs Mar 2025");
    expect(reading.detail).not.toContain("points from this month");
  });
});

describe("marine boundary SST native-grid support on the card", () => {
  /** A harbour-sized boundary: ~5.6 km x ~4.3 km, well inside one 9 km cell. */
  const HARBOUR = { south: 40, north: 40.05, west: -70.05, east: -70 };
  /** A sea-sized boundary, spanning many native cells in both directions. */
  const SEA = { south: 30, north: 40, west: -20, east: -10 };

  function reading(
    bounds: typeof HARBOUR | null | undefined,
    observedValue: number | null = 18.375
  ) {
    return marineBoundarySstReading({
      geographyLabel: "Monterey Bay",
      dataMonth: { year: 2026, month: 3 },
      observedValue,
      validFraction: 0.94,
      sourceImageDimensions: { width: 512, height: 512 },
      bounds,
    });
  }

  it("says a high sampled share can still rest on a single source cell", () => {
    const card = reading(HARBOUR);

    // The two clauses answer different questions and must sit together: the
    // share is 94%, which on its own reads as a well-sampled mean.
    expect(card.detail).toContain(
      "usable SST over 94% of the searched boundary (substantial); mean covers only those pixels; searched boundary is narrower than one 9km source cell, whose footprint extends beyond it — the mean rests on a single source cell; rendered source image"
    );
    expect(card.nativeSupport.meanBoundedBySingleCell).toBe(true);
  });

  it("leaves the clause off a boundary that resolves many native cells", () => {
    const card = reading(SEA);

    expect(card.nativeSupport.supportClass).toBe("many-cells");
    expect(card.detail).not.toContain("source cell");
    // The coverage clause is unaffected either way.
    expect(card.detail).toContain(
      "usable SST over 94% of the searched boundary"
    );
  });

  it("stays silent when the workflow supplied no boundary extent", () => {
    for (const card of [reading(null), reading(undefined)]) {
      expect(card.nativeSupport.status).toBe("invalid-bounds");
      expect(card.detail).not.toContain("source cell");
    }
  });

  it("does not qualify a mean the reading never reported", () => {
    // No usable value means there is no mean for a native-cell bound to
    // describe; the card already says the observation is missing.
    const card = reading(HARBOUR, null);

    expect(card.availability).toBe("no-usable-sst");
    expect(card.detail).not.toContain("source cell");
    // The bound is still computed for structured consumers.
    expect(card.nativeSupport.supportClass).toBe("sub-cell");
  });

  it("keeps the clause out of an unavailable reading", () => {
    const card = unavailableMarineBoundarySstReading(
      { year: 2026, month: 3 },
      "Monterey Bay"
    );

    expect(card.detail).not.toContain("source cell");
  });
});
