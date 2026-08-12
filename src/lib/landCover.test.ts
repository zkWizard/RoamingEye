import { describe, expect, it } from "vitest";
import {
  IGBP_LAND_COVER_CLASSES,
  IGBP_SOURCE_VALUE_ALIASES,
  IGBP_WATER_CLASS_CODE,
  LAND_COVER_FORMATIONS,
  LAND_COVER_SOURCE,
  resolveIgbpSourceValue,
  summarizeLandCoverContext,
  summarizeLandCoverFormations,
} from "./landCover";

describe("land-cover context summaries", () => {
  it("counts IGBP classes and retains MCD12Q1 provenance without averaging codes", () => {
    const summary = summarizeLandCoverContext(
      [
        { classCode: 12, sampleCount: 4 },
        { classCode: 13, sampleCount: 2 },
        { classCode: 17, sampleCount: 1 },
        { classCode: null, sampleCount: 2 },
        { classCode: 99, sampleCount: 1 },
      ],
      2024
    );

    expect(summary).toMatchObject({
      kind: "observed-class-coded-land-cover",
      isForecast: false,
      observationStatus: "available",
      unavailableReason: null,
      provenance: {
        layerId: "landcover",
        wmsLayer: "MODIS_Combined_L3_IGBP_Land_Cover_Type_Annual",
        dataYear: 2024,
        cadence: "annual",
        classScheme: "IGBP",
        nativeValue: "IGBP LC_Type1 class code",
        nativeUnit: "categorical",
        sourceResolution: "500 m",
        geographicCoverage: "selected-boundary samples",
        source: LAND_COVER_SOURCE,
        publicationStatus: "published",
      },
      coverage: {
        status: "available",
        totalSampleCount: 10,
        knownLandCoverSampleCount: 7,
        noDataSampleCount: 2,
        invalidClassSampleCount: 1,
        invalidRecordCount: 1,
        knownLandCoverFraction: 0.7,
        reason: null,
      },
      mostFrequentClassStatus: "unique",
      mostFrequentClasses: [
        {
          classCode: 12,
          label: "Cropland",
          sampleCount: 4,
        },
      ],
      dominantClass: {
        classCode: 12,
        label: "Cropland",
        sampleCount: 4,
        fractionOfAllSamples: 0.4,
        fractionOfSourceClassSamples: 4 / 7,
      },
    });
    expect(summary.classCoverage.map((entry) => entry.classCode)).toEqual([
      12, 13, 17,
    ]);
    expect(summary).not.toHaveProperty("meanClassCode");
    expect(JSON.stringify(summary)).not.toContain("mean");
  });

  it("keeps categorical units and sampled geography in the reusable source contract", () => {
    const summary = summarizeLandCoverContext([{ classCode: 10 }], 2024);

    expect(summary.provenance).toMatchObject({
      nativeValue: "IGBP LC_Type1 class code",
      nativeUnit: "categorical",
      geographicCoverage: "selected-boundary samples",
    });
    expect(summary.provenance.nativeUnit).not.toBe("percent");
  });

  it("keeps source unclassified pixels separate from no-data and informative classes", () => {
    const summary = summarizeLandCoverContext(
      [
        { classCode: 255, sampleCount: 3 },
        { classCode: null, sampleCount: 2 },
      ],
      2024
    );

    expect(summary.coverage).toMatchObject({
      status: "no-data",
      totalSampleCount: 5,
      knownLandCoverSampleCount: 0,
      unclassifiedSampleCount: 3,
      noDataSampleCount: 2,
      knownLandCoverFraction: 0,
      reason: "no-known-land-cover",
    });
    expect(summary.classCoverage).toEqual([
      {
        classCode: 255,
        label: "Unclassified",
        sampleCount: 3,
        fractionOfAllSamples: 3 / 5,
        fractionOfSourceClassSamples: 1,
        isInformativeLandCover: false,
      },
    ]);
    expect(summary.dominantClass).toBeNull();
    expect(summary.mostFrequentClassStatus).toBe("no-data");
    expect(summary.mostFrequentClasses).toEqual([]);
  });

  it("withholds samples for an invalid annual record", () => {
    const summary = summarizeLandCoverContext(
      [{ classCode: 12, sampleCount: 4 }],
      2024.5
    );

    expect(summary.provenance.publicationStatus).toBe("invalid-year");
    expect(summary.observationStatus).toBe("unavailable");
    expect(summary.unavailableReason).toBe("invalid-year");
    expect(summary.coverage).toEqual({
      status: "unavailable",
      totalSampleCount: 0,
      knownLandCoverSampleCount: 0,
      unclassifiedSampleCount: 0,
      noDataSampleCount: 0,
      invalidClassSampleCount: 0,
      aliasedSourceValueSampleCount: 0,
      invalidRecordCount: 0,
      knownLandCoverFraction: null,
      reason: "record-not-published",
    });
    expect(summary.classCoverage).toEqual([]);
    expect(summary.dominantClass).toBeNull();
  });

  it("withholds samples outside the published annual layer range", () => {
    const summary = summarizeLandCoverContext(
      [{ classCode: 12, sampleCount: 4 }],
      2025
    );

    expect(summary.provenance).toMatchObject({
      dataYear: 2025,
      publicationStatus: "outside-layer-range",
      source: LAND_COVER_SOURCE,
    });
    expect(summary.coverage).toMatchObject({
      status: "unavailable",
      totalSampleCount: 0,
      knownLandCoverSampleCount: 0,
      reason: "record-not-published",
    });
    expect(summary.classCoverage).toEqual([]);
    expect(summary.dominantClass).toBeNull();
    expect(summary.mostFrequentClassStatus).toBe("no-data");
    expect(summary.mostFrequentClasses).toEqual([]);
  });

  it("distinguishes unpublished years from sampled no-data", () => {
    const unpublished = summarizeLandCoverContext([{ classCode: 12 }], 2025);
    const noData = summarizeLandCoverContext([{ classCode: 255 }], 2024);

    expect(unpublished.observationStatus).toBe("unavailable");
    expect(unpublished.unavailableReason).toBe("outside-layer-range");
    expect(unpublished.coverage.status).toBe("unavailable");
    expect(unpublished.coverage.reason).toBe("record-not-published");
    expect(noData.observationStatus).toBe("unavailable");
    expect(noData.unavailableReason).toBe("no-known-land-cover");
    expect(noData.provenance.publicationStatus).toBe("published");
  });

  it("rejects unsafe sample weights instead of rounding native counts", () => {
    const summary = summarizeLandCoverContext(
      [
        { classCode: 12, sampleCount: Number.MAX_SAFE_INTEGER + 1 },
        { classCode: 13, sampleCount: 2.5 },
      ],
      2024
    );

    expect(summary.coverage).toEqual({
      status: "no-data",
      totalSampleCount: 0,
      knownLandCoverSampleCount: 0,
      unclassifiedSampleCount: 0,
      noDataSampleCount: 0,
      invalidClassSampleCount: 0,
      aliasedSourceValueSampleCount: 0,
      invalidRecordCount: 2,
      knownLandCoverFraction: null,
      reason: "no-samples",
    });
    expect(summary.classCoverage).toEqual([]);
    expect(summary.dominantClass).toBeNull();
  });

  it("rejects a record that would overflow the cumulative exact count", () => {
    const summary = summarizeLandCoverContext(
      [
        { classCode: 12, sampleCount: Number.MAX_SAFE_INTEGER },
        { classCode: 13, sampleCount: 1 },
      ],
      2024
    );

    expect(summary.coverage).toMatchObject({
      status: "available",
      totalSampleCount: Number.MAX_SAFE_INTEGER,
      knownLandCoverSampleCount: Number.MAX_SAFE_INTEGER,
      invalidRecordCount: 1,
      knownLandCoverFraction: 1,
      reason: null,
    });
    expect(summary.classCoverage).toEqual([
      {
        classCode: 12,
        label: "Cropland",
        sampleCount: Number.MAX_SAFE_INTEGER,
        fractionOfAllSamples: 1,
        fractionOfSourceClassSamples: 1,
        isInformativeLandCover: true,
      },
    ]);
    expect(summary.dominantClass?.classCode).toBe(12);
  });

  it("exposes the complete IGBP contract including unclassified source pixels", () => {
    expect(IGBP_LAND_COVER_CLASSES).toHaveLength(18);
    expect(IGBP_LAND_COVER_CLASSES.map((entry) => entry.code)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 255,
    ]);
  });

  it("resolves the aliased water source value GIBS renders as class 17", () => {
    // The land-cover layer's colormap carries exactly one multi-valued entry:
    // <ColorMapEntry rgb="134,202,227" sourceValue="0,17" .../> "Water Bodies".
    expect(IGBP_SOURCE_VALUE_ALIASES).toEqual({ 0: IGBP_WATER_CLASS_CODE });
    expect(IGBP_WATER_CLASS_CODE).toBe(17);
    expect(resolveIgbpSourceValue(0)).toEqual({
      status: "class",
      classCode: 17,
      aliased: true,
    });
    expect(resolveIgbpSourceValue(17)).toEqual({
      status: "class",
      classCode: 17,
      aliased: false,
    });
    // Nothing outside the published contract is snapped to a nearby code.
    expect(resolveIgbpSourceValue(18)).toEqual({ status: "outside-contract" });
    expect(resolveIgbpSourceValue(-1)).toEqual({ status: "outside-contract" });
    expect(resolveIgbpSourceValue(17.5)).toEqual({
      status: "outside-contract",
    });
  });

  it("counts legacy-coded water as water rather than a contract violation", () => {
    const summary = summarizeLandCoverContext(
      [
        { classCode: 0, sampleCount: 6 },
        { classCode: 17, sampleCount: 2 },
        { classCode: 12, sampleCount: 2 },
      ],
      2024
    );

    expect(summary.coverage).toMatchObject({
      status: "available",
      totalSampleCount: 10,
      knownLandCoverSampleCount: 10,
      invalidClassSampleCount: 0,
      invalidRecordCount: 0,
      aliasedSourceValueSampleCount: 6,
      knownLandCoverFraction: 1,
    });
    // Folded onto the class GIBS renders it as — one water row, not two, and
    // no invented 18th class.
    expect(
      summary.classCoverage.map((entry) => [entry.classCode, entry.sampleCount])
    ).toEqual([
      [17, 8],
      [12, 2],
    ]);
    expect(summary.dominantClass?.classCode).toBe(17);
    expect(
      summarizeLandCoverFormations(summary).formationCoverage.map((entry) => [
        entry.id,
        entry.sampleCount,
      ])
    ).toEqual([
      ["water", 8],
      ["cropland", 2],
    ]);
  });

  it("reports no aliased samples when every code is already the rendered one", () => {
    const summary = summarizeLandCoverContext(
      [{ classCode: 17, sampleCount: 3 }, { classCode: 255 }],
      2024
    );

    expect(summary.coverage.aliasedSourceValueSampleCount).toBe(0);
  });

  it("preserves tied most-frequent classes instead of inventing a dominant class", () => {
    const summary = summarizeLandCoverContext(
      [
        { classCode: 12, sampleCount: 3 },
        { classCode: 4, sampleCount: 3 },
        { classCode: 10, sampleCount: 1 },
      ],
      2024
    );

    expect(summary.mostFrequentClassStatus).toBe("tied");
    expect(
      summary.mostFrequentClasses.map((entry) => ({
        classCode: entry.classCode,
        sampleCount: entry.sampleCount,
      }))
    ).toEqual([
      { classCode: 4, sampleCount: 3 },
      { classCode: 12, sampleCount: 3 },
    ]);
    expect(summary.dominantClass).toBeNull();
  });
});

describe("land-cover formation groups", () => {
  it("maps every informative IGBP class into exactly one formation", () => {
    const grouped = LAND_COVER_FORMATIONS.flatMap(
      (formation) => formation.classCodes
    );
    const informativeCodes = IGBP_LAND_COVER_CLASSES.filter(
      (entry) => entry.isInformativeLandCover
    ).map((entry) => entry.code);

    expect([...grouped].sort((a, b) => a - b)).toEqual(informativeCodes);
    expect(new Set(grouped).size).toBe(grouped.length);
  });

  it("sums whole class counts into formations and retains MCD12Q1 provenance", () => {
    const context = summarizeLandCoverContext(
      [
        { classCode: 1, sampleCount: 3 },
        { classCode: 5, sampleCount: 2 },
        { classCode: 12, sampleCount: 4 },
        { classCode: 14, sampleCount: 1 },
        { classCode: 255, sampleCount: 2 },
        { classCode: null, sampleCount: 1 },
      ],
      2024
    );

    const formations = summarizeLandCoverFormations(context);

    expect(formations.kind).toBe("observed-land-cover-formation-groups");
    expect(formations.isForecast).toBe(false);
    expect(formations.observationStatus).toBe("available");
    expect(formations.unavailableReason).toBeNull();
    expect(formations.provenance).toBe(context.provenance);
    expect(formations.provenance.source).toBe(LAND_COVER_SOURCE);
    expect(formations.ungroupedKnownSampleCount).toBe(0);

    // Cropland (12 + 14 = 5) ties forest (1 + 5 = 5). The lower first class
    // code wins the deterministic *display* sort, so forest lists first — but
    // that ordering must not be read as a dominant formation.
    expect(formations.formationCoverage).toEqual([
      {
        id: "forest",
        label: "Forest",
        classCodes: [1, 2, 3, 4, 5],
        sampleCount: 5,
        fractionOfAllSamples: 5 / 13,
        fractionOfKnownLandCover: 0.5,
      },
      {
        id: "cropland",
        label: "Cropland",
        classCodes: [12, 14],
        sampleCount: 5,
        fractionOfAllSamples: 5 / 13,
        fractionOfKnownLandCover: 0.5,
      },
    ]);
    expect(formations.mostFrequentFormationStatus).toBe("tied");
    expect(formations.mostFrequentFormations.map((entry) => entry.id)).toEqual([
      "forest",
      "cropland",
    ]);
    expect(formations.dominantFormation).toBeNull();

    // Grouping must not average categorical class identifiers.
    expect(JSON.stringify(formations)).not.toContain("mean");
    expect(formations).not.toHaveProperty("meanClassCode");
  });

  it("names a dominant formation only when its sample count is unique", () => {
    const context = summarizeLandCoverContext(
      [
        { classCode: 1, sampleCount: 3 },
        { classCode: 5, sampleCount: 3 },
        { classCode: 12, sampleCount: 4 },
        { classCode: 14, sampleCount: 1 },
      ],
      2024
    );

    const formations = summarizeLandCoverFormations(context);

    // Forest (1 + 5 = 6) now outright exceeds cropland (12 + 14 = 5).
    expect(formations.mostFrequentFormationStatus).toBe("unique");
    expect(formations.mostFrequentFormations.map((entry) => entry.id)).toEqual([
      "forest",
    ]);
    expect(formations.dominantFormation?.id).toBe("forest");
    expect(formations.dominantFormation?.sampleCount).toBe(6);
  });

  it("withholds a dominant formation when whole-class groups tie across formations", () => {
    // A tie invisible at class level: no single class ties, but grassland (10)
    // and cropland (12 + 14) both total 6 once whole classes are summed.
    const context = summarizeLandCoverContext(
      [
        { classCode: 10, sampleCount: 6 },
        { classCode: 12, sampleCount: 4 },
        { classCode: 14, sampleCount: 2 },
      ],
      2024
    );

    const formations = summarizeLandCoverFormations(context);

    expect(context.mostFrequentClassStatus).toBe("unique");
    expect(context.dominantClass?.classCode).toBe(10);
    expect(formations.mostFrequentFormationStatus).toBe("tied");
    expect(formations.mostFrequentFormations.map((entry) => entry.id)).toEqual([
      "grassland",
      "cropland",
    ]);
    expect(formations.dominantFormation).toBeNull();
  });

  it("excludes unclassified and no-data samples from any formation", () => {
    const context = summarizeLandCoverContext(
      [
        { classCode: 255, sampleCount: 3 },
        { classCode: null, sampleCount: 2 },
      ],
      2024
    );

    const formations = summarizeLandCoverFormations(context);

    expect(formations.formationCoverage).toEqual([]);
    expect(formations.dominantFormation).toBeNull();
    expect(formations.ungroupedKnownSampleCount).toBe(0);
  });

  it("withholds formation claims when the annual source year is unavailable", () => {
    const context = summarizeLandCoverContext(
      [
        { classCode: 1, sampleCount: 3 },
        { classCode: 12, sampleCount: 2 },
      ],
      2025
    );

    const formations = summarizeLandCoverFormations(context);

    expect(context.coverage.status).toBe("unavailable");
    expect(formations).toMatchObject({
      observationStatus: "unavailable",
      unavailableReason: "outside-layer-range",
      provenance: {
        dataYear: 2025,
        nativeUnit: "categorical",
        geographicCoverage: "selected-boundary samples",
        publicationStatus: "outside-layer-range",
        source: LAND_COVER_SOURCE,
      },
      formationCoverage: [],
      dominantFormation: null,
      ungroupedKnownSampleCount: 0,
    });
    expect(formations.provenance).toBe(context.provenance);
  });
});
