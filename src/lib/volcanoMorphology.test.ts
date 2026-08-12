import { describe, expect, it } from "vitest";
import {
  canonicalVolcanoType,
  canonicalVolcanoTypeLabel,
} from "./volcanoMorphology";

/**
 * The GVP primary-volcano-type qualifier grammar, pinned. These strings reach
 * users directly through volcanoHoverLabel() and group the type tallies in
 * summarizeVolcanoTypes(), so a change in what counts as a recognized
 * qualifier is a change in what the map claims about a landform.
 */

describe("canonicalVolcanoType", () => {
  it("passes an unqualified type through untouched", () => {
    expect(canonicalVolcanoType("Stratovolcano")).toEqual({
      base: "Stratovolcano",
      isMultiple: false,
      isUncertain: false,
      raw: "Stratovolcano",
    });
  });

  it('reads "(s)" and "(es)" as multiplicity, not part of the landform name', () => {
    expect(canonicalVolcanoType("Shield(s)")).toMatchObject({
      base: "Shield",
      isMultiple: true,
      isUncertain: false,
    });
    expect(canonicalVolcanoType("Stratovolcano(es)")).toMatchObject({
      base: "Stratovolcano",
      isMultiple: true,
      isUncertain: false,
    });
  });

  it('reads a trailing "?" as GVP marking the assignment uncertain', () => {
    expect(canonicalVolcanoType("Stratovolcano?")).toMatchObject({
      base: "Stratovolcano",
      isMultiple: false,
      isUncertain: true,
    });
  });

  it("strips multiplicity and uncertainty together, in either order", () => {
    expect(canonicalVolcanoType("Stratovolcano(es)?")).toMatchObject({
      base: "Stratovolcano",
      isMultiple: true,
      isUncertain: true,
    });
    expect(canonicalVolcanoType("Stratovolcano?(s)")).toMatchObject({
      base: "Stratovolcano",
      isMultiple: true,
      isUncertain: true,
    });
  });

  it("tolerates whitespace around and between qualifiers", () => {
    expect(canonicalVolcanoType("  Lava dome(s) ? ")).toMatchObject({
      base: "Lava dome",
      isMultiple: true,
      isUncertain: true,
    });
  });

  it("retains the source string verbatim as raw", () => {
    expect(canonicalVolcanoType("  Lava dome(s) ? ").raw).toBe(
      "  Lava dome(s) ? "
    );
  });

  it("leaves an unrecognized parenthetical intact rather than guessing", () => {
    // "Shield(pyroclastic)" is a real GVP label: the parenthetical qualifies
    // the landform, it is not a multiplicity marker, so it must survive.
    expect(canonicalVolcanoType("Shield(pyroclastic)")).toMatchObject({
      base: "Shield(pyroclastic)",
      isMultiple: false,
      isUncertain: false,
    });
  });

  it("does not invent multiplicity from a bare plural word", () => {
    // "Crater rows" is plural in English but carries no GVP marker; the
    // parser reports only what the label encodes.
    expect(canonicalVolcanoType("Crater rows")).toMatchObject({
      base: "Crater rows",
      isMultiple: false,
    });
  });

  it("reports a missing or blank type as absent, never as a guessed label", () => {
    for (const absent of [null, undefined, "", "   "]) {
      expect(canonicalVolcanoType(absent).base).toBeNull();
    }
    expect(canonicalVolcanoType(null).raw).toBeNull();
    expect(canonicalVolcanoType("").raw).toBe("");
  });

  it("keeps qualifiers even when nothing is left to qualify", () => {
    // A degenerate label still reports what it encoded rather than throwing.
    expect(canonicalVolcanoType("(s)?")).toMatchObject({
      base: null,
      isMultiple: true,
      isUncertain: true,
    });
  });
});

describe("canonicalVolcanoTypeLabel", () => {
  it("renders an unqualified landform as the bare base", () => {
    expect(canonicalVolcanoTypeLabel(canonicalVolcanoType("Caldera"))).toBe(
      "Caldera"
    );
  });

  it("spells out multiplicity and uncertainty instead of leaving punctuation", () => {
    expect(canonicalVolcanoTypeLabel(canonicalVolcanoType("Shield(s)"))).toBe(
      "Shield (multiple landforms)"
    );
    expect(
      canonicalVolcanoTypeLabel(canonicalVolcanoType("Stratovolcano?"))
    ).toBe("Stratovolcano (type uncertain)");
    expect(
      canonicalVolcanoTypeLabel(canonicalVolcanoType("Stratovolcano(es)?"))
    ).toBe("Stratovolcano (multiple landforms; type uncertain)");
  });

  it("says the type is unrecorded rather than emitting an empty label", () => {
    expect(canonicalVolcanoTypeLabel(canonicalVolcanoType(null))).toBe(
      "Volcano type not recorded"
    );
  });
});
