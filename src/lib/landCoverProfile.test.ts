import { describe, expect, it } from "vitest";
import { summarizeLandCoverContext } from "./landCover";
import { buildLandCoverClassProfile } from "./landCoverProfile";

describe("buildLandCoverClassProfile", () => {
  it("emits the complete source legend with explicit observed and zero-count rows", () => {
    const context = summarizeLandCoverContext(
      [
        { classCode: 1, sampleCount: 3 },
        { classCode: 12, sampleCount: 1 },
        { classCode: 255, sampleCount: 2 },
        { classCode: null, sampleCount: 2 },
      ],
      2024
    );

    const profile = buildLandCoverClassProfile(context);

    expect(profile.status).toBe("available");
    expect(profile.reason).toBeNull();
    expect(profile.rows).toHaveLength(18);
    expect(profile.rows.map((row) => row.classCode)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 255,
    ]);
    expect(profile.rows[0]).toMatchObject({
      classCode: 1,
      status: "observed",
      sampleCount: 3,
      fractionOfAllSamples: 3 / 8,
      fractionOfKnownLandCover: 3 / 4,
    });
    expect(profile.rows[1]).toMatchObject({
      classCode: 2,
      status: "not-observed-in-counted-sample",
      sampleCount: 0,
      fractionOfAllSamples: 0,
      fractionOfKnownLandCover: 0,
    });
    expect(profile.rows.at(-1)).toMatchObject({
      classCode: 255,
      status: "observed",
      sampleCount: 2,
      fractionOfAllSamples: 2 / 8,
      fractionOfKnownLandCover: null,
    });
    expect(profile.provenance).toBe(context.provenance);
    expect(profile.coverage).toBe(context.coverage);
  });

  it("withholds row values when no counted sample was supplied", () => {
    const profile = buildLandCoverClassProfile(
      summarizeLandCoverContext([], 2024)
    );

    expect(profile.status).toBe("unavailable");
    expect(profile.reason).toBe("no-counted-samples");
    expect(profile.rows.every((row) => row.status === "unavailable")).toBe(
      true
    );
    expect(profile.rows.every((row) => row.sampleCount === null)).toBe(true);
  });

  it("does not present supplied counts as an observation for an unpublished year", () => {
    const context = summarizeLandCoverContext(
      [{ classCode: 10, sampleCount: 5 }],
      2025
    );
    const profile = buildLandCoverClassProfile(context);

    expect(profile.status).toBe("unavailable");
    expect(profile.reason).toBe("unpublished-data-year");
    expect(profile.rows.every((row) => row.sampleCount === null)).toBe(true);
    expect(profile.coverage.knownLandCoverSampleCount).toBe(5);
    expect(profile.provenance.dataYear).toBe(2025);
  });

  it("keeps counted unclassified coverage but withholds known-class fractions", () => {
    const profile = buildLandCoverClassProfile(
      summarizeLandCoverContext([{ classCode: 255, sampleCount: 4 }], 2024)
    );

    expect(profile.status).toBe("available");
    expect(profile.reason).toBe("no-known-land-cover");
    expect(profile.rows[0]).toMatchObject({
      status: "not-observed-in-counted-sample",
      sampleCount: 0,
      fractionOfKnownLandCover: null,
    });
    expect(profile.rows.at(-1)).toMatchObject({
      status: "observed",
      sampleCount: 4,
      fractionOfAllSamples: 1,
      fractionOfKnownLandCover: null,
    });
  });
});
