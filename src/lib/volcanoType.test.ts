import { describe, it, expect } from "vitest";
import {
  canonicalVolcanoType,
  canonicalVolcanoTypeLabel,
  summarizeVolcanoTypes,
  volcanoTypeCompositionText,
} from "./volcanoType";
import { GVP_VOLCANO_SOURCE } from "./volcanoContext";
import type { Volcano } from "./volcanoes";

const volcano = (overrides: Partial<Volcano> = {}): Volcano => ({
  name: "Etna",
  lat: 37.748,
  lon: 14.999,
  type: "Stratovolcano",
  elevation: 3357,
  lastEruptionYear: 2025,
  country: "Italy",
  ...overrides,
});

describe("canonicalVolcanoType", () => {
  it("returns a plain landform unchanged", () => {
    expect(canonicalVolcanoType("Stratovolcano")).toEqual({
      base: "Stratovolcano",
      isMultiple: false,
      isUncertain: false,
      raw: "Stratovolcano",
    });
  });

  it('peels a trailing "(s)" as a multiplicity flag', () => {
    expect(canonicalVolcanoType("Pyroclastic cone(s)")).toEqual({
      base: "Pyroclastic cone",
      isMultiple: true,
      isUncertain: false,
      raw: "Pyroclastic cone(s)",
    });
  });

  it('peels a trailing "(es)" as a multiplicity flag', () => {
    expect(canonicalVolcanoType("Stratovolcano(es)")).toMatchObject({
      base: "Stratovolcano",
      isMultiple: true,
      isUncertain: false,
    });
  });

  it('peels a trailing "?" as an uncertainty flag', () => {
    expect(canonicalVolcanoType("Stratovolcano?")).toMatchObject({
      base: "Stratovolcano",
      isMultiple: false,
      isUncertain: true,
    });
  });

  it("peels combined markers regardless of order", () => {
    expect(canonicalVolcanoType("Stratovolcano(es)?")).toMatchObject({
      base: "Stratovolcano",
      isMultiple: true,
      isUncertain: true,
    });
    expect(canonicalVolcanoType("Stratovolcano?(es)")).toMatchObject({
      base: "Stratovolcano",
      isMultiple: true,
      isUncertain: true,
    });
  });

  it("trims surrounding whitespace but keeps the original as raw", () => {
    expect(canonicalVolcanoType("  Shield  ")).toEqual({
      base: "Shield",
      isMultiple: false,
      isUncertain: false,
      raw: "  Shield  ",
    });
  });

  it("leaves an unrecognized trailing parenthetical untouched", () => {
    expect(canonicalVolcanoType("Shield(pyroclastic)")).toEqual({
      base: "Shield(pyroclastic)",
      isMultiple: false,
      isUncertain: false,
      raw: "Shield(pyroclastic)",
    });
  });

  it("reports a null base for missing or blank types", () => {
    for (const input of [null, undefined, "", "   ", "?"]) {
      const result = canonicalVolcanoType(input);
      expect(result.base).toBeNull();
    }
    expect(canonicalVolcanoType(null).raw).toBeNull();
    expect(canonicalVolcanoType("   ").raw).toBe("   ");
    // A bare "?" carries an uncertainty marker but no landform.
    expect(canonicalVolcanoType("?")).toMatchObject({
      base: null,
      isUncertain: true,
    });
  });
});

describe("canonicalVolcanoTypeLabel", () => {
  it("shows a plain landform with no qualifiers", () => {
    expect(canonicalVolcanoTypeLabel(canonicalVolcanoType("Shield"))).toBe(
      "Shield"
    );
  });

  it("annotates multiplicity and uncertainty", () => {
    expect(
      canonicalVolcanoTypeLabel(canonicalVolcanoType("Pyroclastic cone(s)"))
    ).toBe("Pyroclastic cone (multiple landforms)");
    expect(
      canonicalVolcanoTypeLabel(canonicalVolcanoType("Stratovolcano?"))
    ).toBe("Stratovolcano (type uncertain)");
    expect(
      canonicalVolcanoTypeLabel(canonicalVolcanoType("Stratovolcano(es)?"))
    ).toBe("Stratovolcano (multiple landforms; type uncertain)");
  });

  it("is explicit when no type was recorded", () => {
    expect(canonicalVolcanoTypeLabel(canonicalVolcanoType(null))).toBe(
      "Volcano type not recorded"
    );
  });
});

describe("summarizeVolcanoTypes", () => {
  it("folds surface variants into a shared base landform", () => {
    const summary = summarizeVolcanoTypes([
      volcano({ type: "Stratovolcano" }),
      volcano({ type: "Stratovolcano(es)" }),
      volcano({ type: "Stratovolcano?" }),
      volcano({ type: "Shield" }),
    ]);
    expect(summary.totalCount).toBe(4);
    expect(summary.recordsWithoutType).toBe(0);
    expect(summary.tallies).toEqual([
      { base: "Stratovolcano", count: 3 },
      { base: "Shield", count: 1 },
    ]);
  });

  it("counts records without a usable type separately", () => {
    const summary = summarizeVolcanoTypes([
      volcano({ type: null }),
      volcano({ type: "   " }),
      volcano({ type: "Caldera" }),
    ]);
    expect(summary.recordsWithoutType).toBe(2);
    expect(summary.tallies).toEqual([{ base: "Caldera", count: 1 }]);
  });

  it("orders ties by label ascending and retains provenance", () => {
    const summary = summarizeVolcanoTypes([
      volcano({ type: "Shield" }),
      volcano({ type: "Caldera" }),
    ]);
    expect(summary.tallies.map((t) => t.base)).toEqual(["Caldera", "Shield"]);
    expect(summary.provenance).toBe(GVP_VOLCANO_SOURCE);
    expect(summary.kind).toBe("gvp-volcano-type-summary");
  });

  it("handles an empty dataset", () => {
    const summary = summarizeVolcanoTypes([]);
    expect(summary.totalCount).toBe(0);
    expect(summary.tallies).toEqual([]);
    expect(summary.recordsWithoutType).toBe(0);
  });
});

describe("volcanoTypeCompositionText", () => {
  const types = (list: readonly (string | null)[]) =>
    summarizeVolcanoTypes(list.map((type) => volcano({ type })));

  it("returns null when nothing matched, so the line stays hidden", () => {
    expect(volcanoTypeCompositionText(types([]))).toBeNull();
  });

  it("names every landform and the total when the set is small", () => {
    const text = volcanoTypeCompositionText(
      types(["Caldera", "Complex", "Stratovolcano"])
    );
    expect(text).toContain("across all 3 matched records");
    expect(text).toContain("Caldera 1, Complex 1, Stratovolcano 1");
    expect(text).not.toContain("further landform");
  });

  it("names four landforms rather than three and a remainder of one", () => {
    const text = volcanoTypeCompositionText(
      types(["Shield", "Shield", "Caldera", "Maar", "Complex"])
    );
    expect(text).toContain("Shield 2, Caldera 1, Complex 1, Maar 1");
    expect(text).not.toContain("further landform");
  });

  it("names the three largest and counts the rest beyond four landforms", () => {
    const text = volcanoTypeCompositionText(
      types([
        "Stratovolcano",
        "Stratovolcano",
        "Stratovolcano",
        "Shield",
        "Shield",
        "Caldera",
        "Maar",
        "Complex",
      ])
    );
    expect(text).toContain(
      "Stratovolcano 3, Shield 2, Caldera 1, and 2 further landform types"
    );
  });

  it("describes the order by count, never as a superlative", () => {
    // Counts tie constantly in a small extent and the tie-break is
    // alphabetical, so "most common first" would misdescribe this set.
    const text = volcanoTypeCompositionText(
      types(["Caldera", "Complex", "Stratovolcano"])
    );
    expect(text).toContain("ordered by count");
    expect(text).not.toContain("most common");
    expect(text).not.toContain("largest");
  });

  it("omits the ordering clause for a single landform", () => {
    const text = volcanoTypeCompositionText(types(["Shield", "Shield"]));
    expect(text).toContain("across all 2 matched records: Shield 2");
    expect(text).not.toContain("ordered by count");
  });

  it("uses the singular for one matched record", () => {
    const text = volcanoTypeCompositionText(types(["Volcanic field"]));
    expect(text).toContain("across all 1 matched record");
    expect(text).not.toContain("matched records");
  });

  it("discloses folded qualifier markers only when the set carries them", () => {
    expect(
      volcanoTypeCompositionText(types(["Shield", "Caldera"]))
    ).not.toContain("marker");
    expect(
      volcanoTypeCompositionText(types(["Shield(s)", "Caldera?", "Maar"]))
    ).toContain(
      "2 of the tallied records carry GVP's multiplicity or uncertainty marker"
    );
  });

  it("agrees the folded clause when exactly one tallied record is folded", () => {
    const text = volcanoTypeCompositionText(
      types(["Shield(s)", "Caldera", "Maar"])
    );
    expect(text).toContain(
      "1 of the tallied records carries GVP's multiplicity or uncertainty marker and is counted under the base landform."
    );
    expect(text).not.toContain("tallied record carry");
  });

  it("names the lone tallied record rather than counting it against itself", () => {
    const text = volcanoTypeCompositionText(types(["Stratovolcano?"]));
    expect(text).toContain(
      "The single tallied record carries GVP's multiplicity or uncertainty marker and is counted under the base landform."
    );
    expect(text).not.toContain("1 of the tallied");
  });

  it("reports records that supplied no landform label", () => {
    const text = volcanoTypeCompositionText(types(["Shield", null]));
    expect(text).toContain("1 matched record supplied no landform label");
    expect(text).toContain("Shield 1");
  });

  it("says so plainly when no record supplied a landform label", () => {
    expect(volcanoTypeCompositionText(types([null, "  ", "?"]))).toBe(
      "No landform label is recorded for the 3 matched records."
    );
  });

  it("never reports morphology as activity, size, or hazard", () => {
    expect(volcanoTypeCompositionText(types(["Stratovolcano"]))).toContain(
      "These are catalogued morphology labels, not a measure of size, activity, or hazard."
    );
  });
});

describe("summarizeVolcanoTypes qualifier folding", () => {
  it("counts only tallied records as folded", () => {
    // "?" alone yields no base landform, so it is reported as an absent label
    // rather than as a record whose landform was reinterpreted.
    const summary = summarizeVolcanoTypes([
      volcano({ type: "Shield(s)" }),
      volcano({ type: "Caldera?" }),
      volcano({ type: "Maar" }),
      volcano({ type: "?" }),
    ]);
    expect(summary.foldedRecordCount).toBe(2);
    expect(summary.recordsWithoutType).toBe(1);
  });

  it("reports zero folding for plain landform labels", () => {
    expect(
      summarizeVolcanoTypes([volcano({ type: "Shield" })]).foldedRecordCount
    ).toBe(0);
  });
});
