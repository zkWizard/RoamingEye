import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  distinctPlateBoundaries,
  plateBoundaryDuplication,
} from "./plateBoundaryDuplication";
import { summarizePlateBoundaryLengths } from "./plateBoundaryLength";
import { parsePlateBoundaries } from "./plates";
import type { PlateBoundary } from "./plates";
import type { Position } from "./geojson";

const trace = (name: string, points: Position[]): PlateBoundary => ({
  name,
  points,
});

/** Two vertices one degree apart on the equator, ~111 km. */
const A: Position[] = [
  [0, 0],
  [1, 0],
];
/** A different trace, ~111 km, sharing no vertex with A. */
const B: Position[] = [
  [10, 0],
  [11, 0],
];

describe("plateBoundaryDuplication", () => {
  it("reports no repeats when every supplied trace is distinct", () => {
    const report = plateBoundaryDuplication([
      trace("AF-AN", A),
      trace("NA-PA", B),
    ]);
    expect(report.status).toBe("no-repeats");
    expect(report.repeats).toEqual([]);
    expect(report.repeatedFeatureCount).toBe(0);
    expect(report.distinctTraceCount).toBe(2);
    expect(report.redundantLengthKm).toBe(0);
    expect(report.distinctLengthKm).toBe(report.suppliedLengthKm);
  });

  it("makes an empty input explicit rather than reporting a clean file", () => {
    const report = plateBoundaryDuplication([]);
    expect(report.status).toBe("no-boundaries");
    expect(report.suppliedBoundaryCount).toBe(0);
    expect(report.distinctTraceCount).toBe(0);
    expect(report.suppliedLengthKm).toBe(0);
  });

  it("detects a verbatim repeat and attributes its length to the redundancy", () => {
    const report = plateBoundaryDuplication([
      trace("PA-AN", A),
      trace("NA-PA", B),
      trace("PA-AN", A),
    ]);
    expect(report.status).toBe("repeats-present");
    expect(report.repeats).toHaveLength(1);
    const [repeat] = report.repeats;
    expect(repeat.firstIndex).toBe(0);
    expect(repeat.repeatIndices).toEqual([2]);
    expect(repeat.labels).toEqual(["PA-AN", "PA-AN"]);
    expect(repeat.sameLabel).toBe(true);
    expect(repeat.vertexCount).toBe(2);
    expect(repeat.redundantLengthKm).toBeCloseTo(repeat.traceLengthKm, 9);

    expect(report.repeatedFeatureCount).toBe(1);
    expect(report.distinctTraceCount).toBe(2);
    // Three supplied features, but only two distinct traces of equal length.
    expect(report.suppliedLengthKm).toBeCloseTo(repeat.traceLengthKm * 3, 6);
    expect(report.distinctLengthKm).toBeCloseTo(repeat.traceLengthKm * 2, 6);
  });

  it("matches a trace digitized in the opposite direction", () => {
    const report = plateBoundaryDuplication([
      trace("PA-AN", A),
      trace("PA-AN", [...A].reverse()),
    ]);
    expect(report.repeats).toHaveLength(1);
    expect(report.repeats[0].repeatIndices).toEqual([1]);
    expect(report.distinctTraceCount).toBe(1);
  });

  it("counts every extra copy beyond the first", () => {
    const report = plateBoundaryDuplication([
      trace("PA-AN", A),
      trace("PA-AN", A),
      trace("PA-AN", A),
    ]);
    const [repeat] = report.repeats;
    expect(repeat.repeatIndices).toEqual([1, 2]);
    expect(repeat.redundantLengthKm).toBeCloseTo(repeat.traceLengthKm * 2, 9);
    expect(report.repeatedFeatureCount).toBe(2);
    expect(report.distinctTraceCount).toBe(1);
  });

  it("flags a repeated trace whose copies are labelled differently", () => {
    const report = plateBoundaryDuplication([
      trace("MS\\BH", A),
      trace("MS\\SU", A),
    ]);
    expect(report.repeats).toHaveLength(1);
    expect(report.repeats[0].sameLabel).toBe(false);
    expect(report.repeats[0].labels).toEqual(["MS\\BH", "MS\\SU"]);
  });

  it("reads an empty source label as null rather than as a label", () => {
    const report = plateBoundaryDuplication([trace("", A), trace("  ", A)]);
    expect(report.repeats[0].labels).toEqual([null, null]);
    expect(report.repeats[0].sameLabel).toBe(true);
  });

  it("leaves traces that merely share a junction vertex alone", () => {
    // Adjacent PB2002 steps meet at a shared endpoint. Overlapping in part is
    // not a repeat, and merging them would invent a boundary the source split.
    const report = plateBoundaryDuplication([
      trace("AF-AN", [
        [0, 0],
        [1, 0],
      ]),
      trace("AN-AF", [
        [1, 0],
        [2, 0],
      ]),
    ]);
    expect(report.status).toBe("no-repeats");
    expect(report.distinctTraceCount).toBe(2);
  });

  it("does not match traces that differ in a single vertex", () => {
    const report = plateBoundaryDuplication([
      trace("AF-AN", A),
      trace("AF-AN", [
        [0, 0],
        [1, 0.001],
      ]),
    ]);
    expect(report.status).toBe("no-repeats");
  });

  it("reports a repeated zero-length trace without inventing length", () => {
    const point: Position[] = [[5, 5]];
    const report = plateBoundaryDuplication([
      trace("AF-AN", point),
      trace("AF-AN", point),
    ]);
    expect(report.repeats).toHaveLength(1);
    expect(report.repeats[0].traceLengthKm).toBe(0);
    expect(report.redundantLengthKm).toBe(0);
    expect(report.repeatedFeatureCount).toBe(1);
  });
});

describe("distinctPlateBoundaries", () => {
  it("keeps the first occurrence verbatim and preserves supply order", () => {
    const first = trace("PA-AN", A);
    const other = trace("NA-PA", B);
    const distinct = distinctPlateBoundaries([first, other, trace("PA-AN", A)]);
    expect(distinct).toHaveLength(2);
    expect(distinct[0]).toBe(first);
    expect(distinct[1]).toBe(other);
  });

  it("returns the input unchanged when nothing repeats", () => {
    const supplied = [trace("AF-AN", A), trace("NA-PA", B)];
    expect(distinctPlateBoundaries(supplied)).toEqual(supplied);
  });

  it("lets a length inventory total each mapped trace once", () => {
    const supplied = [trace("PA-AN", A), trace("PA-AN", A)];
    const asSupplied = summarizePlateBoundaryLengths(supplied);
    const deduplicated = summarizePlateBoundaryLengths(
      distinctPlateBoundaries(supplied)
    );
    expect(asSupplied.entries[0].featureCount).toBe(2);
    expect(deduplicated.entries[0].featureCount).toBe(1);
    expect(deduplicated.totalLengthKm).toBeCloseTo(
      asSupplied.totalLengthKm / 2,
      9
    );
  });
});

/**
 * Guards the redundancy actually present in the bundled file. These are
 * source-digitization artifacts, not a RoamingEye bug: if a regeneration ever
 * removes or adds one, the counts below should be re-measured deliberately
 * rather than drift unnoticed into the length inventory.
 */
describe("the bundled Bird (2003) linework", () => {
  const boundaries = parsePlateBoundaries(
    JSON.parse(
      readFileSync(
        join(
          __dirname,
          "..",
          "..",
          "public",
          "data",
          "plate-boundaries.geojson"
        ),
        "utf8"
      )
    )
  );

  it("supplies six traces twice, all of them consistently labelled", () => {
    const report = plateBoundaryDuplication(boundaries);
    expect(report.status).toBe("repeats-present");
    expect(report.repeats).toHaveLength(6);
    expect(report.repeatedFeatureCount).toBe(6);
    expect(report.distinctTraceCount).toBe(report.suppliedBoundaryCount - 6);
    // Every copy carries the source's identical Name, so none of these is an
    // ambiguous two-plate-pair trace needing a source ruling.
    expect(report.repeats.every((repeat) => repeat.sameLabel)).toBe(true);
    expect(report.repeats.map((repeat) => repeat.labels[0])).toEqual([
      "PA-AN",
      "KE/PA",
      "KE-AU",
      "NA/PA",
      "BR-AU",
      "PA-BR",
    ]);
  });

  it("double-counts ~4.7% of the mapped length as supplied", () => {
    const report = plateBoundaryDuplication(boundaries);
    expect(report.redundantLengthKm).toBeGreaterThan(12_000);
    expect(report.redundantLengthKm).toBeLessThan(14_000);
    const share = report.redundantLengthKm / report.suppliedLengthKm;
    expect(share).toBeGreaterThan(0.04);
    expect(share).toBeLessThan(0.06);
    // The report's own totals must reconcile with the length inventory it
    // describes, so the two modules can never drift apart.
    expect(report.suppliedLengthKm).toBeCloseTo(
      summarizePlateBoundaryLengths(boundaries).totalLengthKm,
      6
    );
    expect(report.distinctLengthKm).toBeCloseTo(
      summarizePlateBoundaryLengths(distinctPlateBoundaries(boundaries))
        .totalLengthKm,
      6
    );
  });

  it("inflates the Antarctica–Pacific pair by more than 80% as supplied", () => {
    const lengthFor = (input: readonly PlateBoundary[], pair: string): number =>
      summarizePlateBoundaryLengths(input).entries.find(
        (entry) => entry.name === pair
      )?.lengthKm ?? 0;

    const distinct = distinctPlateBoundaries(boundaries);
    // The repeated western half of the antimeridian-crossing PA-AN step is
    // nearly as long as the rest of the pair's mapped boundary.
    expect(lengthFor(boundaries, "AN-PA")).toBeGreaterThan(
      lengthFor(distinct, "AN-PA") * 1.8
    );
    expect(lengthFor(boundaries, "NA-PA")).toBeGreaterThan(
      lengthFor(distinct, "NA-PA") * 1.25
    );
    // A pair with no repeated step is untouched by the deduplication.
    expect(lengthFor(distinct, "AF-AN")).toBeCloseTo(
      lengthFor(boundaries, "AF-AN"),
      9
    );
  });
});
