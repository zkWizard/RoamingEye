import { describe, expect, it } from "vitest";
import {
  summarizeVegetationAveragedSupport,
  vegetationAveragedSupportClause,
  vegetationAveragedSupportNote,
} from "./vegetationAveragedSupport";

/** A charted series: every month plotted a mean. */
const charted = (n: number): number[] => Array.from({ length: n }, () => 0.5);

describe("summarizeVegetationAveragedSupport", () => {
  it("reports nothing when no shares are supplied — the point probe's case", () => {
    const summary = summarizeVegetationAveragedSupport(
      "ndvi",
      "sampled-area",
      charted(3),
      null
    );
    expect(summary.status).toBe("unreported");
    expect(vegetationAveragedSupportClause(summary)).toBeNull();
  });

  it("stays silent when every charted month covered the whole footprint", () => {
    const summary = summarizeVegetationAveragedSupport(
      "ndvi",
      "drawn-region",
      charted(3),
      [1, 1, 1]
    );
    expect(summary.status).toBe("fully-drawn");
    expect(vegetationAveragedSupportClause(summary)).toBeNull();
  });

  it("treats a share just under 1 as incomplete — the clause rounds", () => {
    const summary = summarizeVegetationAveragedSupport(
      "ndvi",
      "drawn-region",
      charted(2),
      [1, 0.999]
    );
    expect(summary.status).toBe("partly-drawn");
    // Rounds to 100%, so the caveat is the only thing distinguishing it.
    expect(vegetationAveragedSupportClause(summary)).toContain("100%");
  });

  it("reads shares only from months that charted a value", () => {
    // Month 1 failed to load: it records a zero share but plotted nothing, and
    // must not be reported as an undrawn surface.
    const summary = summarizeVegetationAveragedSupport(
      "ndvi",
      "drawn-region",
      [0.5, null, 0.5],
      [0.8, 0, 0.6]
    );
    expect(summary.chartedMonths).toBe(2);
    expect(summary.classifiedMonths).toBe(2);
    expect(summary.minFraction).toBeCloseTo(0.6);
    expect(summary.maxFraction).toBeCloseTo(0.8);
  });

  it("skips a share outside [0, 1] rather than treating it as complete", () => {
    const summary = summarizeVegetationAveragedSupport(
      "ndvi",
      "drawn-region",
      charted(3),
      [0.4, 1.5, Number.NaN]
    );
    expect(summary.chartedMonths).toBe(3);
    expect(summary.classifiedMonths).toBe(1);
    expect(summary.minFraction).toBeCloseTo(0.4);
  });

  it("says nothing when charted months carried no usable share", () => {
    const summary = summarizeVegetationAveragedSupport(
      "evi",
      "drawn-region",
      charted(2),
      [Number.NaN, -1]
    );
    expect(summary.status).toBe("unclassifiable");
    expect(vegetationAveragedSupportClause(summary)).toBeNull();
  });

  it("is invariant to month order, including on an exact tie", () => {
    const values = [0.5, 0.5, 0.5, 0.5];
    // Two months share the identical minimum share — MOD13A3's monthly
    // compositing makes exact ties over a fixed box ordinary.
    const fractions = [0.42, 0.9, 0.42, 0.71];
    const forward = summarizeVegetationAveragedSupport(
      "ndvi",
      "drawn-region",
      values,
      fractions
    );
    const reversed = summarizeVegetationAveragedSupport(
      "ndvi",
      "drawn-region",
      [...values].reverse(),
      [...fractions].reverse()
    );
    expect(reversed.status).toBe(forward.status);
    expect(reversed.chartedMonths).toBe(forward.chartedMonths);
    expect(reversed.classifiedMonths).toBe(forward.classifiedMonths);
    expect(reversed.minFraction).toBeCloseTo(forward.minFraction ?? Number.NaN);
    expect(reversed.maxFraction).toBeCloseTo(forward.maxFraction ?? Number.NaN);
    expect(vegetationAveragedSupportClause(reversed)).toBe(
      vegetationAveragedSupportClause(forward)
    );
  });
});

describe("vegetationAveragedSupportClause", () => {
  const clauseFor = (
    fractions: (number | null)[],
    footprint: "drawn-region" | "sampled-area" = "drawn-region"
  ): string | null =>
    vegetationAveragedSupportClause(
      summarizeVegetationAveragedSupport(
        "ndvi",
        footprint,
        charted(fractions.length),
        fractions
      )
    );

  it("names the share range, the mechanism, and the direction of the bias", () => {
    const clause = clauseFor([0.43, 0.91]);
    expect(clause).toContain("NDVI drawn over 43%–91% of the drawn region");
    expect(clause).toContain("draws no colour below the ramp start");
    expect(clause).toContain("reads high against a mean over the whole");
  });

  it("collapses a constant share to a single percentage", () => {
    // No range separator: an en dash after the figure would mean it printed
    // "60%–60%".
    expect(clauseFor([0.6, 0.6])).toContain("over 60% of the drawn region");
    expect(clauseFor([0.6, 0.6])).not.toContain("60%–");
  });

  it("names the sampled area for the area footprint", () => {
    const clause = clauseFor([0.5], "sampled-area");
    expect(clause).toContain("of the sampled area");
    expect(clause).toContain("the whole sampled area");
    expect(clause).not.toContain("drawn region");
  });

  it("explains an empty record without blaming the surface for it", () => {
    const clause = vegetationAveragedSupportClause(
      summarizeVegetationAveragedSupport(
        "ndvi",
        "drawn-region",
        [null, null],
        [0, 0]
      )
    );
    expect(clause).toContain("no month charted a drawn NDVI mean");
    expect(clause).toContain("a missing monthly composite reads the same way");
  });

  it("never reads an undrawn pixel as low greenness", () => {
    const clause = clauseFor([0.3, 0.8]) ?? "";
    expect(clause).toContain("left undrawn rather than low");
    expect(clause).not.toMatch(/bare|barren ground|no vegetation|unvegetated/);
  });

  it("prints a positive sliver as <1% rather than a contradictory 0%", () => {
    // 0.85, not 0.9: "0%" is a substring of "90%", so a bare not.toContain
    // would pass for the wrong reason.
    const clause = clauseFor([0.002, 0.85]) ?? "";
    expect(clause).toContain("<1%");
    expect(clause).not.toContain("0%");
  });
});

describe("vegetationAveragedSupportNote", () => {
  it("speaks for both rendered vegetation-index layers", () => {
    for (const layerId of ["ndvi", "evi"] as const) {
      const note = vegetationAveragedSupportNote(
        layerId,
        "drawn-region",
        charted(2),
        [0.5, 0.7]
      );
      expect(note).toContain(`${layerId.toUpperCase()} drawn over`);
    }
  });

  it("stays silent for every other layer", () => {
    for (const layerId of ["sst", "lst", "airtemp", "landcover"] as const) {
      expect(
        vegetationAveragedSupportNote(
          layerId,
          "drawn-region",
          charted(2),
          [0.5, 0.7]
        )
      ).toBeNull();
    }
  });

  it("stays silent for a point probe, which supplies no shares", () => {
    expect(
      vegetationAveragedSupportNote("ndvi", "sampled-area", charted(3), null)
    ).toBeNull();
  });
});
