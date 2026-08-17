import { describe, expect, it } from "vitest";
import {
  averagedLstCensoringCsvHeaders,
  averagedLstCensoringNote,
  lstAveragedCensoringClause,
  summarizeProbeLstAveragedCensoring,
} from "./probeLstAveragedCensoring";
import { probeLstExtremeCensoring } from "./probeLstExtremeCensoring";
import { LAYER_ORDER } from "./timeline";

/** Decoded kelvin either side of the ramp's two open terminal bins. */
const FLOOR = 200.3;
const CEILING = 349.7;
const INTERIOR = 295.15;

const uncensored = probeLstExtremeCensoring("lst", [INTERIOR, 301.4, 288.2]);
const censored = probeLstExtremeCensoring("lst", [INTERIOR, CEILING]);
/** Both caps in one footprint — a land box can span them; a marine one cannot. */
const bothCaps = probeLstExtremeCensoring("lst", [FLOOR, INTERIOR, CEILING]);
const empty = probeLstExtremeCensoring("lst", [null, null]);

describe("summarizeProbeLstAveragedCensoring", () => {
  it("never claims detectability or a renderable direction, applicable or not", () => {
    for (const summary of [
      summarizeProbeLstAveragedCensoring("drawn-region", uncensored),
      summarizeProbeLstAveragedCensoring("drawn-region", censored),
      summarizeProbeLstAveragedCensoring("sampled-area", bothCaps),
      summarizeProbeLstAveragedCensoring(null, uncensored),
    ]) {
      expect(summary.pixelCensoringDetectable).toBe(false);
      expect(summary.boundDirectionClaimable).toBe(false);
      expect(summary.airTemperatureObservation).toBe(false);
      expect(summary.isForecast).toBe(false);
    }
  });

  it("is inapplicable for a point probe even on a censored series", () => {
    const summary = summarizeProbeLstAveragedCensoring(null, censored);
    expect(summary.applicable).toBe(false);
    expect(summary.combination).toBeNull();
    expect(summary.markedMonthCount).toBe(0);
  });

  it("is inapplicable when the footprint returned nothing", () => {
    expect(
      summarizeProbeLstAveragedCensoring("drawn-region", empty).applicable
    ).toBe(false);
  });

  it("counts the months the end-cap screen marked at EITHER end", () => {
    expect(
      summarizeProbeLstAveragedCensoring("sampled-area", censored)
        .markedMonthCount
    ).toBe(1);
    // Both terminal bins count — the denominator is the screen's total marks,
    // not one end's, or a floor-capped record would read as unmarked.
    expect(
      summarizeProbeLstAveragedCensoring("sampled-area", bothCaps)
        .markedMonthCount
    ).toBe(2);
    expect(
      summarizeProbeLstAveragedCensoring("sampled-area", uncensored)
        .markedMonthCount
    ).toBe(0);
  });

  it("names the combination only when it applies", () => {
    expect(
      summarizeProbeLstAveragedCensoring("drawn-region", uncensored).combination
    ).toBe("area-weighted-mean-of-per-pixel-decodes");
  });
});

describe("averagedLstCensoringNote", () => {
  it("stays silent for a point probe and an absent footprint", () => {
    expect(averagedLstCensoringNote(null, censored)).toBeNull();
    expect(averagedLstCensoringNote(undefined, uncensored)).toBeNull();
  });

  it("stays silent for every layer but lst", () => {
    for (const layerId of LAYER_ORDER) {
      if (layerId === "lst") continue;
      const other = probeLstExtremeCensoring(layerId, [INTERIOR, CEILING]);
      expect(averagedLstCensoringNote("drawn-region", other)).toBeNull();
      expect(averagedLstCensoringNote("sampled-area", other)).toBeNull();
    }
  });

  it("stays silent for an averaged footprint that returned nothing", () => {
    expect(averagedLstCensoringNote("drawn-region", empty)).toBeNull();
  });

  it("qualifies an unmarked averaged series as not established uncensored", () => {
    const note = averagedLstCensoringNote("drawn-region", uncensored) ?? "";
    expect(note).toContain("weighted mean of per-pixel decodes");
    expect(note).toContain(
      "not evidence the drawn region held no censored pixel"
    );
    // The sibling clause is silent without a mark, so this one carries the
    // attribution or the statement has no cited ramp behind it.
    expect(note).toContain("MODIS_Land_Surface_Temp");
  });

  it("corrects the marks themselves when the screen did fire", () => {
    const note = averagedLstCensoringNote("sampled-area", censored) ?? "";
    expect(note).toContain("screen the sampled area's monthly means");
    expect(note).toContain("not established as uncensored");
  });

  it("renders no inequality and claims no direction, in either wording", () => {
    for (const censoring of [uncensored, censored, bothCaps]) {
      const note = averagedLstCensoringNote("drawn-region", censoring) ?? "";
      expect(note).not.toContain("≥");
      expect(note).not.toContain("≤");
      // Unlike the one-sided aerosol sibling, this ramp is open at BOTH ends,
      // so no bias direction may be stated even conditionally.
      for (const signed of ["understate", "overstate", "warmer", "cooler"]) {
        expect(note.toLowerCase()).not.toContain(signed);
      }
    }
  });

  it("labels the footprint the user actually chose", () => {
    expect(averagedLstCensoringNote("drawn-region", uncensored)).toContain(
      "drawn region"
    );
    expect(averagedLstCensoringNote("sampled-area", uncensored)).toContain(
      "sampled area"
    );
  });

  it("agrees with the summary it is built from", () => {
    const summary = summarizeProbeLstAveragedCensoring(
      "drawn-region",
      censored
    );
    expect(lstAveragedCensoringClause(summary, censored)).toBe(
      averagedLstCensoringNote("drawn-region", censored)
    );
  });
});

describe("averagedLstCensoringCsvHeaders", () => {
  it("writes nothing for a point probe or a footprint that returned nothing", () => {
    expect(averagedLstCensoringCsvHeaders(null, censored)).toEqual([]);
    expect(averagedLstCensoringCsvHeaders(undefined, uncensored)).toEqual([]);
    expect(averagedLstCensoringCsvHeaders("sampled-area", empty)).toEqual([]);
  });

  it("writes nothing for every other layer", () => {
    for (const id of LAYER_ORDER) {
      if (id === "lst") continue;
      expect(
        averagedLstCensoringCsvHeaders(
          "drawn-region",
          probeLstExtremeCensoring(id, [INTERIOR, CEILING])
        )
      ).toEqual([]);
    }
  });

  it("corrects a silent screen differently from a stated bin rule", () => {
    const [silent] = averagedLstCensoringCsvHeaders("drawn-region", uncensored);
    const [marked] = averagedLstCensoringCsvHeaders("drawn-region", censored);
    // No mark: the sibling block wrote nothing at all, so this names the
    // combiner and the ramp rather than correcting a rule that is not there.
    expect(silent).toContain("area-weighted mean of per-pixel decodes");
    expect(silent).toContain("not evidence");
    expect(silent).toContain("MODIS_Land_Surface_Temp");
    // Marks present: the sibling stated a rule, so correct the rule's reach.
    expect(marked).toContain("the bin rule above");
    expect(marked).toContain("not established as uncensored");
  });

  it("never claims presence, direction or magnitude", () => {
    const [, detection] = averagedLstCensoringCsvHeaders(
      "drawn-region",
      uncensored
    );
    expect(detection).toContain(
      "no presence and no direction and no magnitude"
    );
    expect(detection).toContain("the sampler does not report");
  });

  it("renders no inequality on any row, in either wording", () => {
    for (const censoring of [uncensored, censored, bothCaps]) {
      for (const line of averagedLstCensoringCsvHeaders(
        "sampled-area",
        censoring
      )) {
        expect(line).not.toContain("≥");
        expect(line).not.toContain("≤");
      }
    }
  });

  it("labels the footprint the user actually chose", () => {
    expect(
      averagedLstCensoringCsvHeaders("drawn-region", censored).join(" ")
    ).toContain("drawn region");
    expect(
      averagedLstCensoringCsvHeaders("sampled-area", censored).join(" ")
    ).toContain("sampled area");
  });

  it("keeps every line a single comma-free CSV comment", () => {
    for (const censoring of [uncensored, censored, bothCaps]) {
      for (const line of averagedLstCensoringCsvHeaders(
        "drawn-region",
        censoring
      )) {
        expect(line.startsWith("# lst_ramp_censoring_averaged")).toBe(true);
        expect(line).not.toContain(",");
        expect(line).not.toContain("\n");
        expect(line).not.toContain('"');
      }
    }
  });

  it("claims no air-temperature, health or forecast meaning", () => {
    for (const line of averagedLstCensoringCsvHeaders(
      "drawn-region",
      uncensored
    )) {
      for (const forbidden of [
        "air temperature",
        "heat",
        "health",
        "forecast",
      ]) {
        expect(line.toLowerCase()).not.toContain(forbidden);
      }
    }
  });
});
