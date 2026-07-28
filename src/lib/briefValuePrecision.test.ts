import { describe, expect, it } from "vitest";
import {
  composeEnvironmentBrief,
  unsupportedBriefLanguageHits,
  type EnvironmentBriefInput,
  type EnvironmentObservation,
} from "./environmentBrief";
import {
  BRIEF_RENDER_SIGNIFICANT_FIGURES,
  briefRenderedSignificantFigures,
  justifiedPrecision,
  justifiedRoundingPlace,
  roundToPlace,
  summarizeBriefValuePrecision,
} from "./briefValuePrecision";

const AVAILABLE_THROUGH = { year: 2026, month: 3 };

function obs(value: number, validFraction = 0.9): EnvironmentObservation {
  return { dataMonth: { year: 2026, month: 1 }, value, validFraction };
}

/** A brief where every supplied signal is dated 2026-01 (published, in-range). */
function briefWith(
  overrides: Partial<EnvironmentBriefInput>
): ReturnType<typeof composeEnvironmentBrief> {
  return composeEnvironmentBrief({
    vegetation: null,
    rainfall: null,
    soilMoisture: null,
    airTemperature: null,
    availableThrough: AVAILABLE_THROUGH,
    ...overrides,
  });
}

describe("justifiedRoundingPlace", () => {
  it("takes the floor of log10 of the uncertainty", () => {
    expect(justifiedRoundingPlace(18.95)).toBe(1); // tens
    expect(justifiedRoundingPlace(8.23)).toBe(0); // units
    expect(justifiedRoundingPlace(0.13)).toBe(-1); // tenths
    expect(justifiedRoundingPlace(2.3565e-4)).toBe(-4);
  });

  it("is stable at exact powers of ten", () => {
    expect(justifiedRoundingPlace(10)).toBe(1);
    expect(justifiedRoundingPlace(1)).toBe(0);
    expect(justifiedRoundingPlace(0.1)).toBe(-1);
    expect(justifiedRoundingPlace(1000)).toBe(3);
  });

  it("returns null for a non-positive or non-finite uncertainty", () => {
    expect(justifiedRoundingPlace(0)).toBeNull();
    expect(justifiedRoundingPlace(-5)).toBeNull();
    expect(justifiedRoundingPlace(Number.NaN)).toBeNull();
    expect(justifiedRoundingPlace(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("roundToPlace", () => {
  it("rounds to tens/hundreds for a positive place", () => {
    expect(roundToPlace(287.34, 1)).toBe(290);
    expect(roundToPlace(1234, 2)).toBe(1200);
  });

  it("rounds to an integer at place 0", () => {
    expect(roundToPlace(24.3, 0)).toBe(24);
    expect(roundToPlace(24.7, 0)).toBe(25);
  });

  it("keeps decimals for a negative place without float dust", () => {
    expect(roundToPlace(0.354, -1)).toBe(0.4);
    expect(roundToPlace(5.12e-4, -4)).toBe(0.0005);
  });
});

describe("justifiedPrecision", () => {
  it("justifies two figures for a temperature read to ±19 K", () => {
    const p = justifiedPrecision(287.34, 18.95);
    expect(p).toEqual({
      roundingPlace: 1,
      roundedValue: 290,
      significantFigures: 2,
    });
  });

  it("justifies two figures for soil moisture read to ±8 kg/m²", () => {
    const p = justifiedPrecision(24.3, 8.23);
    expect(p).toEqual({
      roundingPlace: 0,
      roundedValue: 24,
      significantFigures: 2,
    });
  });

  it("justifies no figure when the value is within its own uncertainty of zero", () => {
    // |value| < uncertainty ⇒ not resolved from zero even at one figure.
    const p = justifiedPrecision(5, 18.95);
    expect(p).not.toBeNull();
    expect(p!.significantFigures).toBe(0);
  });

  it("returns null when the uncertainty cannot fix a place or the value is non-finite", () => {
    expect(justifiedPrecision(287.34, 0)).toBeNull();
    expect(justifiedPrecision(287.34, -1)).toBeNull();
    expect(justifiedPrecision(Number.NaN, 18.95)).toBeNull();
  });
});

describe("briefRenderedSignificantFigures", () => {
  it("counts the figures the brief actually shows (toPrecision then collapse)", () => {
    expect(briefRenderedSignificantFigures(287.34)).toBe(5);
    expect(briefRenderedSignificantFigures(290)).toBe(2);
    expect(briefRenderedSignificantFigures(0.0005)).toBe(1);
    // Six-figure ceiling: extra input digits collapse to the render width.
    expect(briefRenderedSignificantFigures(287.343219)).toBe(
      BRIEF_RENDER_SIGNIFICANT_FIGURES
    );
  });

  it("handles zero and non-finite values", () => {
    expect(briefRenderedSignificantFigures(0)).toBe(0);
    expect(briefRenderedSignificantFigures(Number.NaN)).toBeNull();
    expect(
      briefRenderedSignificantFigures(Number.POSITIVE_INFINITY)
    ).toBeNull();
  });

  it("stays in step with the environment brief's own rendering", () => {
    // Guard the coupling: the count must match the numeric token the brief prints.
    const value = 287.34;
    const brief = briefWith({ airTemperature: obs(value) });
    const airtemp = brief.signals.find((s) => s.id === "air-temperature")!;
    const rendered = Number(
      (airtemp.observedValue as number).toPrecision(
        BRIEF_RENDER_SIGNIFICANT_FIGURES
      )
    ).toString();
    expect(airtemp.statement).toContain(rendered);
    expect(
      briefRenderedSignificantFigures(airtemp.observedValue as number)
    ).toBe(5);
  });
});

describe("summarizeBriefValuePrecision", () => {
  it("flags a calibrated signal whose brief rendering overstates its precision", () => {
    const brief = briefWith({ airTemperature: obs(287.34) });
    const summary = summarizeBriefValuePrecision(brief.signals);

    expect(summary.consideredSignalIds).toEqual(["air-temperature"]);
    const airtemp = summary.signals[0];
    expect(airtemp.status).toBe("characterized");
    expect(airtemp.uncertainty).toBe(18.95);
    expect(airtemp.justified).toEqual({
      roundingPlace: 1,
      roundedValue: 290,
      significantFigures: 2,
    });
    expect(airtemp.renderedSignificantFigures).toBe(5);
    expect(airtemp.overstatesPrecision).toBe(true);
    expect(summary.characterizedCount).toBe(1);
    expect(summary.overstatedCount).toBe(1);
    expect(airtemp.statement).toContain("290 K");
    expect(airtemp.statement).toContain("2 significant figures");
  });

  it("reports an uncharacterized layer honestly and invents no precision", () => {
    // NDVI is a satellite-derived index with no measured inversion RMSE.
    const brief = briefWith({ vegetation: obs(0.62) });
    const summary = summarizeBriefValuePrecision(brief.signals);

    const veg = summary.signals[0];
    expect(veg.status).toBe("uncharacterized");
    expect(veg.uncertainty).toBeNull();
    expect(veg.justified).toBeNull();
    expect(veg.overstatesPrecision).toBe(false);
    expect(summary.characterizedCount).toBe(0);
    expect(summary.uncharacterizedCount).toBe(1);
    expect(veg.statement).toContain("not asserted");
  });

  it("considers only usable signals by default and every signal under 'all'", () => {
    const brief = briefWith({
      airTemperature: obs(287.34),
      soilMoisture: null,
    });
    const available = summarizeBriefValuePrecision(brief.signals);
    expect(available.consideredSignalIds).toEqual(["air-temperature"]);

    const all = summarizeBriefValuePrecision(brief.signals, { include: "all" });
    // All four signals are described; the three unsupplied ones are unavailable.
    expect(all.consideredSignalIds).toEqual([
      "vegetation",
      "rainfall",
      "soil-moisture",
      "air-temperature",
    ]);
  });

  it("reports no justified precision when no usable observation exists", () => {
    const brief = briefWith({});
    const summary = summarizeBriefValuePrecision(brief.signals);
    expect(summary.consideredSignalIds).toEqual([]);
    expect(summary.characterizedCount).toBe(0);
    expect(summary.overstatedCount).toBe(0);
    expect(summary.statement).toContain("No usable observations");
  });

  it("marks a value within its own uncertainty as justifying no figure", () => {
    // A sub-unit soil-moisture reading sits below the ±8.2 kg/m² inversion
    // RMSE's units place, so not even one figure is resolved from zero.
    const brief = briefWith({ soilMoisture: obs(0.4) });
    const summary = summarizeBriefValuePrecision(brief.signals);
    const soil = summary.signals[0];
    expect(soil.status).toBe("characterized");
    expect(soil.justified!.significantFigures).toBe(0);
    expect(soil.statement).toContain("no significant figure is justified");
  });

  it("keeps every generated statement within the honest-language screen", () => {
    const brief = briefWith({
      vegetation: obs(0.62),
      airTemperature: obs(287.34),
      soilMoisture: obs(24.3),
      rainfall: obs(1e-5),
    });
    const summary = summarizeBriefValuePrecision(brief.signals, {
      include: "all",
    });
    for (const signal of summary.signals) {
      expect(unsupportedBriefLanguageHits(signal.statement)).toEqual([]);
    }
    expect(unsupportedBriefLanguageHits(summary.statement)).toEqual([]);
  });
});
