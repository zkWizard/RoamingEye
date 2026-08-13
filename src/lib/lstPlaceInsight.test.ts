import { describe, expect, it } from "vitest";
import {
  LAND_SURFACE_TEMPERATURE_SOURCE,
  LST_PLACE_METRIC,
  lstBoundaryTemperatureReading,
  unavailableLstBoundaryReading,
  type LstBoundarySampleInput,
} from "./lstPlaceInsight";
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
