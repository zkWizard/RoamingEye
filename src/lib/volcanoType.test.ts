import { describe, it, expect } from "vitest";
import {
  canonicalVolcanoType,
  canonicalVolcanoTypeLabel,
  summarizeVolcanoTypes,
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
