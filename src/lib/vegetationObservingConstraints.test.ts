import { describe, it, expect } from "vitest";
import {
  VEGETATION_OBSERVING_CONSTRAINTS,
  VEGETATION_OBSERVING_CONSTRAINT_LAYER_IDS,
  VEGETATION_OBSERVING_CONSTRAINT_LIMITS,
  VEGETATION_OBSERVING_CONSTRAINT_SOURCES,
  VEGETATION_OBSERVING_CONSTRAINT_GIBS_LAYERS,
  VEGETATION_SAMPLING_GATE_NOTES,
  probeVegetationSamplingGateClause,
  vegetationSamplingIdentityCsvHeaders,
  vegetationCaptionConstraintOmissions,
  formatVegetationCaptionOmission,
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

describe("vegetationSamplingIdentityCsvHeaders", () => {
  it("names every constraint the status line carries, for both layers", () => {
    // The download must not qualify a sampled column less completely than the
    // status line the reader has already closed. One header per constraint,
    // keyed by its id, plus the single direction line — so a fourth constraint
    // cannot ship export-less.
    for (const id of VEGETATION_OBSERVING_CONSTRAINT_LAYER_IDS) {
      const headers = vegetationSamplingIdentityCsvHeaders(id);
      expect(headers).toHaveLength(
        VEGETATION_OBSERVING_CONSTRAINTS[id].length + 1
      );
      for (const entry of VEGETATION_OBSERVING_CONSTRAINTS[id]) {
        const key = `# ${id}_${entry.id.replace(/-/g, "_")}: `;
        expect(headers.some((line) => line.startsWith(key))).toBe(true);
      }
    }
  });

  it("states that each row is a selected maximum, not the month's average", () => {
    // This is the misreading the export exists to prevent: `MOD13A3` is all the
    // file otherwise says about the product, and a column of dimensionless
    // index values looks exactly like a monthly mean of greenness.
    const text = vegetationSamplingIdentityCsvHeaders("ndvi").join("\n");
    expect(text).toContain("maximum-value composite");
    expect(text).toContain("highest NDVI");
    expect(text).toContain("not a time-average of the month's days");
  });

  it("states the clear-sky gate as a non-random subset of days", () => {
    // Cloud and snow are seasonal, so the days missing from a composite are not
    // a random sample of the month.
    for (const id of VEGETATION_OBSERVING_CONSTRAINT_LAYER_IDS) {
      const text = vegetationSamplingIdentityCsvHeaders(id).join("\n");
      expect(text).toContain("clear sunlit snow-free view");
      expect(text).toContain("non-random subset");
    }
  });

  it("asserts a sign for NDVI's selection and none for EVI's", () => {
    // The one substantive difference between the two exports, and the reason
    // the direction line is derived from `direction` rather than restated: the
    // compositing decision is made on NDVI, so only NDVI's kept value is bound
    // below by the average of its candidates.
    const ndvi = vegetationSamplingIdentityCsvHeaders("ndvi").join("\n");
    expect(ndvi).toContain(
      "# ndvi_sampling_direction: a sign is asserted only"
    );
    expect(ndvi).toContain("maximum_value_selection");
    expect(ndvi).toContain(
      "cannot sit below the average of the eligible observations"
    );

    const evi = vegetationSamplingIdentityCsvHeaders("evi").join("\n");
    expect(evi).toContain(
      "# evi_sampling_direction: no direction and no magnitude are asserted"
    );
    expect(evi).not.toContain("cannot sit below");
  });

  it("derives the direction line from the `direction` fields, not from prose", () => {
    // The export must not outlive the field it reports. A layer whose entries
    // are all `not-asserted` must produce the unsigned line, and one with a
    // signed entry must name that entry — checked against the data rather than
    // against a hand-written expectation.
    for (const id of VEGETATION_OBSERVING_CONSTRAINT_LAYER_IDS) {
      const signed = VEGETATION_OBSERVING_CONSTRAINTS[id].filter(
        (entry) => entry.direction !== "not-asserted"
      );
      const line = vegetationSamplingIdentityCsvHeaders(id).at(-1) ?? "";
      expect(line.startsWith(`# ${id}_sampling_direction: `)).toBe(true);
      expect(line.includes("a sign is asserted only")).toBe(signed.length > 0);
      for (const entry of signed) {
        expect(line).toContain(entry.id.replace(/-/g, "_"));
      }
    }
  });

  it("asserts no magnitude anywhere, and no ecological claim", () => {
    // Same standing prohibition the status line is held to: how far a composite
    // sits above its candidates' average is not observed by this app, and
    // nothing about cover, biomass or health follows from a compositing rule.
    for (const id of VEGETATION_OBSERVING_CONSTRAINT_LAYER_IDS) {
      const text = vegetationSamplingIdentityCsvHeaders(id).join("\n");
      // NDVI denies magnitude alone ("no magnitude is asserted anywhere here");
      // EVI denies it alongside direction ("no direction and no magnitude are
      // asserted"). Both must deny it, in whichever grammar the line takes.
      expect(text).toMatch(/no magnitude (is|are) asserted/);
      expect(text).not.toMatch(
        /biomass|habitat|ecological health|drought|greening|browning|\d+\s*%/i
      );
    }
  });

  it("obeys the CSV header contract: no delimiter, quote, or line break", () => {
    // A comma here would tear provenance into ragged cells for every reader
    // (see csvHeaderText in probe.ts); these lines are not scrubbed on the way
    // out, so the discipline has to hold at the source.
    for (const id of VEGETATION_OBSERVING_CONSTRAINT_LAYER_IDS) {
      for (const line of vegetationSamplingIdentityCsvHeaders(id)) {
        expect(line.startsWith("# ")).toBe(true);
        expect(line).not.toMatch(/[,"\r\n]/);
      }
    }
  });

  it("is silent for every layer but the two vegetation indices", () => {
    for (const id of LAYER_ORDER) {
      if (
        (
          VEGETATION_OBSERVING_CONSTRAINT_LAYER_IDS as readonly string[]
        ).includes(id)
      ) {
        continue;
      }
      expect(vegetationSamplingIdentityCsvHeaders(id)).toEqual([]);
    }
    expect(vegetationSamplingIdentityCsvHeaders(undefined)).toEqual([]);
  });

  it("goes silent if a layer is repointed at a different GIBS product", () => {
    // A stale maximum-value-composite claim attached to a different product
    // would be worse than no claim at all, and an exported file cannot be
    // corrected after the fact.
    for (const id of VEGETATION_OBSERVING_CONSTRAINT_LAYER_IDS) {
      expect(LAYERS[id].wmsLayer).toBe(
        VEGETATION_OBSERVING_CONSTRAINT_GIBS_LAYERS[id]
      );
    }
  });

  it("exports exactly when the status line speaks", () => {
    // The panel/CSV parity invariant: a quantity disclosed on screen and
    // withheld from the download leaves the two surfaces disagreeing about what
    // is known, and the file is the one that outlives the session.
    for (const id of LAYER_ORDER) {
      const clause = probeVegetationSamplingGateClause(id, true);
      const headers = vegetationSamplingIdentityCsvHeaders(id);
      expect(headers.length > 0).toBe(clause !== "");
    }
  });
});

describe("vegetationCaptionConstraintOmissions", () => {
  it("passes both captions the app actually ships", () => {
    // The guard exists to keep this true. `Legend` renders the description
    // verbatim under the globe, so a regression here ships to every reader who
    // never opens the probe.
    for (const layerId of VEGETATION_OBSERVING_CONSTRAINT_LAYER_IDS) {
      expect(
        vegetationCaptionConstraintOmissions(layerId).map(
          formatVegetationCaptionOmission
        )
      ).toEqual([]);
    }
  });

  it("catches the NDVI caption that shipped before this guard", () => {
    // The defect this fixed: a caption that named no gate at all, and framed
    // the layer as the seasonal-cycle signal — the very reading the
    // maximum-value selection bends.
    const omissions = vegetationCaptionConstraintOmissions(
      "ndvi",
      "Vegetation greenness — the classic seasonal-cycle signal."
    );
    expect(omissions.map((o) => o.constraintId)).toEqual([
      "clear-sky-optical-only",
      "maximum-value-selection",
      "composite-not-monthly-mean",
    ]);
    // The message quotes the constraint table rather than restating it, so the
    // two can never drift into disagreeing about the same product.
    const entry = VEGETATION_OBSERVING_CONSTRAINTS.ndvi.find(
      (c) => c.id === "maximum-value-selection"
    )!;
    const reported = omissions.find(
      (o) => o.constraintId === "maximum-value-selection"
    )!;
    expect(reported.constraint).toBe(entry.constraint);
    expect(reported.implication).toBe(entry.implication);
  });

  it("catches the EVI caption that shipped before this guard", () => {
    const omissions = vegetationCaptionConstraintOmissions(
      "evi",
      "Enhanced vegetation index — less saturated over dense canopy."
    );
    expect(omissions.map((o) => o.constraintId)).toEqual([
      "clear-sky-optical-only",
      "composite-not-monthly-mean",
    ]);
  });

  it("never requires an EVI caption to claim a maximum it does not have", () => {
    // Deliberate, and the one asymmetry between the two layers: the composite
    // selects on NDVI and EVI inherits the kept observation, so "max-value" in
    // an EVI caption would assert an inequality that does not hold. The probe
    // status line and the exported CSV carry the honest version in full.
    const omissions = vegetationCaptionConstraintOmissions(
      "evi",
      "Clear-sky composite."
    );
    expect(omissions.map((o) => o.constraintId)).not.toContain(
      "maximum-value-selection"
    );
    // NDVI, whose selection does fix a sign, must still be required to say so.
    expect(
      vegetationCaptionConstraintOmissions("ndvi", "Clear-sky composite.").map(
        (o) => o.constraintId
      )
    ).toEqual(["maximum-value-selection"]);
  });

  it("accepts any declared surface form of a gate", () => {
    // Wording is a copy decision; the check is about what was said, not how.
    for (const clearPhrase of ["clear sky", "cloud-free", "cloud-screened"]) {
      expect(
        vegetationCaptionConstraintOmissions(
          "evi",
          `Enhanced index — ${clearPhrase} composite.`
        )
      ).toEqual([]);
    }
    for (const maxPhrase of ["maximum-value", "maximum value", "highest"]) {
      expect(
        vegetationCaptionConstraintOmissions(
          "ndvi",
          `Greenness — clear-sky ${maxPhrase} composite.`
        )
      ).toEqual([]);
    }
  });

  it("matches case-insensitively", () => {
    expect(
      vegetationCaptionConstraintOmissions(
        "ndvi",
        "GREENNESS — CLEAR-SKY MAX-VALUE COMPOSITE, NOT A MONTHLY MEAN."
      )
    ).toEqual([]);
  });

  it("asserts no magnitude, ecological or hazard claim", () => {
    // A caption audit reports which gate is unstated. It says nothing about how
    // large the selection's effect is, and nothing about the vegetation itself.
    const messages = VEGETATION_OBSERVING_CONSTRAINT_LAYER_IDS.flatMap((id) =>
      vegetationCaptionConstraintOmissions(id, "Vegetation.")
    )
      .map(formatVegetationCaptionOmission)
      .join(" ");
    expect(messages).not.toMatch(
      /biomass|habitat|biodiversity|ecological health|drought|healthy|degraded|forecast|greener|browner|\d+\s*%/i
    );
  });

  it("keeps both shipped captions inside the layer-caption length convention", () => {
    // The captions render on one line under the globe; 71 characters is the
    // longest the app ships, and neither vegetation caption may become the new
    // record.
    for (const layerId of VEGETATION_OBSERVING_CONSTRAINT_LAYER_IDS) {
      expect(LAYERS[layerId].description.length).toBeLessThanOrEqual(71);
    }
  });
});
