import { describe, it, expect } from "vitest";
import type { PlateBoundary } from "./plates";
import {
  PB2002_PLATE_NAMES,
  decodePlatePair,
  plateName,
  platesInBoundaries,
  subductionPolarityCoverage,
  subductionSummary,
} from "./platePairs";

const boundary = (name: string): PlateBoundary => ({
  name,
  points: [
    [0, 0],
    [1, 1],
  ],
});

describe("PB2002_PLATE_NAMES", () => {
  it("enumerates the 52 PB2002 plates from Bird (2003)", () => {
    expect(Object.keys(PB2002_PLATE_NAMES)).toHaveLength(52);
    expect(PB2002_PLATE_NAMES.AF).toBe("Africa");
    expect(PB2002_PLATE_NAMES.NZ).toBe("Nazca");
    expect(PB2002_PLATE_NAMES.SO).toBe("Somalia");
    expect(PB2002_PLATE_NAMES.YA).toBe("Yangtze");
  });

  it("is frozen so callers cannot mutate the shared vocabulary", () => {
    expect(Object.isFrozen(PB2002_PLATE_NAMES)).toBe(true);
    expect(() => {
      (PB2002_PLATE_NAMES as Record<string, string>).AF = "tampered";
    }).toThrow();
    expect(PB2002_PLATE_NAMES.AF).toBe("Africa");
  });
});

describe("plateName", () => {
  it("resolves known codes case- and whitespace-insensitively", () => {
    expect(plateName("PA")).toBe("Pacific");
    expect(plateName("pa")).toBe("Pacific");
    expect(plateName("  AN  ")).toBe("Antarctica");
  });

  it("returns null for codes outside the vocabulary", () => {
    expect(plateName("ZZ")).toBeNull();
    expect(plateName("")).toBeNull();
  });
});

describe("decodePlatePair", () => {
  it("decodes a hyphenated pair into both bordering plates", () => {
    const decoded = decodePlatePair("AF-AN");
    expect(decoded).not.toBeNull();
    expect(decoded!.plates).toEqual([
      { code: "AF", name: "Africa" },
      { code: "AN", name: "Antarctica" },
    ]);
    expect(decoded!.separator).toBe("-");
    expect(decoded!.recognized).toBe(true);
    expect(decoded!.label).toBe("AF-AN");
  });

  it("accepts slash and backslash delimiters", () => {
    expect(decodePlatePair("EU/AF")!.separator).toBe("/");
    expect(decodePlatePair("AU\\PA")!.separator).toBe("\\");
    expect(decodePlatePair("AU\\PA")!.plates.map((p) => p.name)).toEqual([
      "Australia",
      "Pacific",
    ]);
  });

  it("collapses order and delimiter into a shared canonical key", () => {
    const key = "AF-AN";
    expect(decodePlatePair("AF-AN")!.canonicalKey).toBe(key);
    expect(decodePlatePair("AN-AF")!.canonicalKey).toBe(key);
    expect(decodePlatePair("AN\\AF")!.canonicalKey).toBe(key);
    expect(decodePlatePair("AN/AF")!.canonicalKey).toBe(key);
  });

  it("surfaces unknown codes as name null rather than dropping them", () => {
    const decoded = decodePlatePair("AF-ZZ");
    expect(decoded).not.toBeNull();
    expect(decoded!.plates[1]).toEqual({ code: "ZZ", name: null });
    expect(decoded!.recognized).toBe(false);
    expect(decoded!.canonicalKey).toBe("AF-ZZ");
  });

  it("normalizes lower-case codes to upper case", () => {
    const decoded = decodePlatePair("na-pa");
    expect(decoded!.plates).toEqual([
      { code: "NA", name: "North America" },
      { code: "PA", name: "Pacific" },
    ]);
    expect(decoded!.canonicalKey).toBe("NA-PA");
  });

  it("returns null for labels that are not a two-code pair", () => {
    expect(decodePlatePair("")).toBeNull();
    expect(decodePlatePair("AF")).toBeNull();
    expect(decodePlatePair("AF-AN-PA")).toBeNull();
    expect(decodePlatePair("AFR-ANT")).toBeNull();
    expect(decodePlatePair("A-B")).toBeNull();
  });
});

describe("decodePlatePair subduction polarity", () => {
  it("reads '/' as the right-hand plate descending under the left", () => {
    // Bird (2003) byte 3: "/" = right-hand plate subducts under left-hand.
    const decoded = decodePlatePair("KE/PA")!;
    expect(decoded.subduction.encoded).toBe(true);
    expect(decoded.subduction.subducting).toEqual({
      code: "PA",
      name: "Pacific",
    });
    expect(decoded.subduction.overriding).toEqual({
      code: "KE",
      name: "Kermadec",
    });
  });

  it("reads '\\' as the opposite polarity: left descends under right", () => {
    const decoded = decodePlatePair("NZ\\SA")!;
    expect(decoded.subduction.encoded).toBe(true);
    expect(decoded.subduction.subducting).toEqual({
      code: "NZ",
      name: "Nazca",
    });
    expect(decoded.subduction.overriding).toEqual({
      code: "SA",
      name: "South America",
    });
  });

  it("treats a hyphen as an explicit non-subducting segment, not missing data", () => {
    const decoded = decodePlatePair("AF-AN")!;
    expect(decoded.subduction).toEqual({
      encoded: false,
      subducting: null,
      overriding: null,
    });
  });

  it("resolves the polarity of known subduction zones as mapped by PB2002", () => {
    // Each pair is a well-documented margin; the expected descending plate is
    // the one PB2002's delimiter records, checked against the real geometry.
    const cases: [string, string, string][] = [
      ["NZ\\SA", "Nazca", "South America"], // Peru-Chile trench
      ["CO\\NA", "Cocos", "North America"], // Middle America trench
      ["JF\\NA", "Juan de Fuca", "North America"], // Cascadia
      ["PA\\OK", "Pacific", "Okhotsk"], // Japan / Kuril trench
      ["SU/AU", "Australia", "Sunda"], // Java (Sunda) trench
      ["TO/PA", "Pacific", "Tonga"], // Tonga trench
      ["EU/AF", "Africa", "Eurasia"], // Hellenic / Calabrian arc
      ["NH/AU", "Australia", "New Hebrides"], // Vanuatu trench
    ];
    for (const [label, subducting, overriding] of cases) {
      expect(subductionSummary(decodePlatePair(label)!)).toBe(
        `${subducting} subducts beneath ${overriding}`
      );
    }
  });

  it("keeps polarity independent of the canonical grouping key", () => {
    // "PA\\AU" and "PA/AU" share a pair but record opposite polarities.
    const left = decodePlatePair("PA\\AU")!;
    const right = decodePlatePair("PA/AU")!;
    expect(left.canonicalKey).toBe(right.canonicalKey);
    expect(left.subduction.subducting!.code).toBe("PA");
    expect(right.subduction.subducting!.code).toBe("AU");
  });

  it("falls back to the raw code for plates outside the vocabulary", () => {
    expect(subductionSummary(decodePlatePair("ZZ/AF")!)).toBe(
      "Africa subducts beneath ZZ"
    );
  });

  it("summarizes nothing for a non-subducting segment", () => {
    expect(subductionSummary(decodePlatePair("AF-AN")!)).toBeNull();
  });
});

describe("subductionPolarityCoverage", () => {
  it("splits supplied boundaries across byte-3 classes", () => {
    expect(
      subductionPolarityCoverage([
        boundary("NZ\\SA"),
        boundary("SU/AU"),
        boundary("AF-AN"),
        boundary(""),
      ])
    ).toEqual({
      subductionEncodedCount: 2,
      nonSubductingCount: 1,
      undecodableCount: 1,
    });
  });

  it("counts every supplied boundary exactly once", () => {
    const boundaries = [
      boundary("NZ\\SA"),
      boundary("AF-AN"),
      boundary("not-a-pair-name"),
      boundary("KE/PA"),
    ];
    const coverage = subductionPolarityCoverage(boundaries);
    const total =
      coverage.subductionEncodedCount +
      coverage.nonSubductingCount +
      coverage.undecodableCount;
    expect(total).toBe(boundaries.length);
  });

  it("returns zeroed counts for no boundaries", () => {
    expect(subductionPolarityCoverage([])).toEqual({
      subductionEncodedCount: 0,
      nonSubductingCount: 0,
      undecodableCount: 0,
    });
  });
});

describe("platesInBoundaries", () => {
  it("inventories which plates border the supplied polylines with counts", () => {
    const inventory = platesInBoundaries([
      boundary("NA-PA"),
      boundary("PA-NZ"),
      boundary("AN\\NZ"),
    ]);
    expect(inventory).toEqual([
      { code: "AN", name: "Antarctica", boundaryCount: 1 },
      { code: "NA", name: "North America", boundaryCount: 1 },
      { code: "NZ", name: "Nazca", boundaryCount: 2 },
      { code: "PA", name: "Pacific", boundaryCount: 2 },
    ]);
  });

  it("ignores undecodable labels, including unlabeled features", () => {
    const inventory = platesInBoundaries([
      boundary(""),
      boundary("not-a-pair-name"),
      boundary("AF-AN"),
    ]);
    expect(inventory).toEqual([
      { code: "AF", name: "Africa", boundaryCount: 1 },
      { code: "AN", name: "Antarctica", boundaryCount: 1 },
    ]);
  });

  it("retains unknown codes with a null name", () => {
    const inventory = platesInBoundaries([boundary("AF-ZZ")]);
    expect(inventory).toEqual([
      { code: "AF", name: "Africa", boundaryCount: 1 },
      { code: "ZZ", name: null, boundaryCount: 1 },
    ]);
  });

  it("returns an empty inventory for no boundaries", () => {
    expect(platesInBoundaries([])).toEqual([]);
  });
});
