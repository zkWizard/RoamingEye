import { describe, expect, it } from "vitest";
import { SEA_SURFACE_TEMPERATURE_COVERAGE_SOURCE } from "./marineCoverage";
import {
  SST_NATIVE_SUPPORT_LIMITATIONS,
  describeSstNativeSupport,
  qualifyingSstNativeSupportNote,
  sstNativeSupportNote,
  summarizeSstNativeSupport,
} from "./sstNativeSupport";
import type { DatasetRef } from "./timeline";

const SST_SOURCE = SEA_SURFACE_TEMPERATURE_COVERAGE_SOURCE.source;

/** Degrees of latitude spanning `cells` native 9 km cells. */
function latSpanForCells(cells: number): number {
  return (cells * 9000) / 111_320;
}

describe("SST native-grid support", () => {
  it("reads the 9 km grid from the cited SST title rather than a side table", () => {
    const summary = summarizeSstNativeSupport({
      south: 0,
      north: 10,
      west: 0,
      east: 10,
    });

    expect(summary).toMatchObject({
      kind: "sea-surface-temperature-native-support",
      marineBiologyObservation: false,
      isForecast: false,
      claimScope: "descriptive-native-grid-support-only",
      status: "graded",
      statedGrid: "9km",
      nativeCellMetres: 9000,
    });
    expect(summary.source).toBe(SST_SOURCE);
    expect(summary.limits).toBe(SST_NATIVE_SUPPORT_LIMITATIONS);
  });

  it("flags a small coastal boundary as narrower than one native cell", () => {
    // ~5.6 km x ~4.3 km at 40 N — a bay or harbour. Every rendered pixel in it
    // carries one source value, and that cell's footprint spills outside the
    // searched boundary.
    const summary = summarizeSstNativeSupport({
      south: 40,
      north: 40.05,
      west: -70.05,
      east: -70,
    });

    expect(summary.status).toBe("graded");
    expect(summary.supportClass).toBe("sub-cell");
    expect(summary.nativeCellExceedsBoundary).toBe(true);
    expect(summary.meanBoundedBySingleCell).toBe(true);
    expect(summary.boundedCellCount).toBeLessThan(1);
    expect(describeSstNativeSupport(summary)).toBe(
      "Searched boundary is narrower than one 9km MODIS_AQUA_L3_SST_THERMAL_MONTHLY_9KM_DAYTIME_V2019.0 v2019.0 cell, whose footprint extends beyond it; the mean rests on a single source cell"
    );
  });

  it("treats a thin sliver as sub-cell even when its area bounds several cells", () => {
    // ~1.1 km tall but ~557 km wide: the area ratio alone would read as
    // "few-cells", yet nothing in it resolves a full cell north-south.
    const summary = summarizeSstNativeSupport({
      south: 0,
      north: 0.01,
      west: 0,
      east: 5,
    });

    expect(summary.boundedCellCount).toBeGreaterThan(2);
    expect(summary.supportClass).toBe("sub-cell");
    expect(summary.nativeCellExceedsBoundary).toBe(true);
  });

  it("bounds a mean to a single independent measurement just above one cell", () => {
    const summary = summarizeSstNativeSupport({
      south: 0,
      north: latSpanForCells(1.2),
      west: 0,
      east: latSpanForCells(1.3),
    });

    expect(summary.supportClass).toBe("single-cell");
    expect(summary.nativeCellExceedsBoundary).toBe(false);
    expect(summary.meanBoundedBySingleCell).toBe(true);
    expect(summary.boundedCellCount).toBeCloseTo(1.56, 1);
    expect(describeSstNativeSupport(summary)).toContain(
      "cannot rest on more than one independent source measurement"
    );
  });

  it("grades a few native cells without claiming they were all retrieved", () => {
    const summary = summarizeSstNativeSupport({
      south: 0,
      north: latSpanForCells(1.5),
      west: 0,
      east: latSpanForCells(2),
    });

    expect(summary.supportClass).toBe("few-cells");
    expect(summary.meanBoundedBySingleCell).toBe(false);
    expect(summary.boundedCellCount).toBeCloseTo(3, 1);
    // "at most" keeps the figure a bound on the extent, never a retrieval count.
    expect(describeSstNativeSupport(summary)).toContain("bounds at most 3.0");
  });

  it("grades an ocean basin as many native cells", () => {
    const summary = summarizeSstNativeSupport({
      south: 0,
      north: 20,
      west: 0,
      east: 20,
    });

    expect(summary.supportClass).toBe("many-cells");
    expect(summary.nativeCellExceedsBoundary).toBe(false);
    expect(summary.meanBoundedBySingleCell).toBe(false);
    expect(summary.boundedCellCount).toBeGreaterThan(50_000);
    // Whole numbers above 10 — a fractional cell bound would imply precision
    // the nominal degree-length conversion does not carry.
    expect(describeSstNativeSupport(summary)).toMatch(/at most \d+ 9km/);
  });

  it("narrows the east-west bound at high latitude for the same longitude span", () => {
    const tropical = summarizeSstNativeSupport({
      south: 0,
      north: 1,
      west: 0,
      east: 5,
    });
    const subpolar = summarizeSstNativeSupport({
      south: 60,
      north: 61,
      west: 0,
      east: 5,
    });

    expect(tropical.extentNorthSouthMetres).toBeCloseTo(
      subpolar.extentNorthSouthMetres as number,
      5
    );
    // Longitude cells converge poleward, so the same 5 degrees spans fewer of
    // them at 60 N than at the equator.
    expect(subpolar.extentEastWestMetres as number).toBeLessThan(
      tropical.extentEastWestMetres as number
    );
    expect(subpolar.boundedCellCount as number).toBeLessThan(
      tropical.boundedCellCount as number
    );
  });

  it("clamps the mid-latitude cosine so a polar box stays finite", () => {
    const summary = summarizeSstNativeSupport({
      south: 88,
      north: 89,
      west: 0,
      east: 10,
    });

    expect(summary.status).toBe("graded");
    expect(Number.isFinite(summary.boundedCellCount as number)).toBe(true);
    // cos(88.5 deg) is ~0.026; the 0.15 floor keeps the bound conservative
    // instead of collapsing the extent toward zero.
    expect(summary.extentEastWestMetres).toBeCloseTo(10 * 111_320 * 0.15, 5);
  });

  it("reports an unstated grid as unknown instead of inventing a resolution", () => {
    // A real repo citation that names no grid: MERRA-2 single-level diagnostics.
    const ungridded: DatasetRef = {
      shortName: "M2TMNXSLV",
      version: "5.12.4",
      doi: "10.5067/AP1B0BA5PD2K",
      title: "MERRA-2 tavgM_2d_slv_Nx: Monthly Single-Level Diagnostics",
    };
    const summary = summarizeSstNativeSupport(
      { south: 0, north: 10, west: 0, east: 10 },
      ungridded
    );

    expect(summary.status).toBe("unknown-native-grid");
    expect(summary.statedGrid).toBeNull();
    expect(summary.nativeCellMetres).toBeNull();
    expect(summary.boundedCellCount).toBeNull();
    expect(summary.supportClass).toBeNull();
    expect(summary.nativeCellExceedsBoundary).toBe(false);
    expect(summary.source).toBe(ungridded);
    expect(describeSstNativeSupport(summary)).toContain(
      "states no native grid in its citation"
    );
  });

  it("prefers the unknown-grid state over a geometry complaint", () => {
    const ungridded: DatasetRef = {
      shortName: "NOGRID",
      version: "1",
      doi: "10.5067/NOGRID",
      title: "A product whose title states no grid",
    };

    // Both inputs are unusable; the citation gap is the more specific fact.
    expect(summarizeSstNativeSupport(null, ungridded).status).toBe(
      "unknown-native-grid"
    );
  });

  it.each([
    ["null bounds", null],
    ["inverted latitude", { south: 10, north: 0, west: 0, east: 10 }],
    ["zero-width box", { south: 0, north: 10, west: 5, east: 5 }],
    ["non-finite edge", { south: 0, north: Number.NaN, west: 0, east: 10 }],
    ["out-of-range latitude", { south: 0, north: 91, west: 0, east: 10 }],
  ])("declines to grade %s", (_label, bounds) => {
    const summary = summarizeSstNativeSupport(bounds);

    expect(summary.status).toBe("invalid-bounds");
    expect(summary.boundedCellCount).toBeNull();
    expect(summary.supportClass).toBeNull();
    expect(summary.meanBoundedBySingleCell).toBe(false);
    // The grid is still known and reported; only the extent is unusable.
    expect(summary.statedGrid).toBe("9km");
    expect(describeSstNativeSupport(summary)).toContain("cannot be bounded");
  });

  it("keeps every summary free of biology, forecast, and fitness claims", () => {
    const summaries = [
      summarizeSstNativeSupport({ south: 0, north: 20, west: 0, east: 20 }),
      summarizeSstNativeSupport({
        south: 40,
        north: 40.05,
        west: -70.05,
        east: -70,
      }),
      summarizeSstNativeSupport(null),
    ];

    for (const summary of summaries) {
      expect(summary.marineBiologyObservation).toBe(false);
      expect(summary.isForecast).toBe(false);
      expect(summary.claimScope).toBe("descriptive-native-grid-support-only");
      expect(summary.statement).not.toMatch(
        /habitat|species|reliab|accurate|healthy|risk|will |expect/i
      );
    }
  });
});

describe("SST native-grid support place-card note", () => {
  it("warns that one cell's footprint spills outside a harbour-sized boundary", () => {
    // Same ~5.6 km x ~4.3 km bay as above: the card beside it can still print a
    // high sampled-coverage share, which says nothing about how many source
    // values that share carries.
    const note = qualifyingSstNativeSupportNote(
      summarizeSstNativeSupport({
        south: 40,
        north: 40.05,
        west: -70.05,
        east: -70,
      })
    );

    expect(note).toBe(
      "searched boundary is narrower than one 9km source cell, whose footprint extends beyond it — the mean rests on a single source cell"
    );
  });

  it("reports only the spill for a sliver whose area bounds several cells", () => {
    // Sub-cell north-south, but wide enough that the mean does rest on more
    // than one source value — so the single-cell half of the sentence would be
    // false and is left off.
    const note = qualifyingSstNativeSupportNote(
      summarizeSstNativeSupport({ south: 0, north: 0.01, west: 0, east: 5 })
    );

    expect(note).toBe(
      "searched boundary is narrower than one 9km source cell in one direction, so that cell's footprint extends beyond it"
    );
  });

  it("bounds the mean to one measurement when the extent clears a cell each way", () => {
    const note = qualifyingSstNativeSupportNote(
      summarizeSstNativeSupport({
        south: 0,
        north: latSpanForCells(1.2),
        west: 0,
        east: latSpanForCells(1.3),
      })
    );

    // "at most" keeps the figure a bound on the extent, never a retrieval count.
    expect(note).toBe(
      "searched boundary bounds at most 1.6 9km source cells — the mean cannot rest on more than one independent source measurement"
    );
  });

  it("stays silent when the extent resolves the grid it is read on", () => {
    for (const bounds of [
      {
        south: 0,
        north: latSpanForCells(1.5),
        west: 0,
        east: latSpanForCells(2),
      },
      { south: 0, north: 20, west: 0, east: 20 },
    ]) {
      const summary = summarizeSstNativeSupport(bounds);

      expect(summary.meanBoundedBySingleCell).toBe(false);
      expect(summary.nativeCellExceedsBoundary).toBe(false);
      expect(qualifyingSstNativeSupportNote(summary)).toBeNull();
    }
  });

  it("stays silent for an ungraded summary rather than guessing a bound", () => {
    // An unusable extent and an unstated grid are properties of the workflow
    // and the citation; the reading that hit them already says so.
    expect(
      qualifyingSstNativeSupportNote(summarizeSstNativeSupport(null))
    ).toBeNull();

    const noGrid: DatasetRef = {
      ...SST_SOURCE,
      title: "Monthly sea surface temperature with no stated grid",
    };
    const ungridded = summarizeSstNativeSupport(
      { south: 40, north: 40.05, west: -70.05, east: -70 },
      noGrid
    );

    expect(ungridded.status).toBe("unknown-native-grid");
    expect(qualifyingSstNativeSupportNote(ungridded)).toBeNull();
  });

  it("keeps the note free of biology, fitness, and forecast claims", () => {
    const notes = [
      { south: 40, north: 40.05, west: -70.05, east: -70 },
      { south: 0, north: 0.01, west: 0, east: 5 },
      {
        south: 0,
        north: latSpanForCells(1.2),
        west: 0,
        east: latSpanForCells(1.3),
      },
    ].map((bounds) =>
      qualifyingSstNativeSupportNote(summarizeSstNativeSupport(bounds))
    );

    for (const note of notes) {
      expect(note).not.toBeNull();
      expect(note).not.toMatch(
        /habitat|species|reliab|accurate|healthy|risk|will |expect/i
      );
      // A fragment for a semicolon-joined card line, so it never opens a new
      // sentence or repeats the citation the same line already carries.
      expect(note![0]).toBe(note![0].toLowerCase());
      expect(note).not.toContain(SST_SOURCE.shortName);
    }
  });
});

describe("SST native-grid support drawn-region note", () => {
  /** The smallest region `boundsUsable` accepts, centred on `midLat`. */
  function smallestDrawnRegion(midLat: number) {
    return {
      south: midLat - 0.1,
      north: midLat + 0.1,
      west: 20,
      east: 20.2,
    };
  }

  /** One month of charted values, so the note has a mean to qualify. */
  const CHARTED = [null, 4.2, null];

  it("names the drawn region rather than a boundary the probe never searched", () => {
    const note = qualifyingSstNativeSupportNote(
      summarizeSstNativeSupport({
        south: 40,
        north: 40.05,
        west: -70.05,
        east: -70,
      }),
      "drawn-region"
    );

    expect(note).toBe(
      "drawn region is narrower than one 9km source cell, whose footprint extends beyond it — the mean rests on a single source cell"
    );
  });

  it("keeps the place card's wording when no footprint is passed", () => {
    const bounds = { south: 0, north: 0.01, west: 0, east: 5 };
    const summary = summarizeSstNativeSupport(bounds);

    expect(qualifyingSstNativeSupportNote(summary)).toBe(
      qualifyingSstNativeSupportNote(summary, "searched-boundary")
    );
    expect(qualifyingSstNativeSupportNote(summary)).toContain(
      "searched boundary"
    );
  });

  it("qualifies the smallest region drawable in the Barents Sea", () => {
    // 0.2° is the floor `boundsUsable` enforces. At 75°N that is ~5.8 km of
    // longitude — narrower than one 9 km cell — so the charted mean rests on a
    // single retrieval that also covers water outside the box.
    expect(
      sstNativeSupportNote(
        "sst",
        "drawn-region",
        smallestDrawnRegion(75),
        CHARTED
      )
    ).toBe(
      "drawn region is narrower than one 9km source cell, whose footprint extends beyond it — the mean rests on a single source cell"
    );
  });

  it("reports only the spill just inside the Arctic Circle", () => {
    // At 68°N the same box is still sub-cell east-west, but its area bounds
    // more than two cells — so the single-cell half would be false.
    expect(
      sstNativeSupportNote(
        "sst",
        "drawn-region",
        smallestDrawnRegion(68),
        CHARTED
      )
    ).toBe(
      "drawn region is narrower than one 9km source cell in one direction, so that cell's footprint extends beyond it"
    );
  });

  it("stays silent for the same box at a mid-latitude that resolves the grid", () => {
    // The clause is a property of the geometry, not of drawing a small box:
    // at 40°N the minimum region already spans more than one cell each way.
    expect(
      sstNativeSupportNote(
        "sst",
        "drawn-region",
        smallestDrawnRegion(40),
        CHARTED
      )
    ).toBeNull();
  });

  it("stays silent for a region that never charted a value", () => {
    // An all-land or fully clouded polar box has no mean for the geometry to
    // qualify, and the empty-series notes already explain the absence.
    for (const values of [[], [null, null], null, undefined]) {
      expect(
        sstNativeSupportNote(
          "sst",
          "drawn-region",
          smallestDrawnRegion(75),
          values
        )
      ).toBeNull();
    }
  });

  it("speaks only for the layer whose cited grid it read", () => {
    // The 9 km bound describes the SST product; no other layer is graded by it.
    for (const layerId of ["ndvi", "aerosol", "airtemp", "lst"] as const) {
      expect(
        sstNativeSupportNote(
          layerId,
          "drawn-region",
          smallestDrawnRegion(75),
          CHARTED
        )
      ).toBeNull();
    }
  });

  it("claims sampling geometry only, as a fragment for the status line", () => {
    const note = sstNativeSupportNote(
      "sst",
      "drawn-region",
      smallestDrawnRegion(75),
      CHARTED
    );

    expect(note).not.toBeNull();
    expect(note).not.toMatch(
      /habitat|species|heatwave|reliab|accurate|healthy|risk|will |expect/i
    );
    expect(note![0]).toBe(note![0].toLowerCase());
    expect(note).not.toContain(SST_SOURCE.shortName);
  });
});
