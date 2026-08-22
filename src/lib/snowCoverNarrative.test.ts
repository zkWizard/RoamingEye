import { describe, expect, it } from "vitest";
import {
  describeSnowSeasonChange,
  summarizeSnowCover,
  type SnowCoverObservation,
} from "./snowCover";
import {
  describeSnowCoverObservation,
  describeSnowSeasonChangeNarrative,
  placeSnowCoverInsight,
} from "./snowCoverNarrative";
import type { YearMonth } from "./timeline";

const AVAILABLE_THROUGH = { year: 2026, month: 1 };

function observation(
  overrides: Partial<SnowCoverObservation> = {}
): SnowCoverObservation {
  return {
    dataMonth: { year: 2025, month: 1 },
    snowCoveredPercent: 72,
    validFraction: 0.9,
    ...overrides,
  };
}

describe("describeSnowCoverObservation", () => {
  it("describes a published, usable month with its extent and provenance", () => {
    const summary = summarizeSnowCover(observation(), AVAILABLE_THROUGH);
    const narrative = describeSnowCoverObservation(summary);

    expect(narrative.kind).toBe("snow-cover-observation-narrative");
    expect(narrative.isInterpretation).toBe(false);
    expect(narrative.headline).toBe("Extensive snow cover in 2025-01");
    expect(narrative.detail).toContain("72%");
    expect(narrative.detail).toContain("extensive snow cover");
    expect(narrative.detail).toContain("Usable area coverage was 90%");
    expect(narrative.provenance.dataMonth).toBe("2025-01");
    expect(narrative.provenance.availableThrough).toBe("2026-01");
    expect(narrative.provenance.publicationLagMonths).toBe(12);
    expect(narrative.provenance.validFraction).toBe(0.9);
    expect(narrative.provenance.sourceLabel).toContain("MOD10CM");
    expect(narrative.provenance.sourceUrl).toBe(
      `https://doi.org/${summary.dataset.doi}`
    );
    expect(narrative.provenance.sourceResolution).toContain("0.05°");
    expect(narrative.limitations).toBe(summary.limitations);
  });

  it("does not surface a number for a not-yet-published month", () => {
    const summary = summarizeSnowCover(
      observation({ dataMonth: { year: 2026, month: 6 } }),
      AVAILABLE_THROUGH
    );
    const narrative = describeSnowCoverObservation(summary);

    expect(narrative.headline).toBe(
      "Snow-cover record not published for 2026-06"
    );
    expect(narrative.detail).toContain("not yet published");
    expect(narrative.detail).not.toContain("%");
    expect(narrative.provenance.publicationStatus).toBe("not-yet-published");
    expect(narrative.provenance.publicationLagMonths).toBeNull();
  });

  it("names an undistributed month as a record gap, not a snow-free month", () => {
    const summary = summarizeSnowCover(
      observation({
        dataMonth: { year: 2016, month: 2 },
        snowCoveredPercent: null,
      }),
      AVAILABLE_THROUGH
    );
    const narrative = describeSnowCoverObservation(summary);

    expect(narrative.headline).toBe(
      "Snow-cover imagery not distributed for 2016-02"
    );
    expect(narrative.detail).toContain("does not distribute 2016-02");
    expect(narrative.detail).toContain("not an observation");
    // The wording a reader would otherwise credit to cloud or the quality
    // screen must not appear for a month nobody imaged.
    expect(narrative.detail).not.toContain("No usable monthly-average value");
    expect(narrative.detail).not.toContain("%");
    expect(narrative.provenance.publicationStatus).toBe("not-distributed");
    expect(narrative.provenance.publicationLagMonths).toBeNull();
  });

  it("reports a published month with no usable value honestly", () => {
    const summary = summarizeSnowCover(
      observation({ snowCoveredPercent: null, validFraction: 0 }),
      AVAILABLE_THROUGH
    );
    const narrative = describeSnowCoverObservation(summary);

    expect(narrative.headline).toBe("No usable snow-cover value for 2025-01");
    expect(narrative.detail).toContain("No usable monthly-average value");
    expect(narrative.provenance.publicationStatus).toBe("published");
  });

  it("rounds the covered-area percentage to one decimal", () => {
    const summary = summarizeSnowCover(
      observation({ snowCoveredPercent: 33.333 }),
      AVAILABLE_THROUGH
    );
    const narrative = describeSnowCoverObservation(summary);
    expect(narrative.detail).toContain("33.3%");
  });
});

describe("describeSnowSeasonChangeNarrative", () => {
  it("describes an advancing season with a signed magnitude", () => {
    const change = describeSnowSeasonChange(
      observation({
        dataMonth: { year: 2025, month: 1 },
        snowCoveredPercent: 40,
      }),
      observation({
        dataMonth: { year: 2025, month: 2 },
        snowCoveredPercent: 70,
      }),
      AVAILABLE_THROUGH
    );
    const narrative = describeSnowSeasonChangeNarrative(change);

    expect(narrative.headline).toBe("Snow cover advanced (2025-01 → 2025-02)");
    expect(narrative.detail).toContain("advanced by 30 percentage points");
    expect(narrative.detail).toContain("not depth");
    expect(narrative.earlier.provenance.dataMonth).toBe("2025-01");
    expect(narrative.later.provenance.dataMonth).toBe("2025-02");
    expect(narrative.limitations).toBe(change.limitations);
  });

  it("names the reporting band for a little-change season", () => {
    const change = describeSnowSeasonChange(
      observation({
        dataMonth: { year: 2025, month: 1 },
        snowCoveredPercent: 60,
      }),
      observation({
        dataMonth: { year: 2025, month: 2 },
        snowCoveredPercent: 62,
      }),
      AVAILABLE_THROUGH
    );
    const narrative = describeSnowSeasonChangeNarrative(change);

    expect(narrative.headline).toContain("showed little change");
    expect(narrative.detail).toContain("less than the 5 percentage points");
    expect(narrative.detail).toContain("+2 pp");
  });

  it("reports non-consecutive months as unavailable without a number", () => {
    const change = describeSnowSeasonChange(
      observation({
        dataMonth: { year: 2025, month: 1 },
        snowCoveredPercent: 40,
      }),
      observation({
        dataMonth: { year: 2025, month: 4 },
        snowCoveredPercent: 70,
      }),
      AVAILABLE_THROUGH
    );
    const narrative = describeSnowSeasonChangeNarrative(change);

    expect(narrative.headline).toBe(
      "Month-over-month snow-cover change unavailable"
    );
    expect(narrative.detail).toContain("not exactly one calendar month apart");
    expect(narrative.detail).not.toContain("percentage points.");
  });

  it("reports a retreating season", () => {
    const change = describeSnowSeasonChange(
      observation({
        dataMonth: { year: 2025, month: 2 },
        snowCoveredPercent: 80,
      }),
      observation({
        dataMonth: { year: 2025, month: 3 },
        snowCoveredPercent: 55,
      }),
      AVAILABLE_THROUGH
    );
    const narrative = describeSnowSeasonChangeNarrative(change);

    expect(narrative.headline).toContain("retreated");
    expect(narrative.detail).toContain("retreated by 25 percentage points");
  });
});

describe("placeSnowCoverInsight", () => {
  const months: [YearMonth, YearMonth] = [
    { year: 2025, month: 2 },
    { year: 2025, month: 3 },
  ];

  it("reports the later month's covered area and the month-over-month move", () => {
    const insight = placeSnowCoverInsight(months, [80, 55], months[1], {
      validFractions: [0.9, 0.85],
      sourceImageDimensions: { width: 512, height: 256 },
    });

    expect(insight.value).toBe("55%");
    expect(insight.detail).toContain("retreated by 25 percentage points");
    expect(insight.detail).toContain("rendered source image 512 x 256 px");
    expect(insight.detail).toContain("MOD10CM");
  });

  it("always states that snow-free ground is undrawn and excluded", () => {
    const insight = placeSnowCoverInsight(months, [40, 45], months[1]);

    // The number reads like a share of the place; without this it would be
    // taken for one.
    expect(insight.detail).toContain("GIBS draws no colour for 0% snow");
    expect(insight.detail).toContain("not the snow-covered share of the place");
  });

  it("withholds a value when the later month has no usable observation", () => {
    const insight = placeSnowCoverInsight(months, [80, null], months[1]);

    expect(insight.value).toBe("Unavailable");
    expect(insight.detail).toContain("No usable monthly-average value");
    // The caveat still has to travel with the card.
    expect(insight.detail).toContain("GIBS draws no colour for 0% snow");
  });

  it("rejects an out-of-range percentage as a decode failure, not a reading", () => {
    // A covered-area percentage is bounded by its own definition; 128 is a
    // scaling error, and clamping it to 100 would publish it as total cover.
    const insight = placeSnowCoverInsight(months, [80, 128], months[1]);

    expect(insight.value).toBe("Unavailable");
    expect(insight.detail).not.toContain("128");
  });

  it("does not report a trend across non-adjacent months", () => {
    const gapped: [YearMonth, YearMonth] = [
      { year: 2025, month: 1 },
      { year: 2025, month: 5 },
    ];
    const insight = placeSnowCoverInsight(gapped, [80, 55], gapped[1]);

    expect(insight.value).toBe("55%");
    expect(insight.detail).toContain("not exactly one calendar month apart");
    expect(insight.detail).not.toContain("retreated by");
  });

  it("carries sampled coverage through to the rendered detail", () => {
    const insight = placeSnowCoverInsight(months, [80, 55], months[1], {
      validFractions: [0.9, 0.4],
    });

    expect(insight.detail).toContain("40%");
    expect(insight.detail).toContain(
      "rendered source image dimensions not supplied"
    );
  });

  it("keeps the plain coverage sentence when both months were drawn alike", () => {
    const insight = placeSnowCoverInsight(months, [80, 55], months[1], {
      validFractions: [0.9, 0.88],
    });

    expect(insight.detail).toContain("Usable area coverage was 88%.");
    expect(insight.detail).not.toContain("different drawn area");
  });

  it("qualifies the change when the two months cover different drawn areas", () => {
    // Percent 0 is transparent, so each month's mean is taken over whatever was
    // drawn that month. Subtracting means over a 90% and a 20% footprint is not
    // a comparison of the same ground, and the panel showed only the later
    // month's coverage, so the mismatch was invisible.
    const insight = placeSnowCoverInsight(months, [80, 55], months[1], {
      validFractions: [0.9, 0.2],
    });

    expect(insight.detail).toContain("Usable area coverage was 20% in 2025-03");
    expect(insight.detail).toContain("against 90% in 2025-02");
    expect(insight.detail).toContain(
      "each month's mean covers a different drawn area"
    );
    expect(insight.detail).toContain("not a like-for-like comparison");
  });

  it("qualifies a collapsed footprint that renders as snow advancing", () => {
    // The failure this guards: cover retreats to a few patches, the mean over
    // the little still drawn rises, and the card reads "advanced".
    const insight = placeSnowCoverInsight(months, [40, 75], months[1], {
      validFractions: [0.95, 0.05],
    });

    expect(insight.detail).toContain("advanced by 35 percentage points");
    expect(insight.detail).toContain("different drawn area");
  });

  it("stays silent when either month's footprint is unknown", () => {
    // Nothing can be said about a gap that was never measured.
    const insight = placeSnowCoverInsight(months, [80, 55], months[1], {
      validFractions: [null, 0.2],
    });

    expect(insight.detail).not.toContain("different drawn area");
  });

  it("does not qualify a change it never stated", () => {
    // Non-adjacent months report no movement, so there is no comparison to
    // caveat even though the footprints differ wildly.
    const gapped: [YearMonth, YearMonth] = [
      { year: 2025, month: 1 },
      { year: 2025, month: 5 },
    ];
    const insight = placeSnowCoverInsight(gapped, [80, 55], gapped[1], {
      validFractions: [0.95, 0.1],
    });

    expect(insight.detail).toContain("not exactly one calendar month apart");
    expect(insight.detail).not.toContain("different drawn area");
  });

  it("fires at the reporting band, matching the change threshold", () => {
    // The band is reused from SNOW_SEASON_CHANGE_THRESHOLD_PP rather than
    // invented, so it is pinned here in both directions.
    const at = placeSnowCoverInsight(months, [80, 55], months[1], {
      validFractions: [0.9, 0.85],
    });
    const below = placeSnowCoverInsight(months, [80, 55], months[1], {
      validFractions: [0.9, 0.851],
    });

    expect(at.detail).toContain("different drawn area");
    expect(below.detail).toContain("Usable area coverage was 85.1%.");
    expect(below.detail).not.toContain("different drawn area");
  });

  it("does not round a nearly whole footprint up to the whole place", () => {
    // The share is cos(latitude)-weighted over up to 784 cells, not a count of
    // them, so an undrawn poleward sliver of a high-latitude place lands well
    // inside the last rounding step. Printing 100% there tells the reader there
    // is no undrawn share, which the caveat in the same detail denies.
    const insight = placeSnowCoverInsight(months, [80, 55], months[1], {
      validFractions: [0.9996, 0.9996],
    });

    expect(insight.detail).toContain("Usable area coverage was >99.9%.");
    expect(insight.detail).not.toContain("Usable area coverage was 100%");
  });

  it("still says 100% for a footprint that really was drawn whole", () => {
    const insight = placeSnowCoverInsight(months, [80, 55], months[1], {
      validFractions: [1, 1],
    });

    expect(insight.detail).toContain("Usable area coverage was 100%.");
  });

  it("does not round a sliver of usable coverage down to none", () => {
    // `coverageFor` already separates these two states — a withheld mean over a
    // drawn sliver is `missing-value`, an undrawn place is `zero-coverage` —
    // and the export contract turns the same split into
    // `insufficient-valid-coverage` against `source-no-data`. Rounding the
    // share to 0% erases it, and lands next to "no usable value was reported".
    const insight = placeSnowCoverInsight(months, [80, null], months[1], {
      validFractions: [0.9, 0.0004],
    });

    expect(insight.value).toBe("Unavailable");
    expect(insight.detail).toContain("Usable area coverage was <0.1%");
    expect(insight.detail).not.toContain("Usable area coverage was 0%");
  });

  it("still says 0% when the source drew nothing over the place", () => {
    const insight = placeSnowCoverInsight(months, [80, null], months[1], {
      validFractions: [0.9, 0],
    });

    expect(insight.detail).toContain(
      "Usable area coverage was 0%; no usable value was reported."
    );
  });

  it("carries the guard into the mismatch sentence's earlier end", () => {
    const insight = placeSnowCoverInsight(months, [80, 55], months[1], {
      validFractions: [0.99998, 0.2],
    });

    expect(insight.detail).toContain("Usable area coverage was 20% in 2025-03");
    expect(insight.detail).toContain("against >99.9% in 2025-02");
  });
});
