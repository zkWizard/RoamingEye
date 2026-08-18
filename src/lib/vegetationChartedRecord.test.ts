import { describe, expect, it } from "vitest";
import {
  VEGETATION_CHARTED_RECORD_LIMITATIONS,
  summarizeVegetationChartedRecord,
  vegetationChartedRecordClause,
  vegetationChartedRecordNote,
} from "./vegetationChartedRecord";
import { RENDERED_VEGETATION_INDEX_RANGE } from "./vegetationIndexRenderedRange";
import { emptyVegetationProbeNote } from "./vegetationProbeAbsence";
import { LAYERS } from "./timeline";

/** A series with `drawn` usable values padded out to `sampled` months. */
function series(drawn: number, sampled: number): (number | null)[] {
  return Array.from({ length: sampled }, (_, i) => (i < drawn ? 0.42 : null));
}

describe("summarizeVegetationChartedRecord", () => {
  it("classifies a partly drawn record and counts both totals", () => {
    const summary = summarizeVegetationChartedRecord("ndvi", series(11, 26));
    expect(summary.status).toBe("partly-drawn");
    expect(summary.drawnMonths).toBe(11);
    expect(summary.sampledMonths).toBe(26);
    expect(summary.index).toBe("ndvi");
    expect(summary.isForecast).toBe(false);
  });

  it("classifies the two ends and an unsampled record", () => {
    expect(
      summarizeVegetationChartedRecord("ndvi", series(26, 26)).status
    ).toBe("fully-drawn");
    expect(summarizeVegetationChartedRecord("ndvi", series(0, 26)).status).toBe(
      "no-drawn-month"
    );
    expect(summarizeVegetationChartedRecord("ndvi", []).status).toBe(
      "unreported"
    );
    expect(summarizeVegetationChartedRecord("ndvi", null).status).toBe(
      "unreported"
    );
  });

  it("reports every non-vegetation layer as unreported with no dataset", () => {
    for (const layerId of Object.keys(LAYERS) as (keyof typeof LAYERS)[]) {
      const summary = summarizeVegetationChartedRecord(layerId, series(3, 9));
      if (layerId === "ndvi" || layerId === "evi") {
        expect(summary.status).toBe("partly-drawn");
        expect(summary.dataset).not.toBeNull();
      } else {
        expect(summary.status).toBe("unreported");
        expect(summary.index).toBeNull();
        expect(summary.dataset).toBeNull();
      }
    }
  });

  it("reads presence only, so gradient positions and physical values agree", () => {
    const gradient = [0.01, null, 0.98, null];
    const physical = [-0.2, null, 0.91, null];
    expect(summarizeVegetationChartedRecord("ndvi", gradient).drawnMonths).toBe(
      summarizeVegetationChartedRecord("ndvi", physical).drawnMonths
    );
  });

  it("treats undefined and non-finite entries as undrawn", () => {
    const summary = summarizeVegetationChartedRecord("ndvi", [
      0.5,
      null,
      undefined,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ]);
    expect(summary.drawnMonths).toBe(1);
    expect(summary.sampledMonths).toBe(5);
  });

  it("is order-independent, including across an exact tie", () => {
    // Quantised colormap inversion makes exact repeats ordinary, and MOD13A3
    // monthly compositing makes plateau months identical floats.
    const records = [0.42, null, 0.42, null, 0.777];
    const forward = summarizeVegetationChartedRecord("ndvi", records);
    const reversed = summarizeVegetationChartedRecord(
      "ndvi",
      [...records].reverse()
    );
    expect(reversed).toEqual(forward);
    expect(vegetationChartedRecordNote("ndvi", [...records].reverse())).toBe(
      vegetationChartedRecordNote("ndvi", records)
    );
  });
});

describe("vegetationChartedRecordClause", () => {
  it("states the counts, the mechanism and the conditioning", () => {
    const clause = vegetationChartedRecordNote("ndvi", series(11, 26));
    expect(clause).toContain("NDVI drawn in 11 of 26 sampled months");
    expect(clause).toContain("indistinguishable");
    expect(clause).toContain("the drawn months alone");
    expect(clause).toContain("reads high");
  });

  it("quotes the ramp start and colormap document from the measured range", () => {
    for (const index of ["ndvi", "evi"] as const) {
      const range = RENDERED_VEGETATION_INDEX_RANGE[index];
      const clause = vegetationChartedRecordNote(index, series(4, 9));
      expect(clause).toContain(String(range.renderedMinimum));
      expect(clause).toContain(range.colormapDoc);
      expect(clause).toContain(`${index.toUpperCase()} drawn in 4 of 9`);
    }
  });

  it("is silent on both ends and on every layer it does not own", () => {
    expect(vegetationChartedRecordNote("ndvi", series(26, 26))).toBeNull();
    expect(vegetationChartedRecordNote("ndvi", series(0, 26))).toBeNull();
    expect(vegetationChartedRecordNote("ndvi", [])).toBeNull();
    expect(vegetationChartedRecordNote(undefined, series(3, 9))).toBeNull();
    expect(vegetationChartedRecordNote("snow", series(3, 9))).toBeNull();
    expect(vegetationChartedRecordNote("landcover", series(3, 9))).toBeNull();
  });

  it("stays null for a summary this module did not classify", () => {
    const foreign = summarizeVegetationChartedRecord("snow", series(3, 9));
    expect(vegetationChartedRecordClause(foreign)).toBeNull();
  });

  it("leaves the empty-record note to vegetationProbeAbsence", () => {
    // The wiring passes this module's output as `existingAbsenceNote`. A string
    // on a wholly empty record would suppress the strictest vegetation surface
    // there is, so the silence above is load-bearing, not cosmetic.
    const empty = series(0, 26);
    const note = vegetationChartedRecordNote("ndvi", empty);
    expect(note).toBeNull();
    expect(emptyVegetationProbeNote("ndvi", empty, note)).toContain(
      "no sampled month drew NDVI at this point"
    );
  });

  it("claims no magnitude, direction of change, cause or forecast", () => {
    const clause = vegetationChartedRecordNote("ndvi", series(11, 26))!;
    expect(clause).not.toMatch(/forecast|predict|will |expect/i);
    expect(clause).not.toMatch(/greener|browner|degrad|recover|decline|trend/i);
    expect(clause).not.toMatch(/because of|caused|due to|drought|deforest/i);
    expect(clause).not.toMatch(
      /biomass|habitat|productivit|health|cover loss/i
    );
    // Never resolves the ambiguity it exists to state, and never zero-fills.
    expect(clause).not.toMatch(/counted as zero|treated as zero|assume/i);
  });
});

describe("VEGETATION_CHARTED_RECORD_LIMITATIONS", () => {
  it("refuses availability, correction and season-length readings", () => {
    const joined = VEGETATION_CHARTED_RECORD_LIMITATIONS.join(" ");
    expect(joined).toMatch(/not a measure of data availability/);
    expect(joined).toMatch(/never counted as zero/);
    expect(joined).toMatch(/not a growing-season length/);
    expect(VEGETATION_CHARTED_RECORD_LIMITATIONS.length).toBeGreaterThan(4);
  });
});
