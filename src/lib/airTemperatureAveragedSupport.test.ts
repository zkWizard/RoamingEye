import { describe, expect, it } from "vitest";

import {
  AIR_TEMPERATURE_AVERAGED_SUPPORT_LIMITATIONS,
  airTemperatureAveragedSupportClause,
  airTemperatureAveragedSupportNote,
  summarizeAirTemperatureAveragedSupport,
} from "./airTemperatureAveragedSupport";
import { MERRA2_AIR_TEMPERATURE_RAMP_CAPS } from "./atmosphereProbeDomain";
import { PROBE_SCALES } from "./probe";

const full = [1, 1, 1];
const partial = [0.42, 0.96];

describe("summarizeAirTemperatureAveragedSupport", () => {
  it("reports no shares as unreported", () => {
    expect(
      summarizeAirTemperatureAveragedSupport("sampled-area", [250, 260], null)
        .status
    ).toBe("unreported");
    expect(
      summarizeAirTemperatureAveragedSupport("sampled-area", null, full).status
    ).toBe("unreported");
  });

  it("separates an empty record from an unusable share", () => {
    expect(
      summarizeAirTemperatureAveragedSupport(
        "sampled-area",
        [null, null],
        [1, 1]
      ).status
    ).toBe("no-charted-month");

    const unusable = summarizeAirTemperatureAveragedSupport(
      "sampled-area",
      [250, 260],
      [1.4, -0.2]
    );
    expect(unusable.status).toBe("unclassifiable");
    expect(unusable.chartedMonths).toBe(2);
    expect(unusable.classifiedMonths).toBe(0);
  });

  it("counts only months that charted a value", () => {
    const summary = summarizeAirTemperatureAveragedSupport(
      "drawn-region",
      [250, null, 262, Number.NaN],
      [0.5, 0.1, 0.8, 0.9]
    );
    expect(summary.chartedMonths).toBe(2);
    expect(summary.classifiedMonths).toBe(2);
    // The unplotted months' shares must not widen the range.
    expect(summary.minFraction).toBeCloseTo(0.5);
    expect(summary.maxFraction).toBeCloseTo(0.8);
  });

  it("treats a whole footprint as fully drawn only at an exact 1", () => {
    expect(
      summarizeAirTemperatureAveragedSupport("sampled-area", [250, 251], [1, 1])
        .status
    ).toBe("fully-drawn");
    // 0.999 prints as "100%" but still excluded cells.
    expect(
      summarizeAirTemperatureAveragedSupport(
        "sampled-area",
        [250, 251],
        [0.999, 1]
      ).status
    ).toBe("partly-drawn");
  });
});

describe("airTemperatureAveragedSupportClause", () => {
  it("is silent unless the footprint was partly drawn", () => {
    for (const validFractions of [full, null]) {
      expect(
        airTemperatureAveragedSupportClause(
          summarizeAirTemperatureAveragedSupport(
            "sampled-area",
            [250, 251, 252],
            validFractions
          )
        )
      ).toBeNull();
    }
    // An empty record belongs to emptyAtmosphereProbeNote, which already
    // refuses both readings; a second clause would qualify it twice.
    expect(
      airTemperatureAveragedSupportClause(
        summarizeAirTemperatureAveragedSupport(
          "sampled-area",
          [null, null],
          partial
        )
      )
    ).toBeNull();
  });

  it("names the drawn share and the footprint it covered", () => {
    const clause = airTemperatureAveragedSupportClause(
      summarizeAirTemperatureAveragedSupport(
        "sampled-area",
        [250, 251],
        partial
      )
    );
    expect(clause).toContain("42%–96%");
    expect(clause).toContain("sampled area");

    const region = airTemperatureAveragedSupportClause(
      summarizeAirTemperatureAveragedSupport(
        "drawn-region",
        [250, 251],
        [0.6, 0.6]
      )
    );
    // One share, not a degenerate range.
    expect(region).toContain("60% of the drawn region");
    expect(region).not.toContain("60%–60%");
  });

  it("prints a positive sliver as <1% rather than a contradictory 0%", () => {
    const clause = airTemperatureAveragedSupportClause(
      summarizeAirTemperatureAveragedSupport(
        "sampled-area",
        [250, 251],
        [0.004, 0.004]
      )
    );
    expect(clause).toContain("<1%");
    expect(clause).not.toContain("0% of");
  });

  it("prints a near-whole share as >99% rather than a contradictory 100%", () => {
    // One undrawn cell in a full 28x28 drawn-region grid (lib/probe.ts
    // regionGridSize). The rest of the clause says each mean covers its drawn
    // cells alone and reasons about "an undrawn share", which a bare "100%"
    // flatly contradicts in the same sentence.
    const clause =
      airTemperatureAveragedSupportClause(
        summarizeAirTemperatureAveragedSupport(
          "drawn-region",
          [250, 251],
          [783 / 784, 783 / 784]
        )
      ) ?? "";
    expect(clause).toContain(">99% of the drawn region");
    expect(clause).not.toContain("100%");
  });

  it("still prints 100% for a month that really did cover the footprint", () => {
    // Only the minimum decides the clause fires, so an exact 1 can sit at the
    // top of the range. There the completeness is real and must not be hedged.
    const clause =
      airTemperatureAveragedSupportClause(
        summarizeAirTemperatureAveragedSupport(
          "drawn-region",
          [250, 251],
          [783 / 784, 1]
        )
      ) ?? "";
    expect(clause).toContain(">99%–100%");
  });

  it("quotes the ramp window from the measured colormap facts", () => {
    const clause =
      airTemperatureAveragedSupportClause(
        summarizeAirTemperatureAveragedSupport(
          "sampled-area",
          [250, 251],
          partial
        )
      ) ?? "";
    const { closedSpan, unit } = MERRA2_AIR_TEMPERATURE_RAMP_CAPS;
    expect(clause).toContain(`${closedSpan.min} and ${closedSpan.max} ${unit}`);
    // The window the probe reports must be the window it inverts against.
    expect(closedSpan.min).toBe(PROBE_SCALES.airtemp.min);
    expect(closedSpan.max).toBe(PROBE_SCALES.airtemp.max);
    expect(unit).toBe(PROBE_SCALES.airtemp.unit);
  });

  it("claims no direction, because both discarded ends are reachable", () => {
    const clause =
      airTemperatureAveragedSupportClause(
        summarizeAirTemperatureAveragedSupport(
          "sampled-area",
          [250, 251],
          partial
        )
      ) ?? "";
    // The snow and vegetation clauses may say a swing is damped because their
    // undrawn pixels are all at one end. This ramp is capped at both, so the
    // clause must refuse a cool reading and a warm one alike.
    expect(clause).toContain("neither a cooler nor a warmer");
    for (const forbidden of [
      "understate",
      "overstate",
      "damp",
      "too cold",
      "too warm",
      "colder than",
      "warmer than the",
      "≥",
      "≤",
    ]) {
      expect(clause).not.toContain(forbidden);
    }
  });

  it("makes no hazard, health, trend or forecast claim", () => {
    const clause =
      airTemperatureAveragedSupportClause(
        summarizeAirTemperatureAveragedSupport(
          "drawn-region",
          [250, 251],
          partial
        )
      ) ?? "";
    for (const forbidden of [
      "heat wave",
      "heatwave",
      "hazard",
      "health",
      "trend",
      "warming",
      "cooling",
      "forecast",
      "expect",
      "risk",
    ]) {
      expect(clause.toLowerCase()).not.toContain(forbidden);
    }
  });
});

describe("airTemperatureAveragedSupportNote", () => {
  it("speaks only for the air-temperature layer", () => {
    for (const layerId of [
      "precip",
      "aerosol",
      "sst",
      "lst",
      "soil",
      "snow",
      "ndvi",
      null,
      undefined,
    ] as const) {
      expect(
        airTemperatureAveragedSupportNote(
          layerId,
          "sampled-area",
          [250, 251],
          partial
        )
      ).toBeNull();
    }

    expect(
      airTemperatureAveragedSupportNote(
        "airtemp",
        "sampled-area",
        [250, 251],
        partial
      )
    ).toContain("42%–96%");
  });

  it("stays silent for a point probe, which supplies no shares", () => {
    expect(
      airTemperatureAveragedSupportNote(
        "airtemp",
        "sampled-area",
        [250, 251],
        null
      )
    ).toBeNull();
  });
});

describe("AIR_TEMPERATURE_AVERAGED_SUPPORT_LIMITATIONS", () => {
  it("states the inseparability and the two-sided refusal", () => {
    const text = AIR_TEMPERATURE_AVERAGED_SUPPORT_LIMITATIONS.join(" ");
    expect(text).toContain("validFraction cannot say");
    expect(text).toContain("neither a cooler nor a warmer");
    expect(AIR_TEMPERATURE_AVERAGED_SUPPORT_LIMITATIONS.length).toBeGreaterThan(
      3
    );
  });
});
