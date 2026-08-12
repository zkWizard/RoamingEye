import { describe, it, expect } from "vitest";
import {
  SST_OBSERVING_CONSTRAINTS,
  SST_OBSERVING_CONSTRAINT_LIMITS,
  SST_OBSERVING_CONSTRAINT_SOURCE,
  SST_SAMPLING_GATE_NOTE,
  summarizeSstObservingConstraints,
  type SstObservingConstraintId,
} from "./sstObservingConstraints";
import { LAYERS } from "./timeline";

describe("SST observing constraints", () => {
  it("cites the SST layer's own dataset, not a restated copy", () => {
    // Provenance discipline: a copied citation can drift from the layer it
    // describes. This must be the same object the layer carries.
    expect(SST_OBSERVING_CONSTRAINT_SOURCE).toBe(LAYERS.sst.dataset);
  });

  it("asserts constraints only for a daytime, thermal-infrared product", () => {
    // Every constraint here follows from the cited product being a DAYTIME
    // THERMAL-IR composite. If the SST layer is ever repointed at a product
    // that is neither, these assertions no longer hold and must be revisited
    // rather than silently inherited.
    const title = LAYERS.sst.dataset?.title ?? "";
    expect(title).toMatch(/daytime/i);
    expect(title).toMatch(/thermal/i);
  });

  it("covers the three sampling gates exactly once each", () => {
    const ids = SST_OBSERVING_CONSTRAINTS.map((entry) => entry.id);
    expect(ids).toEqual([
      "daytime-overpass-only",
      "clear-sky-retrieval-only",
      "near-surface-radiometric",
    ]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every constraint a non-empty constraint and implication", () => {
    for (const entry of SST_OBSERVING_CONSTRAINTS) {
      expect(entry.constraint.trim().length).toBeGreaterThan(0);
      expect(entry.implication.trim().length).toBeGreaterThan(0);
    }
  });

  it("asserts a direction only for the daytime overpass", () => {
    // The daytime overpass samples near the diurnal maximum, so its sign is
    // fixed by observing geometry and cannot lean cool. Clear-sky screening and
    // surface-layer radiometry have regime-dependent signs, so asserting one
    // would be a guess.
    const directional = SST_OBSERVING_CONSTRAINTS.filter(
      (entry) => entry.direction !== "not-asserted"
    );
    expect(directional.map((entry) => entry.id)).toEqual([
      "daytime-overpass-only",
    ]);
    expect(directional[0].direction).toBe("warm-leaning");
  });

  it("never asserts an offset magnitude", () => {
    // A daytime-versus-daily-mean offset depends on wind, insolation, and
    // mixing that this app does not observe. Naming any number here — degrees,
    // kelvin, or a percentage — would invent an uncertainty budget.
    const prose = SST_OBSERVING_CONSTRAINTS.flatMap((entry) => [
      entry.constraint,
      entry.implication,
    ]).join(" ");
    expect(prose).not.toMatch(/\d+(\.\d+)?\s*(°|deg|K\b|kelvin|celsius|%)/i);
  });

  it("makes no biological, causal, hazard, or forecast claim", () => {
    const prose = [
      ...SST_OBSERVING_CONSTRAINTS.flatMap((entry) => [
        entry.constraint,
        entry.implication,
      ]),
      summarizeSstObservingConstraints().statement,
      SST_SAMPLING_GATE_NOTE,
    ].join(" ");
    expect(prose).not.toMatch(
      /\b(species|coral|bleach\w*|habitat|abundance|biomass|ecosystem|stress|hazard|risk|forecast|predict\w*|expected to|because of|caused by|due to)\b/i
    );
  });

  it("summarizes without taking an observation", () => {
    // The constraints hold for every value the product publishes. Deriving them
    // from one month's sample would imply they were measured from it.
    expect(summarizeSstObservingConstraints).toHaveLength(0);
  });

  it("reports the product as not representing the full diurnal cycle", () => {
    const summary = summarizeSstObservingConstraints();
    expect(summary.kind).toBe("sea-surface-temperature-observing-constraints");
    expect(summary.isForecast).toBe(false);
    expect(summary.marineBiologyObservation).toBe(false);
    expect(summary.claimScope).toBe("product-observing-system-only");
    expect(summary.representsFullDiurnalCycle).toBe(false);
    expect(summary.constraints).toBe(SST_OBSERVING_CONSTRAINTS);
    expect(summary.limits).toBe(SST_OBSERVING_CONSTRAINT_LIMITS);
  });

  it("derives directionalConstraintIds from the table, not a second list", () => {
    const expected: SstObservingConstraintId[] =
      SST_OBSERVING_CONSTRAINTS.filter(
        (entry) => entry.direction !== "not-asserted"
      ).map((entry) => entry.id);
    expect(summarizeSstObservingConstraints().directionalConstraintIds).toEqual(
      expected
    );
  });

  it("carries the cited source in the accessible statement", () => {
    const { statement } = summarizeSstObservingConstraints();
    expect(statement).toContain(SST_OBSERVING_CONSTRAINT_SOURCE.shortName);
    expect(statement).toContain(`v${SST_OBSERVING_CONSTRAINT_SOURCE.version}`);
    // Each constraint reaches the reader; none is dropped by the join.
    for (const entry of SST_OBSERVING_CONSTRAINTS) {
      expect(statement).toContain(entry.constraint);
      expect(statement).toContain(entry.implication);
    }
  });

  it("keeps the display note short enough to sit inside a provenance line", () => {
    // It is appended to an existing detail string, not given its own row.
    expect(SST_SAMPLING_GATE_NOTE.length).toBeLessThanOrEqual(80);
    expect(SST_SAMPLING_GATE_NOTE).not.toMatch(/[.;]$/);
  });

  it("names both gates the display note stands in for", () => {
    // The note is the compressed form of the two sampling gates. If either is
    // renamed or dropped, the note must not keep implying it.
    expect(SST_SAMPLING_GATE_NOTE).toMatch(/daytime/i);
    expect(SST_SAMPLING_GATE_NOTE).toMatch(/clear.sky/i);
  });

  it("returns a stable summary across calls", () => {
    expect(summarizeSstObservingConstraints()).toEqual(
      summarizeSstObservingConstraints()
    );
  });
});
