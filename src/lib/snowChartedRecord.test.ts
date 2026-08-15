import { describe, expect, it } from "vitest";
import {
  SNOW_CHARTED_RECORD_LIMITATIONS,
  snowChartedRecordClause,
  snowChartedRecordNote,
  summarizeSnowChartedRecord,
} from "./snowChartedRecord";
import { LAYERS } from "./timeline";

describe("summarizeSnowChartedRecord", () => {
  it("reports no sampled months as unreported", () => {
    expect(summarizeSnowChartedRecord([]).status).toBe("unreported");
    expect(summarizeSnowChartedRecord(null).status).toBe("unreported");
    expect(summarizeSnowChartedRecord(undefined).status).toBe("unreported");
  });

  it("separates a fully charted record from a partial and an empty one", () => {
    expect(summarizeSnowChartedRecord([0.2, 0.5, 0.9]).status).toBe(
      "fully-charted"
    );
    expect(summarizeSnowChartedRecord([0.2, null, 0.9]).status).toBe(
      "partly-charted"
    );
    expect(summarizeSnowChartedRecord([null, null]).status).toBe(
      "no-charted-month"
    );
  });

  it("counts undefined and non-finite entries as uncharted", () => {
    const summary = summarizeSnowChartedRecord([
      0.4,
      undefined,
      Number.NaN,
      null,
      0.6,
    ]);
    expect(summary.sampledMonths).toBe(5);
    expect(summary.chartedMonths).toBe(2);
    expect(summary.status).toBe("partly-charted");
  });

  it("counts a charted zero as charted", () => {
    // 0 is falsy but is a value the sampler returned; only absence excludes.
    const summary = summarizeSnowChartedRecord([0, null]);
    expect(summary.chartedMonths).toBe(1);
  });

  it("carries the cited MOD10CM provenance and never claims a forecast", () => {
    const summary = summarizeSnowChartedRecord([0.3, null]);
    expect(summary.isForecast).toBe(false);
    expect(summary.dataset).toEqual(LAYERS.snow.dataset);
    expect(summary.dataset.shortName).toBe("MOD10CM");
    expect(summary.limitations).toBe(SNOW_CHARTED_RECORD_LIMITATIONS);
  });
});

describe("snowChartedRecordClause", () => {
  it("stays silent unless months were actually excluded", () => {
    for (const values of [[], [0.2, 0.5], [null, null], null]) {
      expect(
        snowChartedRecordClause(summarizeSnowChartedRecord(values))
      ).toBeNull();
    }
  });

  it("names both counts for a partial record", () => {
    const clause = snowChartedRecordClause(
      summarizeSnowChartedRecord([0.9, null, null, null])
    );
    expect(clause).toContain("snow charted in 1 of 4 sampled months");
  });

  it("names the transparent percent-0 band as the mechanism", () => {
    const clause = snowChartedRecordClause(
      summarizeSnowChartedRecord([0.9, null])
    );
    expect(clause).toContain("GIBS draws no colour for 0% snow");
    expect(clause).toContain("indistinguishable");
  });

  it("conditions the statistics rather than correcting them", () => {
    const clause = snowChartedRecordClause(
      summarizeSnowChartedRecord([0.9, null])
    );
    expect(clause).toContain("the mean is the mean where snow was drawn");
    expect(clause).toContain("neither the record's");
  });

  it("never substitutes a corrected value, a zero fill, or a snow-free verdict", () => {
    const clause =
      snowChartedRecordClause(summarizeSnowChartedRecord([0.9, null, null])) ??
      "";
    expect(clause).not.toMatch(/corrected|actually|really is|adjust/i);
    expect(clause).not.toMatch(/counted as 0|treated as zero|assume/i);
    expect(clause).not.toMatch(/\bsnow-free ground\b/i);
  });

  it("claims no depth, water equivalent, melt rate, season length, or forecast", () => {
    const clause =
      snowChartedRecordClause(summarizeSnowChartedRecord([0.9, null, 0.4])) ??
      "";
    expect(clause).not.toMatch(
      /depth|water equivalent|\bSWE\b|melt rate|runoff|season length|forecast|will /i
    );
  });
});

describe("snowChartedRecordNote", () => {
  it("speaks only for the snow layer", () => {
    const partial = [0.9, null, null];
    expect(snowChartedRecordNote("snow", partial)).toContain(
      "snow charted in 1 of 3"
    );
    for (const layerId of [
      "precip",
      "soil",
      "sst",
      "ndvi",
      "aerosol",
      "lst",
    ] as const) {
      expect(snowChartedRecordNote(layerId, partial)).toBeNull();
    }
    expect(snowChartedRecordNote(null, partial)).toBeNull();
    expect(snowChartedRecordNote(undefined, partial)).toBeNull();
  });

  it("leaves an ordinary full readout unchanged", () => {
    expect(snowChartedRecordNote("snow", [0.2, 0.4, 0.6])).toBeNull();
  });

  it("defers the empty record to the absence notes", () => {
    expect(snowChartedRecordNote("snow", [null, null, null])).toBeNull();
  });

  it("classifies gradient positions and physical percentages alike", () => {
    const gradient = [0.9, null, 0.4, null];
    const physical = [90, null, 40, null];
    expect(snowChartedRecordNote("snow", gradient)).toBe(
      snowChartedRecordNote("snow", physical)
    );
  });
});
