import { describe, expect, it } from "vitest";
import {
  PROBE_RECORD_GAPS_LIMITATIONS,
  probeRecordGaps,
  probeRecordGapsClause,
  probeRecordGapsCsvHeaders,
} from "./probeRecordGaps";
import { LAYERS, monthRangeForLayer, type YearMonth } from "./timeline";

const ym = (year: number, month: number): YearMonth => ({ year, month });

describe("probeRecordGaps", () => {
  it("recovers the pinned MOD13A3 gap from a charted vegetation record", () => {
    const gaps = probeRecordGaps("ndvi", monthRangeForLayer(LAYERS.ndvi));
    expect(gaps.applicable).toBe(true);
    expect(gaps.months).toEqual([ym(2025, 4)]);
    expect(gaps.dataset).toBe(LAYERS.ndvi.dataset);
    expect(gaps.isObservation).toBe(false);
    expect(gaps.limitations).toBe(PROBE_RECORD_GAPS_LIMITATIONS);
  });

  it("reports every pinned SST gap, since the charted series drops them all", () => {
    const months = monthRangeForLayer(LAYERS.sst);
    const gaps = probeRecordGaps("sst", months);
    expect(gaps.months).toEqual(LAYERS.sst.unpublished);
    // The whole point: none of them survive into the series being summarized.
    for (const gap of gaps.months) {
      expect(
        months.some((m) => m.year === gap.year && m.month === gap.month)
      ).toBe(false);
    }
  });

  it("is inapplicable for a layer that pins no distribution gap", () => {
    const gaps = probeRecordGaps("precip", monthRangeForLayer(LAYERS.precip));
    expect(gaps.applicable).toBe(false);
    expect(gaps.months).toEqual([]);
    expect(probeRecordGapsClause(gaps)).toBeNull();
  });

  it("is inapplicable when no layer is identified", () => {
    const gaps = probeRecordGaps(undefined, [ym(2024, 1), ym(2024, 2)]);
    expect(gaps.applicable).toBe(false);
    expect(gaps.dataset).toBeNull();
    expect(probeRecordGapsClause(gaps)).toBeNull();
  });

  it("excludes a pinned gap that falls outside the charted span", () => {
    // MOD13A3's only gap is Apr 2025; a window that ends before it is clean.
    const gaps = probeRecordGaps("ndvi", [
      ym(2024, 1),
      ym(2024, 2),
      ym(2024, 3),
    ]);
    expect(gaps.applicable).toBe(true);
    expect(gaps.months).toEqual([]);
    expect(probeRecordGapsClause(gaps)).toBeNull();
  });

  it("takes the span from the extremes, not the array ends", () => {
    const gaps = probeRecordGaps("ndvi", [ym(2026, 1), ym(2024, 1)]);
    expect(gaps.months).toEqual([ym(2025, 4)]);
  });

  it("holds no opinion on an empty series beyond the layer's own catalog", () => {
    const gaps = probeRecordGaps("sst", []);
    expect(gaps.applicable).toBe(true);
    expect(gaps.months).toEqual([]);
    expect(probeRecordGapsClause(gaps)).toBeNull();
  });
});

describe("probeRecordGapsClause", () => {
  it("names a single gap month in the singular", () => {
    const clause = probeRecordGapsClause(
      probeRecordGaps("ndvi", monthRangeForLayer(LAYERS.ndvi))
    );
    expect(clause).toBe(
      "span also holds 1 month the source never distributed (Apr 2025), " +
        "absent from the count, the chart and the CSV"
    );
  });

  it("lists the first three gap months and tallies the rest", () => {
    const clause = probeRecordGapsClause(
      probeRecordGaps("snow", monthRangeForLayer(LAYERS.snow))
    );
    expect(clause).toBe(
      "span also holds 6 months the source never distributed " +
        "(Aug 2000, Jun 2001, Mar 2002, +3 more), " +
        "absent from the count, the chart and the CSV"
    );
  });

  it("lists all of them when the layer pins no more than three", () => {
    const clause = probeRecordGapsClause({
      kind: "probe-record-gaps",
      isObservation: false,
      isForecast: false,
      applicable: true,
      months: [ym(2023, 6), ym(2023, 10)],
      dataset: LAYERS.sst.dataset ?? null,
      limitations: PROBE_RECORD_GAPS_LIMITATIONS,
    });
    expect(clause).toBe(
      "span also holds 2 months the source never distributed " +
        "(Jun 2023, Oct 2023), absent from the count, the chart and the CSV"
    );
  });

  it("claims no observation or forecast anywhere in its wording", () => {
    const clause =
      probeRecordGapsClause(
        probeRecordGaps("sst", monthRangeForLayer(LAYERS.sst))
      ) ?? "";
    expect(clause).not.toMatch(/no data|missing observation|forecast|expect/i);
    expect(clause).toContain("never distributed");
  });
});

describe("probeRecordGapsCsvHeaders", () => {
  it("names every gap month in the CSV's own year_month format", () => {
    const headers = probeRecordGapsCsvHeaders(
      probeRecordGaps("ndvi", monthRangeForLayer(LAYERS.ndvi))
    );
    expect(headers).toHaveLength(2);
    expect(headers[0]).toContain("(2025-04)");
    // A single gap has to read as one: "1 month ... carry" shipped once.
    expect(headers[0]).toContain("1 month inside this file's span carries");
    expect(headers[0]).toContain("has no row below");
  });

  it("lists ALL gap months rather than truncating the way the panel does", () => {
    const months = monthRangeForLayer(LAYERS.snow);
    const pinned = LAYERS.snow.unpublished ?? [];
    // The status line caps its list at three and tallies the rest; an archived
    // file has no display budget, so a partial list would be the same defect.
    expect(pinned.length).toBeGreaterThan(3);
    expect(probeRecordGapsClause(probeRecordGaps("snow", months))).toContain(
      "more"
    );
    const header = probeRecordGapsCsvHeaders(
      probeRecordGaps("snow", months)
    )[0];
    for (const gap of pinned) {
      expect(header).toContain(
        `${gap.year}-${String(gap.month).padStart(2, "0")}`
      );
    }
    expect(header).not.toContain("more");
  });

  it("stays silent for a layer that pins no gaps, keeping its CSV unchanged", () => {
    expect(
      probeRecordGapsCsvHeaders(
        probeRecordGaps("precip", monthRangeForLayer(LAYERS.precip))
      )
    ).toEqual([]);
    expect(probeRecordGapsCsvHeaders(probeRecordGaps(undefined, []))).toEqual(
      []
    );
  });

  it("never puts a comma in a `#` line — the CSV header contract", () => {
    for (const id of ["sst", "snow", "ndvi", "evi"] as const) {
      for (const line of probeRecordGapsCsvHeaders(
        probeRecordGaps(id, monthRangeForLayer(LAYERS[id]))
      )) {
        expect(line.startsWith("# "), line).toBe(true);
        expect(line, `comma would tear this header: ${line}`).not.toContain(
          ","
        );
        expect(line).not.toMatch(/[\r\n"]/);
      }
    }
  });

  it("reports distribution and never claims what happened those months", () => {
    const headers = probeRecordGapsCsvHeaders(
      probeRecordGaps("sst", monthRangeForLayer(LAYERS.sst))
    ).join(" ");
    expect(headers).toContain("not an observation that came back empty");
    expect(headers).toContain("says nothing about conditions");
    expect(headers).not.toMatch(/forecast|expected|anomalous|warmer|cooler/i);
  });
});
