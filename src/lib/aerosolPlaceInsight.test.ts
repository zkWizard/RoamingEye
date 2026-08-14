import { describe, expect, it } from "vitest";
import {
  AEROSOL_PLACE_METRIC,
  aerosolBoundaryLoadingReading,
  unavailableAerosolBoundaryReading,
  type AerosolBoundarySampleInput,
} from "./aerosolPlaceInsight";
import {
  AEROSOL_LOADING_CHANGE_THRESHOLD,
  AEROSOL_SOURCE,
  AEROSOL_WAVELENGTH_NM,
} from "./aerosolLoading";
import {
  describeAerosolChangeResolvability,
  describeAerosolTierResolvability,
} from "./aerosolInversionResolvability";

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

  // The 0.02 naming threshold was chosen against the tier break points, not
  // against how well this pipeline can measure a difference. Differencing two
  // colour-inverted months carries sqrt(2) x the layer's measured inversion
  // RMSE, which is far wider — so a direction named inside that floor is not
  // separable from the app's own retrieval error, and the card must say so.
  it("says when a difference is inside the measured colormap-inversion floor", () => {
    const reading = aerosolBoundaryLoadingReading(sample());

    expect(reading.detail).toContain("+0.06 vs Feb 2026");
    // The direction is still shown; it is qualified, not withheld.
    expect(reading.detail).toContain("increasing");
    expect(reading.detail).toContain("colormap-inversion difference floor");
    expect(reading.detail).toContain(
      "cannot separate it from its own retrieval error"
    );
    // The refusal must not flip into the opposite claim.
    expect(reading.detail).toContain("not a claim the column was unchanged");
  });

  it("qualifies a little-change reading by the same floor", () => {
    // "little change" invites the stability reading most directly, so it is the
    // case that most needs the floor stated beside it.
    const reading = aerosolBoundaryLoadingReading(
      sample({ observedValues: [0.2, 0.21] })
    );

    expect(reading.detail).toContain("little change, within ±0.02");
    expect(reading.detail).toContain("colormap-inversion difference floor");
  });

  it("stays silent when the difference clears the inversion floor", () => {
    const reading = aerosolBoundaryLoadingReading(
      sample({ observedValues: [0.2, 0.45] })
    );

    expect(reading.detail).toContain("+0.25 vs Feb 2026");
    expect(reading.detail).toContain("increasing");
    expect(reading.detail).not.toContain("colormap-inversion difference floor");
  });

  it("reads the floor from the measured figure rather than restating one", () => {
    // A copied constant would drift the moment the layer is recalibrated. The
    // printed floor must be the module's own, formatted to the card's scale.
    const resolvability = describeAerosolChangeResolvability(0.06);
    expect(resolvability?.resolution).toBe("unresolved");
    const floor = resolvability?.differenceFloor;
    expect(floor).toBeGreaterThan(AEROSOL_LOADING_CHANGE_THRESHOLD);

    expect(aerosolBoundaryLoadingReading(sample()).detail).toContain(
      `inside the ${(floor as number).toFixed(2)} colormap-inversion difference floor`
    );
  });

  it("does not attach the symmetric floor to a censored endpoint", () => {
    // +0.0475 sits inside the floor, but the later month rests on the ramp's
    // open-ended top bin. AEROSOL_RESOLVABILITY_LIMITATIONS states the band is
    // symmetric and does not model that bound, so the card must keep its own
    // one-sided wording there instead of borrowing a band that does not apply.
    const reading = aerosolBoundaryLoadingReading(
      sample({ observedValues: [0.85, 0.8975] })
    );

    expect(reading.detail).toContain("a lower bound on the change");
    expect(reading.detail).not.toContain("colormap-inversion difference floor");
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

  it("says when the inversion error admits more than one loading tier", () => {
    // 0.24 bins as moderate, but the layer's measured end-to-end
    // colormap-inversion error reaches back across the 0.2 break point, so low
    // is equally consistent with the reading. Naming one tier on its own
    // overstates what this pipeline can distinguish.
    const reading = aerosolBoundaryLoadingReading(sample());

    expect(reading.detail).toContain(
      "moderate column loading (descriptive tier, but the ±"
    );
    expect(reading.detail).toContain("colormap-inversion error admits");
    expect(reading.detail).toContain(
      "so the tier is not resolved by this pipeline"
    );
  });

  it("stays silent when one tier survives the inversion error", () => {
    // 0.35 sits clear of both moderate break points by more than the measured
    // error, so the tier is resolved and the card gains no text for it.
    const reading = aerosolBoundaryLoadingReading(
      sample({ observedValues: [0.3, 0.35] })
    );

    expect(reading.detail).toContain(
      "moderate column loading (descriptive tier)"
    );
    expect(reading.detail).not.toContain("colormap-inversion error admits");
  });

  it("reads the tier band from the measured figure rather than restating one", () => {
    // A copied constant would drift the moment the layer is recalibrated. The
    // printed band, and the tier count it spans, must be the module's own.
    const resolvability = describeAerosolTierResolvability(0.24);
    expect(resolvability?.resolution).toBe("unresolved");
    const rmse = resolvability?.inversionRmse as number;
    const lower = resolvability?.lower as number;
    const upper = resolvability?.upper as number;
    const spanned = resolvability?.consistentCategories.length as number;
    expect(spanned).toBeGreaterThan(1);

    expect(aerosolBoundaryLoadingReading(sample()).detail).toContain(
      `±${rmse.toFixed(2)} colormap-inversion error admits ${lower.toFixed(
        2
      )} to ${upper.toFixed(2)}, spanning ${spanned} tiers`
    );
  });

  it("does not attach the symmetric tier band to a censored reading", () => {
    // The value rests on the ramp's open-ended top bin, so it is a lower bound.
    // AEROSOL_RESOLVABILITY_LIMITATIONS states the band is symmetric and does
    // not model that bound, so the card keeps its own one-sided `or heavier`
    // wording rather than borrowing a band that does not apply — even though
    // the module does return an unresolved verdict for the value.
    const reading = aerosolBoundaryLoadingReading(
      sample({ observedValues: [0.7, 0.8975] })
    );

    expect(describeAerosolTierResolvability(0.8975)?.resolution).toBe(
      "unresolved"
    );
    expect(reading.detail).toContain("or heavier (descriptive tier)");
    expect(reading.detail).not.toContain("colormap-inversion error admits");
  });

  it("keeps the tier-edge note and the inversion band as separate statements", () => {
    // Proximity measures distance to a break point in the value's own units;
    // resolvability measures how well the value itself is known. They are
    // different claims, so a marginal unresolved reading carries both.
    const reading = aerosolBoundaryLoadingReading(
      sample({ observedValues: [0.2, 0.21] })
    );

    expect(reading.detail).toMatch(
      /close to the 0\.20 tier edge, but the ±[\d.]+ colormap-inversion error admits/
    );
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

  it("blames the admission threshold, not the source, for a thinly covered month", () => {
    // The heaviest pixels decode as no-data on this layer, so a boundary under
    // heavy loading routinely clears zero coverage without clearing the mean's
    // admission threshold. Reporting that as `missing-value` would say MERRA-2
    // had nothing here, beside a printed share saying it had 12% of it.
    const reading = aerosolBoundaryLoadingReading(
      sample({ observedValues: [0.18, null], validFractions: [0.82, 0.12] })
    );

    expect(reading.detail).toContain(
      "no usable value (insufficient-valid-coverage)"
    );
    expect(reading.detail).not.toContain("missing-value");
    expect(reading.detail).toContain("12% sampled boundary coverage");
  });

  it("keeps the contract's wording when no coverage was recorded", () => {
    // A zero share carries no evidence that the source covered the boundary, so
    // the sharper reason is not available and must not be invented.
    const reading = aerosolBoundaryLoadingReading(
      sample({ observedValues: [0.18, null], validFractions: [0.82, 0] })
    );

    expect(reading.detail).toContain("no usable value (missing-value)");
    expect(reading.detail).not.toContain("insufficient-valid-coverage");
  });

  it("does not relabel a month whose value was rejected as invalid", () => {
    for (const values of [
      [0.18, Number.NaN],
      [0.18, -0.1],
    ] as const) {
      const reading = aerosolBoundaryLoadingReading(
        sample({ observedValues: values, validFractions: [0.82, 0.12] })
      );

      expect(reading.detail).toContain("no usable value (invalid-value)");
      expect(reading.detail).not.toContain("insufficient-valid-coverage");
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

  it("never rounds an incomplete sampled share up to full coverage", () => {
    for (const fraction of [0.996, 0.9949999, 0.995, 0.999]) {
      const detail = aerosolBoundaryLoadingReading(
        sample({ validFractions: [0.82, fraction] })
      ).detail;

      expect(detail).not.toContain("100% sampled boundary coverage");
      expect(detail).toContain(
        fraction < 0.995
          ? "99% sampled boundary coverage"
          : ">99% sampled boundary coverage"
      );
    }

    expect(
      aerosolBoundaryLoadingReading(sample({ validFractions: [0.82, 1] }))
        .detail
    ).toContain("100% sampled boundary coverage");
  });

  it("never rounds a positive sampled share down to no coverage", () => {
    const detail = aerosolBoundaryLoadingReading(
      sample({ validFractions: [0.82, 0.004] })
    ).detail;

    expect(detail).toContain("<1% sampled boundary coverage");
    expect(detail).not.toContain("0% sampled boundary coverage");
    // The value the share qualifies is still shown; only its share was wrong.
    expect(detail).toContain("boundary-mean column AOD");
  });

  it("keeps 0% for a genuinely empty sample", () => {
    expect(
      aerosolBoundaryLoadingReading(sample({ validFractions: [0.82, 0] }))
        .detail
    ).toContain("0% sampled boundary coverage");
  });

  it("keeps complete coverage at 100% through summation rounding", () => {
    // Coverage is a ratio of two compensated area sums, so a complete sample can
    // land just short of one; that is float noise, not an unobserved gap.
    expect(
      aerosolBoundaryLoadingReading(
        sample({ validFractions: [0.82, 1 - 1e-12] })
      ).detail
    ).toContain("100% sampled boundary coverage");
  });

  it("distinguishes a failed sample from an absence of aerosol", () => {
    const reading = unavailableAerosolBoundaryReading(MONTHS[1]);

    expect(reading.value).toBe("Unavailable");
    expect(reading.observedValue).toBeNull();
    expect(reading.detail).toContain("could not be sampled");
    expect(reading.detail).not.toContain("very low");
  });

  it("blames the published colormap only when the colormap is what failed", () => {
    // A failure after the colormap parsed is this app's boundary sampling —
    // tile retrieval, an unsampleable footprint, canvas decoding. Attributing
    // it to NASA's published document would misstate a cited source.
    const sampling = unavailableAerosolBoundaryReading(
      MONTHS[1],
      "boundary-sampling-failed"
    );

    expect(sampling.value).toBe("Unavailable");
    expect(sampling.detail).toContain("could not be sampled for the searched");
    expect(sampling.detail).not.toContain("source colormap");
    // The source is still cited — only the blame for the failure moves.
    expect(sampling.detail).toContain(`source ${AEROSOL_SOURCE.shortName}`);

    const colormap = unavailableAerosolBoundaryReading(
      MONTHS[1],
      "source-colormap-unavailable"
    );

    expect(colormap.detail).toContain(
      "could not be sampled from the published source colormap"
    );
    // Unspecified reason keeps the conservative existing wording.
    expect(unavailableAerosolBoundaryReading(MONTHS[1]).detail).toBe(
      colormap.detail
    );
  });
});
