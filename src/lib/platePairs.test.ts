import { describe, it, expect } from "vitest";
import type { PlateBoundary } from "./plates";
import {
  PB2002_PLATE_NAMES,
  decodePlatePair,
  plateName,
  platesInBoundaries,
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
