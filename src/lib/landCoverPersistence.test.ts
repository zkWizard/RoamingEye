import { describe, expect, it } from "vitest";
import { LAND_COVER_SOURCE } from "./landCover";
import {
  LAND_COVER_PERSISTENCE_SOURCE,
  MINIMUM_YEARS_FOR_PERSISTENCE,
  summarizeLandCoverPersistence,
} from "./landCoverPersistence";

describe("land-cover persistence summaries", () => {
  it("counts per-class tenure and reports the modal class without averaging codes", () => {
    const summary = summarizeLandCoverPersistence([
      { year: 2019, classCode: 12 },
      { year: 2020, classCode: 12 },
      { year: 2021, classCode: 10 },
      { year: 2022, classCode: 12 },
    ]);

    expect(summary).toMatchObject({
      kind: "observed-land-cover-persistence",
      isForecast: false,
      classScheme: "IGBP",
      source: LAND_COVER_SOURCE,
      distinctKnownClassCount: 2,
      coverage: {
        status: "available",
        yearSpan: { firstYear: 2019, lastYear: 2022 },
        observedYearCount: 4,
        knownLandCoverYearCount: 4,
        unclassifiedYearCount: 0,
        noDataYearCount: 0,
        invalidRecordCount: 0,
        isSparse: false,
        reason: null,
      },
      persistence: {
        modalClassCode: 12,
        label: "Cropland",
        modalYearCount: 3,
        modalFractionOfKnownYears: 0.75,
        isSingleClass: false,
      },
    });
    expect(summary.classTenure).toEqual([
      {
        classCode: 12,
        label: "Cropland",
        yearCount: 3,
        fractionOfKnownYears: 0.75,
        years: [2019, 2020, 2022],
      },
      {
        classCode: 10,
        label: "Grassland",
        yearCount: 1,
        fractionOfKnownYears: 0.25,
        years: [2021],
      },
    ]);
    expect(LAND_COVER_PERSISTENCE_SOURCE).toBe(LAND_COVER_SOURCE);
    expect(summary).not.toHaveProperty("meanClassCode");
    expect(JSON.stringify(summary)).not.toContain("mean");
  });

  it("flags a single unchanged class as single-class stability", () => {
    const summary = summarizeLandCoverPersistence([
      { year: 2001, classCode: 2 },
      { year: 2005, classCode: 2 },
      { year: 2010, classCode: 2 },
    ]);

    expect(summary.distinctKnownClassCount).toBe(1);
    expect(summary.persistence).toEqual({
      modalClassCode: 2,
      label: "Evergreen broadleaf forest",
      modalYearCount: 3,
      modalFractionOfKnownYears: 1,
      isSingleClass: true,
    });
    expect(summary.coverage.yearSpan).toEqual({
      firstYear: 2001,
      lastYear: 2010,
    });
  });

  it("breaks a tenure tie by lowest class code, deterministically", () => {
    const summary = summarizeLandCoverPersistence([
      { year: 2018, classCode: 10 },
      { year: 2019, classCode: 8 },
    ]);

    expect(summary.classTenure.map((entry) => entry.classCode)).toEqual([
      8, 10,
    ]);
    expect(summary.persistence?.modalClassCode).toBe(8);
    expect(summary.persistence?.isSingleClass).toBe(false);
  });

  it("keeps unclassified and no-data years out of class tenure", () => {
    const summary = summarizeLandCoverPersistence([
      { year: 2020, classCode: 12 },
      { year: 2021, classCode: 255 },
      { year: 2022, classCode: null },
    ]);

    expect(summary.coverage).toMatchObject({
      // A known class was seen, so status is "available"; the persistence
      // claim is still withheld below because one year is sparse.
      status: "available",
      observedYearCount: 2,
      knownLandCoverYearCount: 1,
      unclassifiedYearCount: 1,
      noDataYearCount: 1,
      isSparse: true,
      reason: null,
    });
    expect(summary.coverage.yearSpan).toEqual({
      firstYear: 2020,
      lastYear: 2022,
    });
    expect(summary.distinctKnownClassCount).toBe(1);
    // One known-class year is below the persistence floor: withhold the claim.
    expect(summary.persistence).toBeNull();
  });

  it("withholds persistence below the known-class-year threshold", () => {
    const summary = summarizeLandCoverPersistence([
      { year: 2020, classCode: 5 },
    ]);

    expect(MINIMUM_YEARS_FOR_PERSISTENCE).toBe(2);
    expect(summary.coverage.isSparse).toBe(true);
    expect(summary.classTenure).toHaveLength(1);
    expect(summary.persistence).toBeNull();
  });

  it("rejects duplicate years rather than merging them", () => {
    const summary = summarizeLandCoverPersistence([
      { year: 2020, classCode: 12 },
      { year: 2020, classCode: 10 },
      { year: 2021, classCode: 12 },
    ]);

    expect(summary.coverage.knownLandCoverYearCount).toBe(2);
    expect(summary.coverage.invalidRecordCount).toBe(1);
    expect(summary.persistence).toMatchObject({
      modalClassCode: 12,
      modalYearCount: 2,
      isSingleClass: true,
    });
  });

  it("rejects non-integer years and off-scheme class codes", () => {
    const summary = summarizeLandCoverPersistence([
      { year: 2020.5, classCode: 12 },
      { year: Number.NaN, classCode: 10 },
      { year: 2021, classCode: 99 },
      { year: 2022, classCode: 4.5 },
    ]);

    expect(summary.coverage.invalidRecordCount).toBe(4);
    expect(summary.coverage.observedYearCount).toBe(0);
    expect(summary.coverage.knownLandCoverYearCount).toBe(0);
    expect(summary.coverage.reason).toBe("no-years");
    expect(summary.persistence).toBeNull();
  });

  it("reports no-years for an empty series", () => {
    const summary = summarizeLandCoverPersistence([]);

    expect(summary.coverage).toMatchObject({
      status: "no-data",
      yearSpan: null,
      observedYearCount: 0,
      knownLandCoverYearCount: 0,
      invalidRecordCount: 0,
      isSparse: true,
      reason: "no-years",
    });
    expect(summary.distinctKnownClassCount).toBe(0);
    expect(summary.classTenure).toEqual([]);
    expect(summary.persistence).toBeNull();
  });

  it("reports no-known-land-cover when only unclassified years exist", () => {
    const summary = summarizeLandCoverPersistence([
      { year: 2020, classCode: 255 },
      { year: 2021, classCode: 255 },
    ]);

    expect(summary.coverage.status).toBe("no-data");
    expect(summary.coverage.unclassifiedYearCount).toBe(2);
    expect(summary.coverage.reason).toBe("no-known-land-cover");
    expect(summary.persistence).toBeNull();
  });
});
