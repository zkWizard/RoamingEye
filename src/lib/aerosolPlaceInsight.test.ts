import { describe, expect, it } from "vitest";
import {
  AEROSOL_PLACE_METRIC,
  aerosolBoundaryLoadingReading,
  unavailableAerosolBoundaryReading,
  type AerosolBoundarySampleInput,
} from "./aerosolPlaceInsight";
import { AEROSOL_SOURCE, AEROSOL_WAVELENGTH_NM } from "./aerosolLoading";

const MONTHS = [
  { year: 2026, month: 2 },
  { year: 2026, month: 3 },
] as const;

function sample(
  overrides: Partial<AerosolBoundarySampleInput> = {}
): AerosolBoundarySampleInput {
  return {
    months: MONTHS,
    observedValues: [0.18, 0.24],
    validFractions: [0.82, 0.87],
    sourceImageDimensions: { width: 512, height: 512 },
    ...overrides,
  };
}

describe("aerosol place-panel reading", () => {
  it("reports the later month's column AOD with its descriptive tier", () => {
    const reading = aerosolBoundaryLoadingReading(sample());

    expect(reading.id).toBe(AEROSOL_PLACE_METRIC.id);
    expect(reading.value).toBe("0.24");
    expect(reading.observedValue).toBe(0.24);
    expect(reading.dataMonth).toEqual(MONTHS[1]);
    expect(reading.wavelengthNm).toBe(AEROSOL_WAVELENGTH_NM);
    expect(reading.detail).toContain("Mar 2026 boundary-mean column AOD");
    expect(reading.detail).toContain("moderate column loading");
    expect(reading.detail).toContain("descriptive tier");
  });

  it("keeps the cited MERRA-2 provenance on every reading", () => {
    for (const reading of [
      aerosolBoundaryLoadingReading(sample()),
      unavailableAerosolBoundaryReading(MONTHS[1]),
    ]) {
      expect(reading.source).toBe(AEROSOL_SOURCE);
      expect(reading.detail).toContain(
        `source ${AEROSOL_SOURCE.shortName} v${AEROSOL_SOURCE.version}`
      );
    }
  });

  it("refuses the three claims a column AOD number invites", () => {
    const reading = aerosolBoundaryLoadingReading(sample());

    expect(reading.isForecast).toBe(false);
    expect(reading.surfaceAirQualityObservation).toBe(false);
    expect(reading.healthIndex).toBe(false);
    // The refusals must reach the text the reader actually sees, not just the
    // type — a card is read, not destructured.
    expect(reading.detail).toContain("not surface air quality");
    expect(reading.detail).toContain("not a health index");
    expect(reading.detail).toContain("not a forecast");
    expect(reading.detail).toContain("MERRA-2 reanalysis");
  });

  it("states a month-over-month difference without calling it a trend", () => {
    const reading = aerosolBoundaryLoadingReading(sample());

    expect(reading.detail).toContain("+0.06 vs Feb 2026");
    expect(reading.detail).toContain("increasing");
    expect(reading.detail).toContain(
      "a difference between two modelled monthly means, not a trend"
    );
  });

  it("signs a decrease and keeps the number visible inside the little-change band", () => {
    expect(
      aerosolBoundaryLoadingReading(sample({ observedValues: [0.24, 0.18] }))
        .detail
    ).toContain("-0.06 vs Feb 2026");

    const small = aerosolBoundaryLoadingReading(
      sample({ observedValues: [0.2, 0.21] })
    );
    expect(small.detail).toContain("+0.01 vs Feb 2026");
    expect(small.detail).toContain("little change, within ±0.02");
  });

  it("flags a value that only marginally falls inside its tier", () => {
    // 0.21 is 0.01 above the low/moderate break point: binned as moderate, but
    // a nearby value would read as low, so the card must not imply a clean bin.
    const marginal = aerosolBoundaryLoadingReading(
      sample({ observedValues: [0.2, 0.21] })
    );
    expect(marginal.detail).toContain("close to the 0.20 tier edge");

    const interior = aerosolBoundaryLoadingReading(
      sample({ observedValues: [0.3, 0.35] })
    );
    expect(interior.detail).not.toContain("tier edge");
  });

  it("flags a sample censored by the rendered ramp's ceiling", () => {
    // The live GIBS ramp for this product ends at ~0.90, so a heavier column
    // (dust or smoke, where AOD can exceed 1) cannot be told apart from one
    // resting on the ceiling. The card must not present the ceiling as a value.
    const saturated = aerosolBoundaryLoadingReading(
      sample({ observedValues: [0.7, 0.8975] })
    );
    expect(saturated.detail).toContain("top of the rendered colour ramp");
    expect(saturated.detail).toContain("true column value may be higher");

    const interior = aerosolBoundaryLoadingReading(
      sample({ observedValues: [0.3, 0.35] })
    );
    expect(interior.detail).not.toContain("rendered colour ramp");
  });

  // The rendered ramp's top bin is open-ended, so a saturated month is a lower
  // bound rather than a measurement. `AerosolLoadingChange.changeBound` states
  // the rule a caller must honour, but it cannot fire on this path: the finite
  // colormap entries stop at 0.8975 while `describeAerosolCensoring` only
  // censors at 0.9, so the card screens saturation itself. Without that, a
  // bounded difference was printed as a plain measured one.
  it("reports a difference against a saturated later month as a lower bound", () => {
    const reading = aerosolBoundaryLoadingReading(
      sample({ observedValues: [0.7, 0.8975] })
    );

    // The true later value can only be higher, so the true change can only be
    // larger than the computed +0.20.
    expect(reading.detail).toContain("at least +0.20 vs Feb 2026");
    expect(reading.detail).toContain("a lower bound on the change");
    expect(reading.detail).toContain("not a measured difference");
    // The direction survives here: a censored later month can only push an
    // already-increasing difference further up.
    expect(reading.detail).toContain("increasing");
  });

  it("reports a difference against a saturated earlier month as an upper bound", () => {
    const reading = aerosolBoundaryLoadingReading(
      sample({ observedValues: [0.8975, 0.7] })
    );

    expect(reading.detail).toContain("at most -0.20 vs Feb 2026");
    expect(reading.detail).toContain("an upper bound on the change");
    expect(reading.detail).toContain("decreasing");
  });

  it("does not name a direction the bound cannot support", () => {
    // Later month censored and the computed difference sits inside the
    // little-change band. The true later value can only be higher, so a computed
    // +0.00 is equally consistent with a true jump of +2 — "little change" would
    // assert a stability the imagery cannot support, so no direction is printed.
    const reading = aerosolBoundaryLoadingReading(
      sample({ observedValues: [0.8964, 0.8975] })
    );

    expect(reading.detail).toContain("at least +0.00 vs Feb 2026");
    expect(reading.detail).toContain("a lower bound on the change");
    expect(reading.detail).not.toContain("little change, within");
    expect(reading.detail).not.toContain("increasing");
  });

  it("withholds the difference entirely when both months saturate the ramp", () => {
    // Two readings at the ceiling could truly be 0.90 and 3.0, in either order,
    // so neither the sign nor the size of the change survives. Printing the
    // arithmetic difference would assert a stability the imagery cannot support.
    const reading = aerosolBoundaryLoadingReading(
      sample({ observedValues: [0.8975, 0.8975] })
    );

    // The later month's own value still shows; only the comparison is refused.
    expect(reading.value).toBe("0.90");
    expect(reading.detail).toContain("no comparison with Feb 2026");
    expect(reading.detail).toContain("open-ended top bin");
    expect(reading.detail).not.toContain("+0.00 vs Feb 2026");
    expect(reading.detail).not.toContain("little change");
  });

  it("bounds the descriptive tier from below when the sample saturates", () => {
    // `lowestPossibleCategory` is the lowest tier consistent with a censored
    // reading, so naming it alone would present a floor as the finding.
    const saturated = aerosolBoundaryLoadingReading(
      sample({ observedValues: [0.7, 0.8975] })
    );
    expect(saturated.detail).toContain("or heavier (descriptive tier");

    const interior = aerosolBoundaryLoadingReading(
      sample({ observedValues: [0.3, 0.35] })
    );
    expect(interior.detail).not.toContain("or heavier");
  });

  it("withholds a comparison across non-consecutive months and says why", () => {
    const reading = aerosolBoundaryLoadingReading(
      sample({
        months: [
          { year: 2025, month: 3 },
          { year: 2026, month: 3 },
        ],
      })
    );

    // The value still shows; only the difference is refused.
    expect(reading.value).toBe("0.24");
    expect(reading.detail).toContain("no comparison with Mar 2025");
    expect(reading.detail).toContain("months-not-consecutive");
    expect(reading.detail).not.toContain("vs Mar 2025 (");
  });

  it("withholds a comparison when the earlier month has no usable value", () => {
    const reading = aerosolBoundaryLoadingReading(
      sample({ observedValues: [null, 0.24] })
    );

    expect(reading.value).toBe("0.24");
    expect(reading.detail).toContain("no comparison with Feb 2026");
    expect(reading.detail).toContain("endpoint-not-available");
  });

  it("never turns an unusable later month into a number", () => {
    for (const values of [
      [0.18, null],
      [0.18, Number.NaN],
      [0.18, -0.1],
    ] as const) {
      const reading = aerosolBoundaryLoadingReading(
        sample({ observedValues: values })
      );
      expect(reading.value).toBe("No usable AOD observation");
      expect(reading.observedValue).toBeNull();
      expect(reading.detail).toContain("no usable value");
    }
  });

  it("treats zero sampled coverage as no data, not as clean air", () => {
    const reading = aerosolBoundaryLoadingReading(
      sample({ validFractions: [0.82, 0] })
    );

    expect(reading.value).toBe("No usable AOD observation");
    expect(reading.detail).toContain("zero-coverage");
  });

  it("reports sampled boundary coverage and rendered-image provenance", () => {
    expect(aerosolBoundaryLoadingReading(sample()).detail).toContain(
      "87% sampled boundary coverage; rendered source image 512 x 512 px"
    );
    expect(
      aerosolBoundaryLoadingReading(
        sample({ sourceImageDimensions: undefined })
      ).detail
    ).toContain("rendered source image dimensions not supplied");
  });

  it("distinguishes a failed sample from an absence of aerosol", () => {
    const reading = unavailableAerosolBoundaryReading(MONTHS[1]);

    expect(reading.value).toBe("Unavailable");
    expect(reading.observedValue).toBeNull();
    expect(reading.detail).toContain("could not be sampled");
    expect(reading.detail).not.toContain("very low");
  });
});
