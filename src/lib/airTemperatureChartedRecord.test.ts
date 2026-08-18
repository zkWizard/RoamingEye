import { describe, expect, it } from "vitest";
import {
  AIR_TEMPERATURE_CHARTED_RECORD_LIMITATIONS,
  airTemperatureChartedRecordClause,
  airTemperatureChartedRecordNote,
  summarizeAirTemperatureChartedRecord,
} from "./airTemperatureChartedRecord";
import { MERRA2_AIR_TEMPERATURE_RAMP_CAPS } from "./atmosphereProbeDomain";

describe("summarizeAirTemperatureChartedRecord", () => {
  it("reports no sampled months as unreported", () => {
    expect(summarizeAirTemperatureChartedRecord([]).status).toBe("unreported");
    expect(summarizeAirTemperatureChartedRecord(null).status).toBe(
      "unreported"
    );
    expect(summarizeAirTemperatureChartedRecord(undefined).status).toBe(
      "unreported"
    );
  });

  it("separates a fully charted record from a partial and an empty one", () => {
    expect(summarizeAirTemperatureChartedRecord([250, 260, 270]).status).toBe(
      "fully-charted"
    );
    expect(summarizeAirTemperatureChartedRecord([250, null, 270]).status).toBe(
      "partly-charted"
    );
    expect(summarizeAirTemperatureChartedRecord([null, null]).status).toBe(
      "no-charted-month"
    );
  });

  it("counts undefined and non-finite entries as uncharted", () => {
    const summary = summarizeAirTemperatureChartedRecord([
      254,
      undefined,
      Number.NaN,
      null,
      301,
    ]);
    expect(summary.sampledMonths).toBe(5);
    expect(summary.chartedMonths).toBe(2);
    expect(summary.status).toBe("partly-charted");
  });

  it("classifies gradient positions and physical values identically", () => {
    // Only presence is read, so the 0..1 gradient the panel holds and the
    // Kelvin series the export writes must reduce to the same counts.
    const gradient = summarizeAirTemperatureChartedRecord([0.2, null, 0.8]);
    const kelvin = summarizeAirTemperatureChartedRecord([238, null, 292]);
    expect(gradient.chartedMonths).toBe(kelvin.chartedMonths);
    expect(gradient.status).toBe(kelvin.status);
  });

  it("carries the layer, the forecast refusal and its limitations", () => {
    const summary = summarizeAirTemperatureChartedRecord([250, null]);
    expect(summary.kind).toBe("observed-air-temperature-charted-record");
    expect(summary.isForecast).toBe(false);
    expect(summary.layerId).toBe("airtemp");
    expect(summary.limitations).toBe(
      AIR_TEMPERATURE_CHARTED_RECORD_LIMITATIONS
    );
  });
});

describe("airTemperatureChartedRecordClause", () => {
  it("counts the charted months against the sampled ones", () => {
    const clause = airTemperatureChartedRecordClause(
      summarizeAirTemperatureChartedRecord([250, null, null, 280])
    );
    expect(clause).toContain("charted in 2 of 4 sampled months");
  });

  it("quotes the ramp's closed span from the measured colormap facts", () => {
    const { closedSpan, unit } = MERRA2_AIR_TEMPERATURE_RAMP_CAPS;
    const clause = airTemperatureChartedRecordClause(
      summarizeAirTemperatureChartedRecord([250, null])
    );
    // Read, never restated — the wording cannot outlive the parsed colormap.
    expect(clause).toContain(`${closedSpan.min} and ${closedSpan.max} ${unit}`);
    expect(closedSpan.min).toBe(220);
    expect(closedSpan.max).toBe(310);
  });

  it("refuses both readings of an uncharted month", () => {
    const clause = airTemperatureChartedRecordClause(
      summarizeAirTemperatureChartedRecord([250, null])
    );
    expect(clause).toContain("evidence of neither a cold one nor a hot one");
    expect(clause).toContain("cover the charted months alone");
  });

  it("brackets the record inward from BOTH ends", () => {
    // Both of this ramp's caps are open AND physically reachable, unlike
    // GLDAS's nonphysical `< 0` fill, so neither extreme survives as a bound.
    const clause = airTemperatureChartedRecordClause(
      summarizeAirTemperatureChartedRecord([250, null])
    );
    expect(clause).toContain("the maximum need not be the record's warmest");
    expect(clause).toContain("nor the minimum its coldest");
  });

  it("never claims a direction of error", () => {
    // The two exclusions pull opposite ways and a count cannot separate them.
    // Snow and vegetation may say the swing is damped because their undrawn
    // months sit at one end; this layer may not, and this pins that refusal.
    const clause =
      airTemperatureChartedRecordClause(
        summarizeAirTemperatureChartedRecord([250, null, 280])
      ) ?? "";
    for (const forbidden of [
      "damp",
      "understate",
      "overstate",
      "reads high",
      "reads low",
      "warmer than",
      "colder than",
      "at least",
      "no warmer",
      "no colder",
    ]) {
      expect(clause).not.toContain(forbidden);
    }
  });

  it("stays silent unless the record is partly charted", () => {
    expect(
      airTemperatureChartedRecordClause(
        summarizeAirTemperatureChartedRecord([250, 260])
      )
    ).toBeNull();
    expect(
      airTemperatureChartedRecordClause(
        summarizeAirTemperatureChartedRecord([null, null])
      )
    ).toBeNull();
    expect(
      airTemperatureChartedRecordClause(
        summarizeAirTemperatureChartedRecord([])
      )
    ).toBeNull();
  });
});

describe("airTemperatureChartedRecordNote", () => {
  it("speaks for a partly charted air-temperature record", () => {
    expect(airTemperatureChartedRecordNote("airtemp", [250, null])).toContain(
      "sampled months"
    );
  });

  it("stays silent for every layer it does not own", () => {
    // An absent month means something different on a layer bounded by a
    // domain, drawn across its whole range, or whose caps are censored into a
    // terminal bin rather than rejected outright.
    for (const layerId of [
      "precip",
      "soil",
      "snow",
      "sst",
      "ndvi",
      "aerosol",
      "lst",
    ] as const) {
      expect(airTemperatureChartedRecordNote(layerId, [250, null])).toBeNull();
    }
    expect(airTemperatureChartedRecordNote(null, [250, null])).toBeNull();
    expect(airTemperatureChartedRecordNote(undefined, [250, null])).toBeNull();
  });

  it("stays silent on a fully charted and on an empty record", () => {
    // The empty record belongs to `emptyAtmosphereProbeNote`, which already
    // refuses both readings; the two must never qualify one record twice.
    expect(airTemperatureChartedRecordNote("airtemp", [250, 260])).toBeNull();
    expect(airTemperatureChartedRecordNote("airtemp", [null, null])).toBeNull();
  });
});
