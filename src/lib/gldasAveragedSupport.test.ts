import { describe, expect, it } from "vitest";

import {
  GLDAS_AVERAGED_SUPPORT_LIMITATIONS,
  gldasAveragedSupportClause,
  gldasAveragedSupportNote,
  summarizeGldasAveragedSupport,
} from "./gldasAveragedSupport";
import { GLDAS_RAMP_SATURATION } from "./gldasRampSaturation";

const full = [1, 1, 1];
const partial = [0.42, 0.96];

describe("summarizeGldasAveragedSupport", () => {
  it("reports no shares as unreported", () => {
    expect(
      summarizeGldasAveragedSupport("soil", "sampled-area", [1, 2], null).status
    ).toBe("unreported");
    expect(
      summarizeGldasAveragedSupport("soil", "sampled-area", null, full).status
    ).toBe("unreported");
  });

  it("separates an empty record from an unusable share", () => {
    expect(
      summarizeGldasAveragedSupport(
        "precip",
        "sampled-area",
        [null, null],
        [1, 1]
      ).status
    ).toBe("no-charted-month");

    const unusable = summarizeGldasAveragedSupport(
      "precip",
      "sampled-area",
      [3, 4],
      [1.4, -0.2]
    );
    expect(unusable.status).toBe("unclassifiable");
    expect(unusable.chartedMonths).toBe(2);
    expect(unusable.classifiedMonths).toBe(0);
  });

  it("counts only months that charted a value", () => {
    const summary = summarizeGldasAveragedSupport(
      "soil",
      "drawn-region",
      [12, null, 18, Number.NaN],
      [0.5, 0.1, 0.8, 0.9]
    );
    expect(summary.chartedMonths).toBe(2);
    expect(summary.classifiedMonths).toBe(2);
    // The unplotted months' shares must not widen the range.
    expect(summary.minFraction).toBeCloseTo(0.5);
    expect(summary.maxFraction).toBeCloseTo(0.8);
  });

  it("treats only an exact 1 as fully drawn", () => {
    expect(
      summarizeGldasAveragedSupport("soil", "sampled-area", [1, 2, 3], full)
        .status
    ).toBe("fully-drawn");
    expect(
      summarizeGldasAveragedSupport(
        "soil",
        "sampled-area",
        [1, 2, 3],
        [0.999, 1, 1]
      ).status
    ).toBe("partly-drawn");
  });
});

describe("gldasAveragedSupportClause", () => {
  it("stays silent unless the footprint was partly drawn", () => {
    for (const shares of [null, [1, 1, 1], [1.5, -1]]) {
      expect(
        gldasAveragedSupportClause(
          summarizeGldasAveragedSupport(
            "soil",
            "sampled-area",
            [1, 2, 3],
            shares
          )
        )
      ).toBeNull();
    }
  });

  it("stays silent on an empty record, which the domain notes already own", () => {
    expect(
      gldasAveragedSupportClause(
        summarizeGldasAveragedSupport(
          "precip",
          "sampled-area",
          [null, null],
          [0.3, 0.4]
        )
      )
    ).toBeNull();
  });

  it("reports the share range and refuses the dry reading", () => {
    const clause = gldasAveragedSupportClause(
      summarizeGldasAveragedSupport("soil", "sampled-area", [1, 2, 3], partial)
    );
    expect(clause).toContain("42%–96%");
    expect(clause).toContain("sampled area");
    expect(clause).toContain("land cells only");
    expect(clause).toContain("not evidence of dry ground");
    // No direction of error, and no corrected mean.
    expect(clause).not.toMatch(/underestimat|overestimat|actually|corrected/i);
  });

  it("still qualifies a range whose widest month covered the whole footprint", () => {
    // One fully drawn month does not excuse the months that were not; the
    // range runs to 100% and the clause still speaks.
    const clause = gldasAveragedSupportClause(
      summarizeGldasAveragedSupport("soil", "sampled-area", [1, 2], [0.42, 1])
    );
    expect(clause).toContain("42%–100%");
  });

  it("names the drawn region when that is the footprint", () => {
    const clause = gldasAveragedSupportClause(
      summarizeGldasAveragedSupport(
        "precip",
        "drawn-region",
        [1, 2, 3],
        partial
      )
    );
    expect(clause).toContain("drawn region");
  });

  it("collapses an unvarying share to one figure", () => {
    const clause = gldasAveragedSupportClause(
      summarizeGldasAveragedSupport(
        "soil",
        "sampled-area",
        [1, 2],
        [0.42, 0.42]
      )
    );
    expect(clause).toContain("42% of the");
    expect(clause).not.toContain("–");
  });

  it("keeps a positive sliver off a contradictory 0%", () => {
    const clause = gldasAveragedSupportClause(
      summarizeGldasAveragedSupport("soil", "sampled-area", [1, 2], [0.001, 1])
    );
    expect(clause).toContain("<1%");
  });

  it("prints a near-whole share as >99% rather than a contradictory 100%", () => {
    // One undrawn pixel in a full 28x28 drawn-region grid (lib/probe.ts
    // regionGridSize). The rest of the clause says each mean covers its drawn
    // cells alone and that an undrawn share is not evidence of dry ground,
    // which a bare "100%" flatly contradicts in the same sentence.
    const clause =
      gldasAveragedSupportClause(
        summarizeGldasAveragedSupport(
          "precip",
          "drawn-region",
          [1, 2],
          [783 / 784, 783 / 784]
        )
      ) ?? "";
    expect(clause).toContain(">99% of the drawn region");
    expect(clause).not.toContain("100%");
  });

  it("still prints 100% for a month that really did cover the footprint", () => {
    // Only the minimum decides the clause fires, so an exact 1 can sit at the
    // top of the range. There the completeness is real and must not be hedged.
    const clause =
      gldasAveragedSupportClause(
        summarizeGldasAveragedSupport(
          "soil",
          "drawn-region",
          [1, 2],
          [783 / 784, 1]
        )
      ) ?? "";
    expect(clause).toContain(">99%–100%");
  });

  it("quotes each ceiling in the unit the probe reports, not the native label", () => {
    // The precipitation ramp publishes `≥ 5.0e-04` in kg/m²/s while the panel
    // beside the clause prints mm/day — quoting the published label would
    // misstate the bound by four orders of magnitude.
    const precip = gldasAveragedSupportClause(
      summarizeGldasAveragedSupport("precip", "sampled-area", [1, 2], partial)
    );
    expect(precip).toContain("≥ 43.2 mm/day");
    expect(precip).not.toContain("5.0e-04");
    expect(precip).not.toContain(
      GLDAS_RAMP_SATURATION.precip.ceiling.publishedLabel
    );

    const soil = gldasAveragedSupportClause(
      summarizeGldasAveragedSupport("soil", "sampled-area", [1, 2], partial)
    );
    expect(soil).toContain("≥ 50 kg/m²");
  });

  it("re-derives both bounds from the ramp facts rather than trusting prose", () => {
    for (const layerId of ["precip", "soil"] as const) {
      const facts = GLDAS_RAMP_SATURATION[layerId];
      const clause = gldasAveragedSupportClause(
        summarizeGldasAveragedSupport(layerId, "sampled-area", [1, 2], partial)
      );
      const bound = Number.isInteger(facts.ceiling.boundReported)
        ? String(facts.ceiling.boundReported)
        : facts.ceiling.boundReported.toFixed(1);
      expect(clause).toContain(`≥ ${bound} ${facts.reportedUnit}`);
    }
  });
});

describe("gldasAveragedSupportNote", () => {
  it("speaks for both water-cycle layers and no others", () => {
    for (const layerId of ["precip", "soil"] as const) {
      expect(
        gldasAveragedSupportNote(layerId, "sampled-area", [1, 2, 3], partial)
      ).toBeTruthy();
    }
    for (const layerId of [
      "sst",
      "snow",
      "ndvi",
      "evi",
      "aerosol",
      "airtemp",
      "lst",
      null,
      undefined,
    ] as const) {
      expect(
        gldasAveragedSupportNote(layerId, "sampled-area", [1, 2, 3], partial)
      ).toBeNull();
    }
  });

  it("stays silent for a point probe, which supplies no shares", () => {
    expect(
      gldasAveragedSupportNote("soil", "sampled-area", [1, 2, 3], null)
    ).toBeNull();
  });
});

describe("GLDAS_AVERAGED_SUPPORT_LIMITATIONS", () => {
  it("states the three exclusions and refuses a direction", () => {
    const text = GLDAS_AVERAGED_SUPPORT_LIMITATIONS.join(" ");
    expect(text).toContain("validFraction cannot separate");
    expect(text).toContain("not evidence of dry ground");
    expect(text).toMatch(/never infers a condition/);
  });
});
