import { describe, expect, it } from "vitest";
import {
  BRIEF_DIGEST_ALGORITHM,
  BRIEF_DIGEST_VERSION,
  computeBriefDigest,
} from "./briefDigest";
import {
  composeEnvironmentBrief,
  type EnvironmentBriefInput,
} from "./environmentBrief";

/** A full four-signal brief dated to a single, published month. */
function fullBrief(overrides: Partial<EnvironmentBriefInput> = {}) {
  return composeEnvironmentBrief({
    vegetation: { dataMonth: { year: 2026, month: 1 }, value: 0.61 },
    rainfall: { dataMonth: { year: 2026, month: 1 }, value: 0.00012 },
    soilMoisture: { dataMonth: { year: 2026, month: 1 }, value: 6.4 },
    airTemperature: { dataMonth: { year: 2026, month: 1 }, value: 289.4 },
    availableThrough: { year: 2026, month: 1 },
    ...overrides,
  });
}

const DIGEST_PATTERN = /^ev1-[0-9a-f]{16}$/;

describe("environment brief reproducibility digest", () => {
  it("emits a versioned, fixed-width hex fingerprint", () => {
    const result = computeBriefDigest(fullBrief().signals);

    expect(result.version).toBe(BRIEF_DIGEST_VERSION);
    expect(result.algorithm).toBe(BRIEF_DIGEST_ALGORITHM);
    expect(result.digest).toMatch(DIGEST_PATTERN);
    expect(result.signalCount).toBe(4);
    expect(result.entries).toHaveLength(4);
  });

  it("is deterministic: identical inputs fold to identical digests", () => {
    expect(computeBriefDigest(fullBrief().signals).digest).toBe(
      computeBriefDigest(fullBrief().signals).digest
    );
  });

  it("is order-independent: reordering the signals never moves the digest", () => {
    const signals = fullBrief().signals;
    const reversed = [...signals].reverse();

    expect(computeBriefDigest(reversed).digest).toBe(
      computeBriefDigest(signals).digest
    );
    // Entries are always reported in id order regardless of input order.
    expect(computeBriefDigest(reversed).entries.map((e) => e.id)).toEqual([
      "air-temperature",
      "rainfall",
      "soil-moisture",
      "vegetation",
    ]);
  });

  it("moves when an observed value changes", () => {
    const base = computeBriefDigest(fullBrief().signals).digest;
    const nudged = computeBriefDigest(
      fullBrief({
        airTemperature: { dataMonth: { year: 2026, month: 1 }, value: 289.5 },
      }).signals
    ).digest;

    expect(nudged).not.toBe(base);
    expect(nudged).toMatch(DIGEST_PATTERN);
  });

  it("moves when a data month changes", () => {
    const base = computeBriefDigest(fullBrief().signals).digest;
    const shifted = computeBriefDigest(
      fullBrief({
        rainfall: { dataMonth: { year: 2025, month: 12 }, value: 0.00012 },
        availableThrough: { year: 2026, month: 1 },
      }).signals
    ).digest;

    expect(shifted).not.toBe(base);
  });

  it("moves when a signal's status changes", () => {
    const base = computeBriefDigest(fullBrief().signals).digest;
    // Drop vegetation to a no-data state (null value): same month, different status.
    const noData = computeBriefDigest(
      fullBrief({
        vegetation: { dataMonth: { year: 2026, month: 1 }, value: null },
      }).signals
    ).digest;

    expect(noData).not.toBe(base);
  });

  it("moves when the cited source coverage fraction changes", () => {
    const base = computeBriefDigest(fullBrief().signals).digest;
    const partial = computeBriefDigest(
      fullBrief({
        vegetation: {
          dataMonth: { year: 2026, month: 1 },
          value: 0.61,
          validFraction: 0.5,
        },
      }).signals
    ).digest;

    expect(partial).not.toBe(base);
  });

  it("folds data, not prose: the manifest carries no statement text", () => {
    const result = computeBriefDigest(fullBrief().signals);

    expect(result.manifest.startsWith(`${BRIEF_DIGEST_VERSION}\n4\n`)).toBe(
      true
    );
    // The signal's human statement sentence must not leak into the folded input.
    expect(result.manifest).not.toContain("observed for");
    expect(result.manifest).not.toContain("source ");
    // But the citation identity (short name + DOI) is folded and never dropped.
    expect(result.manifest).toContain("MOD13A3");
    expect(result.manifest).toContain("GLDAS_NOAH025_M");
  });

  it("preserves every signal's source identity in its entry", () => {
    const veg = computeBriefDigest(fullBrief().signals).entries.find(
      (e) => e.id === "vegetation"
    );

    expect(veg?.source.shortName).toBe("MOD13A3");
    expect(veg?.source.doi.length).toBeGreaterThan(0);
    expect(veg?.canonical).toContain("MOD13A3");
  });

  it("folds -0 and 0 to the same fingerprint", () => {
    const positive = computeBriefDigest(
      fullBrief({
        rainfall: { dataMonth: { year: 2026, month: 1 }, value: 0 },
      }).signals
    ).digest;
    const negativeZero = computeBriefDigest(
      fullBrief({
        rainfall: { dataMonth: { year: 2026, month: 1 }, value: -0 },
      }).signals
    ).digest;

    expect(negativeZero).toBe(positive);
  });

  it("handles an empty signal set without throwing", () => {
    const result = computeBriefDigest([]);

    expect(result.signalCount).toBe(0);
    expect(result.entries).toEqual([]);
    expect(result.digest).toMatch(DIGEST_PATTERN);
    expect(result.statement).toContain("over 0 signals");
  });

  it("writes a caption-ready statement that stays a fingerprint, not a score", () => {
    const result = computeBriefDigest(fullBrief().signals);

    expect(result.statement).toContain(result.digest);
    expect(result.statement).toContain("not a quality or condition score");
    // Names the folded signals so a caption reader knows the scope.
    expect(result.statement).toContain("vegetation");
  });
});
