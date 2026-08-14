import { describe, it, expect } from "vitest";
import {
  VEGETATION_OBSERVING_CONSTRAINTS,
  VEGETATION_OBSERVING_CONSTRAINT_LAYER_IDS,
  VEGETATION_OBSERVING_CONSTRAINT_LIMITS,
  VEGETATION_OBSERVING_CONSTRAINT_SOURCES,
  VEGETATION_SAMPLING_GATE_NOTES,
  probeVegetationSamplingGateClause,
} from "./vegetationObservingConstraints";
import { LAYERS, LAYER_ORDER } from "./timeline";

describe("vegetation observing constraints", () => {
  it("cites each layer's own dataset, not a restated copy", () => {
    // Provenance discipline: a copied citation can drift from the layer it
    // describes. These must be the same objects the layers carry.
    expect(VEGETATION_OBSERVING_CONSTRAINT_SOURCES.ndvi).toBe(
      LAYERS.ndvi.dataset
    );
    expect(VEGETATION_OBSERVING_CONSTRAINT_SOURCES.evi).toBe(
      LAYERS.evi.dataset
    );
  });

  it("asserts constraints only for the one composited product both layers cite", () => {
    // Every constraint here follows from the rendered layers being MOD13A3
    // composites. If either layer is ever repointed at a different product —
    // an 8-day VI, a different sensor — these assertions no longer hold and
    // must be revisited rather than silently inherited.
    for (const id of VEGETATION_OBSERVING_CONSTRAINT_LAYER_IDS) {
      expect(LAYERS[id].dataset?.shortName).toBe("MOD13A3");
      expect(LAYERS[id].wmsLayer).toMatch(
        /^MODIS_Terra_L3_(NDVI|EVI)_Monthly$/
      );
    }
  });

  it("covers the three constraints exactly once each, in reader order, for both layers", () => {
    for (const id of VEGETATION_OBSERVING_CONSTRAINT_LAYER_IDS) {
      const ids = VEGETATION_OBSERVING_CONSTRAINTS[id].map((e) => e.id);
      expect(ids).toEqual([
        "clear-sky-optical-only",
        "maximum-value-selection",
        "composite-not-monthly-mean",
      ]);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("gives every constraint a non-empty constraint, implication and short form", () => {
    for (const id of VEGETATION_OBSERVING_CONSTRAINT_LAYER_IDS) {
      for (const entry of VEGETATION_OBSERVING_CONSTRAINTS[id]) {
        expect(entry.constraint.trim().length).toBeGreaterThan(0);
        expect(entry.implication.trim().length).toBeGreaterThan(0);
        expect(entry.shortForm.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("asserts a direction only for NDVI's selection, where the rule fixes the sign", () => {
    // A maximum cannot fall below the mean of the candidates it was drawn
    // from, so `green-leaning` is the selection rule restated rather than an
    // estimate. Nothing fixes a sign for the clear-sky or composite
    // constraints, so asserting one there would be a guess.
    const ndvi = Object.fromEntries(
      VEGETATION_OBSERVING_CONSTRAINTS.ndvi.map((e) => [e.id, e.direction])
    );
    expect(ndvi["maximum-value-selection"]).toBe("green-leaning");
    expect(ndvi["clear-sky-optical-only"]).toBe("not-asserted");
    expect(ndvi["composite-not-monthly-mean"]).toBe("not-asserted");
  });

  it("asserts no direction anywhere for EVI, because its selection is made on NDVI", () => {
    // This is the substantive difference between the two layers. The
    // compositing decision maximizes NDVI; the observation it keeps supplies
    // that window's EVI without EVI ever being the quantity maximized, so the
    // inequality that fixes NDVI's sign does not carry over.
    for (const entry of VEGETATION_OBSERVING_CONSTRAINTS.evi) {
      expect(entry.direction).toBe("not-asserted");
    }
  });

  it("states its limits, including that EVI inherits no inequality", () => {
    expect(VEGETATION_OBSERVING_CONSTRAINT_LIMITS.length).toBeGreaterThan(0);
    for (const limit of VEGETATION_OBSERVING_CONSTRAINT_LIMITS) {
      expect(limit.trim().length).toBeGreaterThan(0);
    }
    const limits = VEGETATION_OBSERVING_CONSTRAINT_LIMITS.join(" ");
    expect(limits).toMatch(/no such inequality holds for it/i);
    expect(limits).toMatch(/no magnitude is asserted/i);
  });
});

describe("probe vegetation sampling-gate clause", () => {
  it("qualifies a vegetation-index record that reported statistics", () => {
    // The probe's min/mean/max/trend are all computed from composited
    // best-value selections; nothing in the values themselves says so.
    for (const id of VEGETATION_OBSERVING_CONSTRAINT_LAYER_IDS) {
      expect(probeVegetationSamplingGateClause(id, true)).toBe(
        VEGETATION_SAMPLING_GATE_NOTES[id]
      );
    }
  });

  it("stays silent for every layer but the two vegetation-index ones", () => {
    // The constraints are asserted for one product only. In particular the
    // land-cover layer, which is also MODIS and also terrestrial, must not
    // inherit a vegetation-index product's compositing gate.
    const constrained = new Set<string>(
      VEGETATION_OBSERVING_CONSTRAINT_LAYER_IDS
    );
    for (const layerId of LAYER_ORDER.filter((id) => !constrained.has(id))) {
      expect(probeVegetationSamplingGateClause(layerId, true)).toBe("");
    }
  });

  it("stays silent when no statistic was reported", () => {
    // The note qualifies a displayed number. With none on screen there is
    // nothing to qualify, and an empty record already states its own reason
    // (see vegetationProbeAbsence).
    for (const id of VEGETATION_OBSERVING_CONSTRAINT_LAYER_IDS) {
      expect(probeVegetationSamplingGateClause(id, false)).toBe("");
    }
  });

  it("stays silent when the sampled layer is unknown", () => {
    // The probe context is optional; an absent layer id must not be guessed
    // into a product these constraints hold for.
    expect(probeVegetationSamplingGateClause(undefined, true)).toBe("");
  });

  it("is built from the constraints rather than restating them", () => {
    // The status-line phrase and the constraints it compresses must not drift.
    for (const id of VEGETATION_OBSERVING_CONSTRAINT_LAYER_IDS) {
      for (const entry of VEGETATION_OBSERVING_CONSTRAINTS[id]) {
        expect(VEGETATION_SAMPLING_GATE_NOTES[id]).toContain(entry.shortForm);
      }
    }
  });

  it("names the composite/mean distinction, which is why the clause exists", () => {
    // A reader carries away the mean. The specific misreading this clause
    // exists to prevent is taking it for an average of the month's greenness.
    for (const id of VEGETATION_OBSERVING_CONSTRAINT_LAYER_IDS) {
      expect(probeVegetationSamplingGateClause(id, true)).toMatch(
        /not a monthly mean/i
      );
    }
  });

  it("distinguishes the two layers' selection wording", () => {
    // NDVI's clause may claim the inequality; EVI's must not, and must say
    // whose index the selection was made on.
    expect(probeVegetationSamplingGateClause("ndvi", true)).toMatch(
      /highest eligible NDVI/i
    );
    expect(probeVegetationSamplingGateClause("evi", true)).toMatch(
      /selected on NDVI/i
    );
    expect(probeVegetationSamplingGateClause("evi", true)).not.toMatch(
      /highest eligible/i
    );
  });

  it("claims nothing about cover, biomass, condition or drought, and no magnitude", () => {
    // A sampling gate is a statement about a compositing algorithm. Inferring
    // vegetation cover, biomass, habitat quality or ecological health from a
    // vegetation index is the repo's standing prohibition.
    for (const id of VEGETATION_OBSERVING_CONSTRAINT_LAYER_IDS) {
      const clause = probeVegetationSamplingGateClause(id, true);
      expect(clause).not.toMatch(
        /cover|biomass|condition|habitat|health|drought|stress|productiv|\d+\s*%/i
      );
    }
  });

  it("reads as a clause, not a sentence, for the ` · ` status line", () => {
    // It is joined into an existing line of statistics rather than appended as
    // its own sentence, so it carries no terminal stop and opens lower-case.
    for (const id of VEGETATION_OBSERVING_CONSTRAINT_LAYER_IDS) {
      const clause = probeVegetationSamplingGateClause(id, true);
      expect(clause).not.toMatch(/[.]$/);
      expect(clause).toMatch(/^clear, sunlit days only\b/);
    }
  });
});
