import { describe, it, expect } from "vitest";
import {
  LST_OBSERVING_CONSTRAINTS,
  LST_OBSERVING_CONSTRAINT_LIMITS,
  LST_OBSERVING_CONSTRAINT_SOURCE,
  LST_SAMPLING_GATE_NOTE,
  probeLstSamplingGateClause,
  lstCaptionConstraintOmissions,
  formatLstCaptionOmission,
} from "./lstObservingConstraints";
import { LAYERS, LAYER_ORDER } from "./timeline";

describe("LST observing constraints", () => {
  it("cites the LST layer's own dataset, not a restated copy", () => {
    // Provenance discipline: a copied citation can drift from the layer it
    // describes. This must be the same object the layer carries.
    expect(LST_OBSERVING_CONSTRAINT_SOURCE).toBe(LAYERS.lst.dataset);
  });

  it("asserts constraints only for a daytime land-surface-temperature product", () => {
    // Every constraint here follows from the rendered layer being the DAYTIME
    // half of a monthly LST composite. If the layer is ever repointed at the
    // night product or at an all-sky one, these assertions no longer hold and
    // must be revisited rather than silently inherited.
    expect(LAYERS.lst.wmsLayer).toMatch(/Land_Surface_Temp/i);
    expect(LAYERS.lst.wmsLayer).toMatch(/_Day$/);
    expect(LAYERS.lst.dataset?.title ?? "").toMatch(/LST/i);
  });

  it("covers the three sampling gates exactly once each", () => {
    const ids = LST_OBSERVING_CONSTRAINTS.map((entry) => entry.id);
    expect(ids).toEqual([
      "morning-overpass-only",
      "clear-sky-retrieval-only",
      "radiometric-skin-temperature",
    ]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every constraint a non-empty constraint, implication and short form", () => {
    for (const entry of LST_OBSERVING_CONSTRAINTS) {
      expect(entry.constraint.trim().length).toBeGreaterThan(0);
      expect(entry.implication.trim().length).toBeGreaterThan(0);
      expect(entry.shortForm.trim().length).toBeGreaterThan(0);
    }
  });

  it("asserts no direction for any constraint", () => {
    // This is the substantive difference from the SST product, whose
    // early-afternoon overpass samples near the diurnal maximum and so has a
    // sign fixed by observing geometry. Terra crosses near 10:30, between the
    // pre-dawn minimum and the afternoon maximum, and the skin-versus-air
    // offset is regime-dependent — so asserting either sign would be a guess.
    for (const entry of LST_OBSERVING_CONSTRAINTS) {
      expect(entry.direction).toBe("not-asserted");
    }
  });

  it("names the overpass time the place card already states", () => {
    // The place panel's LST card and this descriptor must not disagree about
    // when the product looks; both are user-facing statements about one
    // product's observing system.
    const overpass = LST_OBSERVING_CONSTRAINTS.find(
      (entry) => entry.id === "morning-overpass-only"
    );
    expect(overpass?.constraint).toMatch(/10:30/);
    expect(overpass?.constraint).toMatch(/local solar time/i);
  });

  it("states its limits, including that no direction is asserted", () => {
    expect(LST_OBSERVING_CONSTRAINT_LIMITS.length).toBeGreaterThan(0);
    for (const limit of LST_OBSERVING_CONSTRAINT_LIMITS) {
      expect(limit.trim().length).toBeGreaterThan(0);
    }
    expect(LST_OBSERVING_CONSTRAINT_LIMITS.join(" ")).toMatch(
      /no direction is asserted/i
    );
  });
});

describe("probe LST sampling-gate clause", () => {
  it("qualifies a land-surface-temperature record that reported statistics", () => {
    // The probe's min/mean/max/trend are all computed from mid-morning,
    // cloud-screened skin-temperature retrievals; nothing in the values
    // themselves says so.
    expect(probeLstSamplingGateClause("lst", true)).toBe(
      LST_SAMPLING_GATE_NOTE
    );
  });

  it("stays silent for every layer but LST", () => {
    // The constraints are asserted for one product only. In particular the
    // neighbouring 2 m air-temperature layer must not inherit a skin-
    // temperature product's sampling gate.
    for (const layerId of LAYER_ORDER.filter((id) => id !== "lst")) {
      expect(probeLstSamplingGateClause(layerId, true)).toBe("");
    }
  });

  it("stays silent when no statistic was reported", () => {
    // The note qualifies a displayed number. With none on screen there is
    // nothing to qualify, and an empty record already states its own reason.
    expect(probeLstSamplingGateClause("lst", false)).toBe("");
  });

  it("stays silent when the sampled layer is unknown", () => {
    // The probe context is optional; an absent layer id must not be guessed
    // into the one product these constraints hold for.
    expect(probeLstSamplingGateClause(undefined, true)).toBe("");
  });

  it("is built from the constraints rather than restating them", () => {
    // The status-line phrase and the constraint it compresses must not drift.
    for (const entry of LST_OBSERVING_CONSTRAINTS) {
      expect(LST_SAMPLING_GATE_NOTE).toContain(entry.shortForm);
    }
  });

  it("names the skin-versus-air distinction, which is why the clause exists", () => {
    // The app renders 2 m air temperature as a sibling layer in the same
    // category, so the same point can be probed on both. Differencing those
    // two series is the specific misreading this clause exists to prevent.
    expect(probeLstSamplingGateClause("lst", true)).toMatch(/air temperature/i);
  });

  it("claims nothing about hazard, health or weather, and no magnitude", () => {
    // A sampling gate is a statement about an instrument and an orbit. The
    // offset's size depends on surface cover, soil moisture, season and
    // latitude this app never observes, so the clause names the sampling and
    // stops.
    const clause = probeLstSamplingGateClause("lst", true);
    expect(clause).not.toMatch(
      /heat ?wave|hazard|health|comfort|danger|urban heat|warmer|cooler|°|\d+\s*K\b/i
    );
  });

  it("reads as a clause, not a sentence, for the ` · ` status line", () => {
    // It is joined into an existing line of statistics rather than appended as
    // its own sentence, so it carries no terminal stop. Unlike the SST note it
    // does open on a capital, because that capital is the spacecraft's name.
    const clause = probeLstSamplingGateClause("lst", true);
    expect(clause).not.toMatch(/[.]$/);
    expect(clause).toMatch(/^Terra's\b/);
  });
});

describe("lstCaptionConstraintOmissions", () => {
  it("passes the caption the app actually ships", () => {
    // The guard exists to keep this true. `Legend` renders the description
    // verbatim under the globe, so a regression here ships to every reader who
    // never opens the probe.
    expect(
      lstCaptionConstraintOmissions().map(formatLstCaptionOmission)
    ).toEqual([]);
  });

  it("catches a caption that states the overpass gate but not the cloud one", () => {
    // The defect this fixed, and the exact caption that shipped before it: one
    // of two co-equal sampling gates named, which reads as the complete
    // qualification rather than half of it. The ocean twin had already been
    // corrected; the land caption still stated the overpass alone.
    const omissions = lstCaptionConstraintOmissions(
      "Daytime land-surface temperature (MODIS/Terra)."
    );
    expect(omissions.map((o) => o.constraintId)).toEqual([
      "clear-sky-retrieval-only",
    ]);
    // The message quotes the constraint table rather than restating it, so the
    // two can never drift into disagreeing about the same product.
    const entry = LST_OBSERVING_CONSTRAINTS.find(
      (c) => c.id === "clear-sky-retrieval-only"
    )!;
    expect(omissions[0].constraint).toBe(entry.constraint);
    expect(omissions[0].implication).toBe(entry.implication);
  });

  it("catches a caption that drops both sampling gates", () => {
    const omissions = lstCaptionConstraintOmissions(
      "Land-surface temperature."
    );
    expect(omissions.map((o) => o.constraintId)).toEqual([
      "morning-overpass-only",
      "clear-sky-retrieval-only",
    ]);
  });

  it("accepts any declared surface form of a gate", () => {
    // Wording is a copy decision; the check is about what was said, not how.
    for (const cloudPhrase of ["clear sky", "cloud-free", "cloud-screened"]) {
      expect(
        lstCaptionConstraintOmissions(
          `Morning ${cloudPhrase} land-surface temp.`
        )
      ).toEqual([]);
    }
  });

  it("never requires the skin-temperature constraint in the caption", () => {
    // Deliberate: the caption already names the quantity it renders, which is
    // what separates it from the 2 m air-temperature sibling, and the full
    // constraint is stated on the probe status line and the place card. A
    // one-sentence caption that tried to carry everything would push the
    // sampling gates out.
    const omissions = lstCaptionConstraintOmissions("Daytime clear-sky land.");
    expect(omissions.map((o) => o.constraintId)).not.toContain(
      "radiometric-skin-temperature"
    );
  });

  it("matches case-insensitively", () => {
    expect(
      lstCaptionConstraintOmissions(
        "DAYTIME CLEAR-SKY LAND-SURFACE TEMPERATURE."
      )
    ).toEqual([]);
  });

  it("asserts no magnitude, direction, hazard or health claim", () => {
    // A caption audit reports which gate is unstated. It says nothing about how
    // large either gate's effect is, and this product asserts no direction at
    // all — see the module comment on why Terra's 10:30 crossing fixes no sign.
    const messages = lstCaptionConstraintOmissions("Land-surface temperature.")
      .map(formatLstCaptionOmission)
      .join(" ");
    expect(messages).not.toMatch(
      /heat ?wave|hazard|health|comfort|urban heat|forecast|warmer|cooler|°|\d+\s*K\b/i
    );
  });

  it("keeps the shipped caption inside the layer-caption length convention", () => {
    // The captions render on one line under the globe; 71 characters is the
    // longest the app ships, and the LST one must not become the new record.
    expect(LAYERS.lst.description.length).toBeLessThanOrEqual(71);
  });
});
