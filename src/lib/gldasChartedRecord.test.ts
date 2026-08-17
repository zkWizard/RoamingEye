import { describe, expect, it } from "vitest";
import {
  GLDAS_CHARTED_RECORD_LIMITATIONS,
  gldasChartedRecordClause,
  gldasChartedRecordNote,
  summarizeGldasChartedRecord,
} from "./gldasChartedRecord";
import { GLDAS_RAMP_SATURATION } from "./gldasRampSaturation";

describe("summarizeGldasChartedRecord", () => {
  it("reports no sampled months as unreported", () => {
    expect(summarizeGldasChartedRecord("precip", []).status).toBe("unreported");
    expect(summarizeGldasChartedRecord("precip", null).status).toBe(
      "unreported"
    );
    expect(summarizeGldasChartedRecord("soil", undefined).status).toBe(
      "unreported"
    );
  });

  it("separates a fully charted record from a partial and an empty one", () => {
    expect(summarizeGldasChartedRecord("precip", [1, 2, 3]).status).toBe(
      "fully-charted"
    );
    expect(summarizeGldasChartedRecord("precip", [1, null, 3]).status).toBe(
      "partly-charted"
    );
    expect(summarizeGldasChartedRecord("precip", [null, null]).status).toBe(
      "no-charted-month"
    );
  });

  it("counts undefined and non-finite entries as uncharted", () => {
    const summary = summarizeGldasChartedRecord("soil", [
      12,
      undefined,
      Number.NaN,
      null,
      31,
    ]);
    expect(summary.sampledMonths).toBe(5);
    expect(summary.chartedMonths).toBe(2);
    expect(summary.status).toBe("partly-charted");
  });

  it("counts a charted zero as charted", () => {
    // A dry month really does invert to 0 mm/day on this ramp — unlike snow,
    // whose 0% is transparent. Only absence excludes.
    const summary = summarizeGldasChartedRecord("precip", [0, null]);
    expect(summary.chartedMonths).toBe(1);
    expect(summary.status).toBe("partly-charted");
  });

  it("carries the layer, the limitations and a non-forecast marker", () => {
    const summary = summarizeGldasChartedRecord("soil", [1, null]);
    expect(summary.kind).toBe("observed-gldas-charted-record");
    expect(summary.isForecast).toBe(false);
    expect(summary.layerId).toBe("soil");
    expect(summary.limitations).toBe(GLDAS_CHARTED_RECORD_LIMITATIONS);
  });
});

describe("gldasChartedRecordClause", () => {
  it("stays silent unless months were actually excluded", () => {
    for (const values of [[1, 2, 3], [null, null], []]) {
      expect(
        gldasChartedRecordClause(summarizeGldasChartedRecord("precip", values))
      ).toBeNull();
    }
  });

  it("reports the charted count against the sampled one", () => {
    const clause = gldasChartedRecordClause(
      summarizeGldasChartedRecord("precip", [1, null, null, 4])
    );
    expect(clause).toContain("charted in 2 of 4 sampled months");
  });

  it("names all three exclusions so an uncharted month is not read as dry", () => {
    const clause =
      gldasChartedRecordClause(
        summarizeGldasChartedRecord("soil", [1, null])
      ) ?? "";
    expect(clause).toContain("land cells only");
    expect(clause).toContain("sub-zero fill");
    expect(clause).toContain("top bin");
    expect(clause).toContain("not a dry one");
  });

  it("refuses the maximum as the record's, because the top bin is discarded", () => {
    // The load-bearing claim: a censored peak is invisible on this ramp, so the
    // printed max must never be read as an upper bound.
    const clause =
      gldasChartedRecordClause(
        summarizeGldasChartedRecord("precip", [1, null])
      ) ?? "";
    expect(clause).toContain("maximum need not be the record's");
    expect(clause).toContain("charted months");
  });

  it("quotes each ramp's ceiling in the unit the probe reports", () => {
    // Never the published label: precipitation publishes `>= 5.0e-04 kg/m2/s`
    // while the panel beside it prints mm/day.
    const precip =
      gldasChartedRecordClause(
        summarizeGldasChartedRecord("precip", [1, null])
      ) ?? "";
    expect(precip).toContain("≥ 43.2 mm/day");
    expect(precip).not.toContain("5.0e-04");

    const soil =
      gldasChartedRecordClause(
        summarizeGldasChartedRecord("soil", [1, null])
      ) ?? "";
    expect(soil).toContain("≥ 50 kg/m²");
  });

  it("re-derives both ceilings from the colormap facts rather than hardcoding", () => {
    for (const layerId of ["precip", "soil"] as const) {
      const facts = GLDAS_RAMP_SATURATION[layerId];
      const clause =
        gldasChartedRecordClause(
          summarizeGldasChartedRecord(layerId, [1, null])
        ) ?? "";
      expect(clause).toContain(facts.reportedUnit);
      expect(clause).toContain(String(facts.ceiling.boundReported));
    }
  });

  it("claims no hydrologic condition, correction or forecast", () => {
    const clause =
      gldasChartedRecordClause(
        summarizeGldasChartedRecord("precip", [1, null])
      ) ?? "";
    for (const forbidden of [
      "drought",
      "flood",
      "runoff",
      "recharge",
      "forecast",
      "expect",
      "corrected",
    ]) {
      expect(clause.toLowerCase()).not.toContain(forbidden);
    }
  });
});

describe("gldasChartedRecordNote", () => {
  it("speaks for both water-cycle layers", () => {
    expect(gldasChartedRecordNote("precip", [1, null])).toContain(
      "sampled months"
    );
    expect(gldasChartedRecordNote("soil", [1, null])).toContain(
      "sampled months"
    );
  });

  it("stays silent for every layer it does not own", () => {
    // An absent month means something different on a layer drawn across its
    // whole range, and snow has its own charted-record module.
    for (const layerId of [
      "snow",
      "sst",
      "ndvi",
      "airtemp",
      "aerosol",
      "lst",
    ] as const) {
      expect(gldasChartedRecordNote(layerId, [1, null])).toBeNull();
    }
    expect(gldasChartedRecordNote(null, [1, null])).toBeNull();
    expect(gldasChartedRecordNote(undefined, [1, null])).toBeNull();
  });

  it("stays silent on a fully charted and on an empty record", () => {
    expect(gldasChartedRecordNote("precip", [1, 2, 3])).toBeNull();
    expect(gldasChartedRecordNote("precip", [null, null])).toBeNull();
  });
});
