import { describe, expect, it } from "vitest";
import {
  LAND_SURFACE_TEMPERATURE_SOURCE,
  LST_PLACE_METRIC,
  LST_PUBLISHED_RAMP,
  lstBoundaryTemperatureReading,
  lstRampBoundDirection,
  unavailableLstBoundaryReading,
  type LstBoundarySampleInput,
} from "./lstPlaceInsight";
import { PROBE_SCALES } from "./probe";
import { LAYERS } from "./timeline";
import { PLACE_OBSERVATION_NATIVE_UNITS } from "./placeObservationExport";
import { PLACE_COLORMAP_DOCS } from "./placeInsights";

const MONTHS = [
  { year: 2026, month: 2 },
  { year: 2026, month: 3 },
] as const;

function sample(
  overrides: Partial<LstBoundarySampleInput> = {}
): LstBoundarySampleInput {
  return {
    months: MONTHS,
    // Native kelvin, as the probe recovers it from the GIBS ramp.
    observedValues: [295.15, 301.65],
    validFractions: [0.74, 0.81],
    sourceImageDimensions: { width: 512, height: 512 },
    ...overrides,
  };
}

describe("land-surface-temperature place-panel reading", () => {
  it("reports the later month in Celsius while retaining native kelvin", () => {
    const reading = lstBoundaryTemperatureReading(sample());

    expect(reading.id).toBe(LST_PLACE_METRIC.id);
    expect(reading.value).toBe("28.5 °C");
    // The export and every downstream consumer read the product's own unit.
    expect(reading.observedValueK).toBe(301.65);
    expect(reading.dataMonth).toEqual(MONTHS[1]);
    expect(reading.detail).toContain(
      "Mar 2026 boundary-mean daytime land-surface temperature"
    );
  });

  it("differences a consecutive pair and says the annual cycle is not removed", () => {
    const reading = lstBoundaryTemperatureReading(sample());

    // 301.65 K - 295.15 K = 6.5 K, identical in °C.
    expect(reading.detail).toContain("+6.5 °C vs Feb 2026");
    expect(reading.detail).toContain("annual cycle not removed");
  });

  it("signs a cooling step negative", () => {
    const reading = lstBoundaryTemperatureReading(
      sample({ observedValues: [301.65, 295.15] })
    );

    expect(reading.detail).toContain("-6.5 °C vs Feb 2026");
  });

  it("refuses to difference a non-consecutive pair", () => {
    // A layer's enumerated record has declared gaps removed, so the last two
    // entries can straddle a skipped month. Subtracting across it would label a
    // multi-month step "month over month".
    const reading = lstBoundaryTemperatureReading(
      sample({
        months: [
          { year: 2025, month: 11 },
          { year: 2026, month: 3 },
        ],
      })
    );

    expect(reading.detail).toContain(
      "Nov 2025 is not the preceding month, so no month-over-month change is reported"
    );
    expect(reading.detail).not.toContain("vs Nov 2025)");
    // The later month is still shown; a withheld comparison is not a withheld
    // observation.
    expect(reading.value).toBe("28.5 °C");
  });

  it("withholds a comparison when an endpoint has no usable value", () => {
    const reading = lstBoundaryTemperatureReading(
      sample({ observedValues: [null, 301.65] })
    );

    expect(reading.detail).toContain(
      "no comparison with Feb 2026 (no usable value for Feb 2026)"
    );
    expect(reading.value).toBe("28.5 °C");
  });

  it("never presents an unusable later month as a temperature", () => {
    const reading = lstBoundaryTemperatureReading(
      sample({ observedValues: [295.15, null] })
    );

    expect(reading.value).toBe("No usable LST observation");
    expect(reading.observedValueK).toBeNull();
    expect(reading.detail).toContain("no usable value recovered");
  });

  it("names cloud as the reason a clear-sky product under-covers a boundary", () => {
    // A coverage shortfall on an optical retrieval is an expected consequence
    // of the observing system, not a product defect — and not a statement about
    // this boundary's particular gap.
    const partial = lstBoundaryTemperatureReading(sample());
    expect(partial.detail).toContain("81% sampled boundary coverage");
    expect(partial.detail).toContain(
      "cloud routinely leaves part of a boundary"
    );

    const full = lstBoundaryTemperatureReading(
      sample({ validFractions: [1, 1] })
    );
    expect(full.detail).toContain("100% sampled boundary coverage");
    expect(full.detail).not.toContain("cloud routinely leaves");
  });

  it("never rounds an incomplete boundary up to complete coverage", () => {
    // The missing share on a clear-sky composite is the cloudy pixels, not a
    // random scatter, so it is the only cue the mean is drawn from a clear-sky
    // subsample. Rounding it away would state complete coverage of a boundary
    // part of which went unobserved — and would print that beside the very
    // clause saying part of it did.
    const nearlyComplete = lstBoundaryTemperatureReading(
      sample({ validFractions: [0.9, 0.998] })
    );
    expect(nearlyComplete.detail).toContain(">99% sampled boundary coverage");
    expect(nearlyComplete.detail).not.toContain("100% sampled");
    expect(nearlyComplete.detail).toContain(
      "cloud routinely leaves part of a boundary"
    );
  });

  it("keeps a positive share off the zero the export reserves for no data", () => {
    // `placeObservationExport` derives `insufficient-valid-coverage` from a
    // positive share and reserves `source-no-data` for a zero one. Printing
    // `0%` for a sliver the source did cover would put this card and the
    // download it accompanies in disagreement about the same month.
    const sliver = lstBoundaryTemperatureReading(
      sample({ validFractions: [0.9, 0.004] })
    );
    expect(sliver.detail).toContain("<1% sampled boundary coverage");
    expect(sliver.detail).not.toContain("0% sampled");

    // Exactly zero is not the contradictory case — there the card reports no
    // coverage and means it.
    const none = lstBoundaryTemperatureReading(
      sample({ validFractions: [0.9, 0] })
    );
    expect(none.detail).toContain("0% sampled boundary coverage");
  });

  it("does not demote a complete boundary over a representation error", () => {
    // Coverage is a ratio of two compensated area sums, so a boundary the
    // sensor covered outright can land just under one. It is complete, and
    // must not pick up a note about a gap it does not have.
    const complete = lstBoundaryTemperatureReading(
      sample({ validFractions: [1, 1 - 1e-12] })
    );
    expect(complete.detail).toContain("100% sampled boundary coverage");
    expect(complete.detail).not.toContain("cloud routinely leaves");
  });

  it("reports unsupplied or invalid coverage rather than inventing a share", () => {
    const fractions: (number | null)[] = [null, Number.NaN, 1.4, -0.2];
    for (const fraction of fractions) {
      const reading = lstBoundaryTemperatureReading(
        sample({ validFractions: [0.5, fraction] })
      );
      expect(reading.detail).toContain("sampled coverage not supplied");
    }
  });

  it("refuses the three readings a surface temperature most invites", () => {
    for (const reading of [
      lstBoundaryTemperatureReading(sample()),
      unavailableLstBoundaryReading(MONTHS[1]),
    ]) {
      // Not the 2 m air temperature the neighbouring card reports.
      expect(reading.airTemperatureObservation).toBe(false);
      expect(reading.detail).toContain("not 2 m air temperature");
      // Not a diurnal or all-sky mean.
      expect(reading.diurnalMean).toBe(false);
      expect(reading.detail).toContain("clear-sky daytime overpass");
      expect(reading.detail).toContain("not a diurnal or all-sky mean");
      // Not a forecast, and not a claim about water.
      expect(reading.isForecast).toBe(false);
      expect(reading.detail).toContain("land only");
    }
  });

  it("keeps the cited MOD11C3 provenance on every reading", () => {
    for (const reading of [
      lstBoundaryTemperatureReading(sample()),
      unavailableLstBoundaryReading(MONTHS[1]),
    ]) {
      expect(reading.source).toEqual(LAYERS.lst.dataset);
      expect(reading.detail).toContain("source MOD11C3 v061");
    }
  });

  it("does not relabel a sampling failure as a cool surface", () => {
    const reading = unavailableLstBoundaryReading(MONTHS[1]);

    expect(reading.value).toBe("Unavailable");
    expect(reading.observedValueK).toBeNull();
    expect(reading.detail).toContain("could not be sampled");
  });

  it("blames the published colormap only when the colormap is what failed", () => {
    // A failure after the colormap parsed is this app's boundary sampling —
    // tile retrieval, an unsampleable footprint, canvas decoding. Attributing
    // it to NASA's published document would misstate a cited source.
    const sampling = unavailableLstBoundaryReading(
      MONTHS[1],
      "boundary-sampling-failed"
    );

    expect(sampling.value).toBe("Unavailable");
    expect(sampling.detail).toContain("could not be sampled for the searched");
    expect(sampling.detail).not.toContain("source colormap");
    // The source is still cited — only the blame for the failure moves.
    expect(sampling.detail).toContain("source MOD11C3 v061");

    const colormap = unavailableLstBoundaryReading(
      MONTHS[1],
      "source-colormap-unavailable"
    );

    expect(colormap.detail).toContain(
      "could not be sampled from the published source colormap"
    );
    // Unspecified reason keeps the conservative existing wording.
    expect(unavailableLstBoundaryReading(MONTHS[1]).detail).toBe(
      colormap.detail
    );
  });

  it("carries the layer's own dataset citation rather than a copy", () => {
    // A literal here would silently diverge from the layer's citation.
    expect(LAND_SURFACE_TEMPERATURE_SOURCE).toBe(LAYERS.lst.dataset);
    expect(LAND_SURFACE_TEMPERATURE_SOURCE.doi).toBe(
      "10.5067/MODIS/MOD11C3.061"
    );
  });
});

describe("land-surface temperature coverage on the place panel", () => {
  it("gives the rendered land-surface-temperature layer a card", () => {
    // A calibrated layer can be absent from the panel with nothing visibly
    // broken — aerosol was, once, and `lst` was the last one left out. This
    // asserts the LAYERS/panel pair stays closed for surface temperature.
    // The metric id is the layer id, as it is for the marine card.
    expect(LST_PLACE_METRIC.id).toBe("lst");
    expect(LAYERS.lst.category).toBe("Temperature");
    // The card decodes through GIBS's published physical ramp, not the display
    // legend, so the panel has an authoritative value mapping to cite.
    expect(PLACE_COLORMAP_DOCS.lst).toBe("MODIS_Land_Surface_Temp");
  });

  it("exports the product in its native kelvin, not the card's Celsius", () => {
    expect(PLACE_OBSERVATION_NATIVE_UNITS.lst).toBe("K");
  });
});

describe("open end caps on the published LST ramp", () => {
  it("pins the terminal bins to the scale the probe decodes against", () => {
    // The published ramp's closed span and the probe scale are the same window;
    // if either drifts, the bins below would censor the wrong values silently.
    expect(LST_PUBLISHED_RAMP.floorBin.lo).toBe(PROBE_SCALES.lst.min);
    expect(LST_PUBLISHED_RAMP.ceilingBin.hi).toBe(PROBE_SCALES.lst.max);
    expect(LST_PUBLISHED_RAMP.unit).toBe(PROBE_SCALES.lst.unit);
  });

  it("leaves a value inside the finite ramp unqualified", () => {
    // Added doubt the colormap does not justify would be its own defect.
    expect(lstRampBoundDirection(301.65)).toBeNull();
    expect(lstBoundaryTemperatureReading(sample()).value).toBe("28.5 °C");
  });

  it("reports a ceiling-bin month as a lower bound, not a measurement", () => {
    // 349.7 K is indistinguishable from any surface at or above the 350.0 K
    // cap: GIBS paints them the same colour, 3 RGB units apart.
    expect(lstRampBoundDirection(349.7)).toBe("lower");
    const reading = lstBoundaryTemperatureReading(
      sample({ observedValues: [295.15, 349.7] })
    );
    expect(reading.value).toBe("≥ 76.6 °C");
    // The native value is untouched — nothing here estimates past the cap.
    expect(reading.observedValueK).toBe(349.7);
  });

  it("reports a floor-bin month as an upper bound", () => {
    expect(lstRampBoundDirection(200.3)).toBe("upper");
    expect(
      lstBoundaryTemperatureReading(sample({ observedValues: [295.15, 200.3] }))
        .value
    ).toBe("≤ -72.8 °C");
  });

  it("carries an endpoint's bound into the month-over-month difference", () => {
    // Later month censored high: the true rise is at least the shown one.
    expect(
      lstBoundaryTemperatureReading(sample({ observedValues: [295.15, 349.7] }))
        .detail
    ).toContain("≥ +54.6 °C vs Feb 2026");
    // Earlier month censored high pushes the difference the other way.
    expect(
      lstBoundaryTemperatureReading(sample({ observedValues: [349.7, 295.15] }))
        .detail
    ).toContain("≤ -54.6 °C vs Feb 2026");
  });

  it("withholds the difference when both months sit in the same cap", () => {
    // Two ceiling-bin months are each a lower bound, so the true change can run
    // either way: the shown -0.2 °C could equally be a large warming.
    const reading = lstBoundaryTemperatureReading(
      sample({ observedValues: [349.9, 349.7] })
    );
    expect(reading.detail).toContain("difference with Feb 2026 withheld");
    // A withheld comparison must never degrade into a bare signed number.
    expect(reading.detail).not.toMatch(/[+-]\d+\.\d+ °C vs/);
    // The value itself is still shown, still bounded.
    expect(reading.value).toBe("≥ 76.6 °C");

    // Symmetrically at the floor.
    expect(
      lstBoundaryTemperatureReading(sample({ observedValues: [200.1, 200.3] }))
        .detail
    ).toContain("difference with Feb 2026 withheld");
  });

  it("bounds the difference when opposite caps push the same way", () => {
    // Earlier at the floor (true value at or below) and later at the ceiling
    // (at or above) both push the difference up — a bound, not a withholding.
    expect(
      lstBoundaryTemperatureReading(sample({ observedValues: [200.3, 349.7] }))
        .detail
    ).toContain("≥ +149.4 °C vs Feb 2026");
    expect(
      lstBoundaryTemperatureReading(sample({ observedValues: [349.7, 200.3] }))
        .detail
    ).toContain("≤ -149.4 °C vs Feb 2026");
  });
});
