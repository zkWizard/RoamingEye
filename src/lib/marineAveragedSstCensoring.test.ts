import { describe, expect, it } from "vitest";
import {
  averagedSstCensoringNote,
  summarizeMarineAveragedSstCensoring,
} from "./marineAveragedSstCensoring";
import { probeSstExtremeCensoring } from "./probeSstExtremeCensoring";
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
