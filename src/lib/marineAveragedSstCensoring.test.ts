import { describe, expect, it } from "vitest";
import {
  averagedSstCensoringNote,
  marineAveragedSstCensoringCsvHeaders,
  marineBoundaryMeanSstCensoringNote,
  marineBoundaryMeanSstDifferenceCensoringNote,
  summarizeMarineAveragedSstCensoring,
} from "./marineAveragedSstCensoring";
import { probeSstExtremeCensoring } from "./probeSstExtremeCensoring";
import { summarizeSstRampCensoring } from "./sstRampCensoring";
import { LAYER_ORDER } from "./timeline";

/** Decoded values the sibling censoring modules use as fixtures. */
const FLOOR = 0.075;
const CEILING = 31.9;
const INTERIOR = 18.4;

const uncensored = probeSstExtremeCensoring("sst", [INTERIOR, 19.1, 17.6]);
const floorCensored = probeSstExtremeCensoring("sst", [FLOOR, INTERIOR]);
const bothCensored = probeSstExtremeCensoring("sst", [FLOOR, CEILING]);

describe("summarizeMarineAveragedSstCensoring", () => {
  it("never claims a bound or detectability, applicable or not", () => {
    for (const summary of [
      summarizeMarineAveragedSstCensoring("drawn-region", uncensored),
      summarizeMarineAveragedSstCensoring(null, uncensored),
    ]) {
      expect(summary.pixelCensoringDetectable).toBe(false);
      expect(summary.boundDirectionClaimable).toBe(false);
      expect(summary.marineBiologyObservation).toBe(false);
      expect(summary.isForecast).toBe(false);
    }
  });

  it("is inapplicable for a point probe even on a censored SST series", () => {
    const summary = summarizeMarineAveragedSstCensoring(null, bothCensored);
    expect(summary.applicable).toBe(false);
    expect(summary.combination).toBeNull();
    expect(summary.markedMonthCount).toBe(0);
  });

  it("counts the months the end-cap screen marked", () => {
    expect(
      summarizeMarineAveragedSstCensoring("sampled-area", bothCensored)
        .markedMonthCount
    ).toBe(2);
    expect(
      summarizeMarineAveragedSstCensoring("sampled-area", uncensored)
        .markedMonthCount
    ).toBe(0);
  });

  it("names the combination only when it applies", () => {
    expect(
      summarizeMarineAveragedSstCensoring("drawn-region", uncensored)
        .combination
    ).toBe("area-weighted-mean-of-per-pixel-decodes");
  });
});

describe("averagedSstCensoringNote", () => {
  it("stays silent for a point probe", () => {
    expect(averagedSstCensoringNote(null, uncensored)).toBeNull();
    expect(averagedSstCensoringNote(undefined, bothCensored)).toBeNull();
  });

  it("stays silent for every layer but SST", () => {
    for (const id of LAYER_ORDER) {
      if (id === "sst") continue;
      const censoring = probeSstExtremeCensoring(id, [INTERIOR, CEILING]);
      expect(averagedSstCensoringNote("drawn-region", censoring)).toBeNull();
      expect(averagedSstCensoringNote("sampled-area", censoring)).toBeNull();
    }
  });

  it("stays silent when the footprint returned no usable value", () => {
    const empty = probeSstExtremeCensoring("sst", [null, null]);
    expect(averagedSstCensoringNote("drawn-region", empty)).toBeNull();
  });

  it("qualifies an unmarked averaged series and cites the colormap", () => {
    const note = averagedSstCensoringNote("drawn-region", uncensored) ?? "";
    expect(note).toContain("drawn region");
    expect(note).toContain("weighted mean of per-pixel decodes");
    // The whole point: silence is not evidence of an uncensored footprint.
    expect(note).toContain("not evidence");
    expect(note).toContain(uncensored.ramp.colormapDoc);
  });

  it("extends the marks to the unmarked months when some were flagged", () => {
    const note = averagedSstCensoringNote("sampled-area", floorCensored) ?? "";
    expect(note).toContain("sampled area");
    expect(note).toContain("unmarked months are not established as uncensored");
  });

  it("claims no direction or magnitude in either wording", () => {
    for (const censoring of [uncensored, floorCensored, bothCensored]) {
      const note = averagedSstCensoringNote("drawn-region", censoring) ?? "";
      expect(note).not.toMatch(/warmer|colder|≤|≥|upper bound|lower bound/);
    }
  });

  it("names the footprint the caller supplied", () => {
    expect(averagedSstCensoringNote("sampled-area", uncensored)).toContain(
      "sampled area"
    );
    expect(averagedSstCensoringNote("drawn-region", uncensored)).toContain(
      "drawn region"
    );
  });
});

describe("marineAveragedSstCensoringCsvHeaders", () => {
  it("writes nothing for a point probe, so those files stay byte-identical", () => {
    expect(marineAveragedSstCensoringCsvHeaders(null, bothCensored)).toEqual(
      []
    );
    expect(marineAveragedSstCensoringCsvHeaders(undefined, uncensored)).toEqual(
      []
    );
  });

  it("writes nothing for every layer but SST", () => {
    for (const id of LAYER_ORDER) {
      if (id === "sst") continue;
      const censoring = probeSstExtremeCensoring(id, [INTERIOR, FLOOR]);
      expect(
        marineAveragedSstCensoringCsvHeaders("drawn-region", censoring)
      ).toEqual([]);
    }
  });

  it("writes nothing when the footprint returned no usable value", () => {
    const empty = probeSstExtremeCensoring("sst", [null, null]);
    expect(marineAveragedSstCensoringCsvHeaders("sampled-area", empty)).toEqual(
      []
    );
  });

  it("speaks for an averaged series the end-cap block left unflagged", () => {
    const [scope, detection] = marineAveragedSstCensoringCsvHeaders(
      "sampled-area",
      uncensored
    );
    // The case the export otherwise ships with no mention of censoring at all.
    expect(scope).toContain("# sst_ramp_censoring_averaged:");
    expect(scope).toContain("sampled area");
    expect(scope).toContain("not evidence");
    expect(scope).toContain(uncensored.ramp.colormapDoc);
    expect(detection).toContain("# sst_ramp_censoring_averaged_detection:");
  });

  it("corrects the bin rule instead when some rows were flagged", () => {
    const [scope] = marineAveragedSstCensoringCsvHeaders(
      "drawn-region",
      floorCensored
    );
    expect(scope).toContain("drawn region");
    expect(scope).toContain("not established as uncensored");
    // No silence to explain once the block above is present.
    expect(scope).not.toContain("not evidence");
  });

  it("keeps every header line free of CSV delimiters and breaks", () => {
    for (const footprint of ["sampled-area", "drawn-region"] as const) {
      for (const censoring of [uncensored, floorCensored, bothCensored]) {
        for (const line of marineAveragedSstCensoringCsvHeaders(
          footprint,
          censoring
        )) {
          expect(line.startsWith("# ")).toBe(true);
          expect(line).not.toMatch(/[,"\r\n]/);
        }
      }
    }
  });

  it("claims no presence direction or magnitude in either wording", () => {
    for (const censoring of [uncensored, floorCensored, bothCensored]) {
      for (const line of marineAveragedSstCensoringCsvHeaders(
        "drawn-region",
        censoring
      )) {
        expect(line).not.toMatch(/warmer|colder|≤|≥|upper bound|lower bound/);
      }
    }
  });
});

describe("marineBoundaryMeanSstCensoringNote", () => {
  it("qualifies an unmarked boundary mean as blind rather than uncensored", () => {
    const note = marineBoundaryMeanSstCensoringNote(
      summarizeSstRampCensoring(INTERIOR)
    );
    expect(note).toContain("area-weighted mean of per-pixel decodes");
    expect(note).toContain("not evidence the boundary held no censored pixel");
    // The colormap it is a statement about is named, as on every other surface.
    expect(note).toContain("colormap");
  });

  it("corrects a marked boundary mean's bound instead of explaining a silence", () => {
    for (const value of [FLOOR, CEILING]) {
      const note = marineBoundaryMeanSstCensoringNote(
        summarizeSstRampCensoring(value)
      );
      expect(note).toContain("screens the boundary mean and not the pixels");
      expect(note).toContain("not established as uncensored");
      // No silence to explain once a bound is printed beside it.
      expect(note).not.toContain("not evidence");
    }
  });

  it("says nothing without a value or outside the published ramp", () => {
    // A value this ramp cannot have produced carries no statement about its
    // caps, so it gets no clause rather than a misapplied one.
    for (const censoring of [
      null,
      undefined,
      summarizeSstRampCensoring(null),
      summarizeSstRampCensoring(Number.NaN),
      summarizeSstRampCensoring(-4),
      summarizeSstRampCensoring(41),
    ]) {
      expect(marineBoundaryMeanSstCensoringNote(censoring)).toBeNull();
    }
  });

  it("claims no presence direction or magnitude in either wording", () => {
    for (const value of [FLOOR, INTERIOR, CEILING]) {
      const note = marineBoundaryMeanSstCensoringNote(
        summarizeSstRampCensoring(value)
      );
      expect(note).not.toMatch(/warmer|colder|≤|≥/);
      expect(note).not.toMatch(/marine|biolog|ecosystem|habitat|sea-ice/i);
    }
  });

  // The card prints a year-over-year difference between two boundary means and
  // screens it by reading them, so that screen is blind in exactly the way this
  // note exists to state. Omitting the bound has to leave the old text alone.
  it("leaves every existing caller's text unchanged when no difference is stated", () => {
    for (const value of [FLOOR, INTERIOR, CEILING]) {
      const summary = summarizeSstRampCensoring(value);
      expect(marineBoundaryMeanSstCensoringNote(summary, undefined)).toBe(
        marineBoundaryMeanSstCensoringNote(summary)
      );
      // A withheld difference states no claim, so there is nothing to qualify.
      expect(marineBoundaryMeanSstCensoringNote(summary, "indeterminate")).toBe(
        marineBoundaryMeanSstCensoringNote(summary)
      );
    }
  });

  it("carries the qualification onto an unmarked year-over-year difference", () => {
    for (const bound of [null, "none"] as const) {
      for (const value of [FLOOR, INTERIOR, CEILING]) {
        const note = marineBoundaryMeanSstCensoringNote(
          summarizeSstRampCensoring(value),
          bound
        );
        expect(note).toContain("year-over-year difference above");
        // The difference reads as a screened pair that came back clean; say the
        // silence is the screen's reach and not a finding.
        expect(note).toContain(
          "the absence of an inequality on it is not evidence that either month was uncensored"
        );
      }
    }
  });

  it("corrects a bounded year-over-year difference instead of explaining a silence", () => {
    for (const bound of ["lower", "upper"] as const) {
      const note = marineBoundaryMeanSstCensoringNote(
        summarizeSstRampCensoring(INTERIOR),
        bound
      );
      expect(note).toContain(
        "leaves censoring inside either month's footprint undetected"
      );
      // An inequality IS printed on the difference, so there is no silence to
      // explain and the unmarked wording must not appear.
      expect(note).not.toContain("absence of an inequality");
    }
  });

  it("neither corrects a difference nor claims a direction for it", () => {
    for (const bound of [null, "lower", "upper"] as const) {
      const note = marineBoundaryMeanSstCensoringNote(
        summarizeSstRampCensoring(INTERIOR),
        bound
      );
      // The sign of what censoring did to a difference needs its presence in
      // BOTH months, which is exactly what an averaged footprint destroys.
      expect(note).not.toMatch(/warmer|cooler|colder|unchanged|≤|≥/);
      expect(note).not.toMatch(/marine|biolog|ecosystem|habitat|sea-ice/i);
    }
  });

  // A value outside the published ramp carries no statement about its caps, so
  // it gets no clause even when a difference was stated beside it.
  it("stays silent outside the published ramp even with a stated difference", () => {
    expect(
      marineBoundaryMeanSstCensoringNote(summarizeSstRampCensoring(null), null)
    ).toBeNull();
  });
});

describe("the standalone clause for a difference printed on its own line", () => {
  it("explains a silence as unscreened rather than clean", () => {
    const note = marineBoundaryMeanSstDifferenceCensoringNote("none");
    expect(note).toContain("two area-weighted boundary means");
    expect(note).toContain("absence of an inequality");
    expect(note).toContain("not evidence that either month's boundary");
  });

  it("explains a printed inequality as read off the means", () => {
    for (const bound of ["lower", "upper"] as const) {
      const note = marineBoundaryMeanSstDifferenceCensoringNote(bound);
      expect(note).toContain("read off two area-weighted boundary means");
      expect(note).toContain(
        "leaves censoring inside either month's footprint undetected"
      );
      // Printing "the absence of an inequality" beside a visible ≥/≤ would be
      // flatly wrong, so the two wordings must never cross over.
      expect(note).not.toContain("absence of an inequality");
    }
  });

  it("says nothing where no difference was stated", () => {
    // `indeterminate` is a WITHHELD difference: no claim survives to qualify.
    for (const bound of [undefined, null, "indeterminate"] as const) {
      expect(marineBoundaryMeanSstDifferenceCensoringNote(bound)).toBeNull();
    }
  });

  it("stands on its own, without leaning on a preceding mean clause", () => {
    // The month-over-month line is appended after everything the place insight
    // wrote, and the mean's own note is omitted for a value outside the
    // published ramp — so this clause can arrive with no antecedent at all.
    for (const bound of ["none", "lower", "upper"] as const) {
      const note = marineBoundaryMeanSstDifferenceCensoringNote(bound) ?? "";
      expect(note).not.toMatch(/two such means|that same rule|as well/);
      expect(note).toContain("area-weighted boundary means");
    }
  });

  it("claims no direction, magnitude, or biological consequence", () => {
    for (const bound of ["none", "lower", "upper"] as const) {
      const note = marineBoundaryMeanSstDifferenceCensoringNote(bound) ?? "";
      expect(note).not.toMatch(/warmer|cooler|colder|unchanged|≤|≥/);
      expect(note).not.toMatch(
        /marine|biolog|ecosystem|habitat|sea-ice|heatwave|forecast/i
      );
    }
  });
});
