import { describe, it, expect } from "vitest";
import { SEISMICITY_SOURCE, type Earthquake } from "./earthquakes";
import { momentFromMagnitude, SEISMIC_MOMENT_REFERENCE } from "./seismicMoment";
import {
  momentScaleBasis,
  seismicMomentScaleBasis,
  MOMENT_MAGNITUDE_TYPE_CODES,
  MOMENT_SCALE_BASIS_ORDER,
  SEISMIC_MOMENT_SCALE_BASIS_UNITS,
} from "./seismicMomentScaleBasis";

/** Minimal event with only the fields this helper reads; others are inert. */
function quake(
  magnitude: number,
  magnitudeType: string | null | undefined
): Earthquake {
  return {
    lat: 0,
    lon: 0,
    depthKm: 10,
    magnitude,
    magnitudeType,
    time: 0,
    place: "",
  };
}

describe("momentScaleBasis", () => {
  it("recognizes every documented moment-magnitude code, case-insensitively", () => {
    for (const code of MOMENT_MAGNITUDE_TYPE_CODES) {
      expect(momentScaleBasis(code)).toBe("moment-magnitude");
      expect(momentScaleBasis(code.toUpperCase())).toBe("moment-magnitude");
    }
    // The USGS table capitalizes these; the feed sends them lower case.
    expect(momentScaleBasis("Mww")).toBe("moment-magnitude");
  });

  it("reports a method outside the list as reported-but-unverified", () => {
    for (const code of ["mb", "ml", "md", "ms", "ms_20", "mb_lg"]) {
      expect(momentScaleBasis(code)).toBe("other-reported-scale");
    }
  });

  it("does not infer a moment magnitude from a code's spelling", () => {
    // "mwp" starts with the same three letters as the Mw family but is not in
    // the transcribed list, so it must not be promoted by prefix matching.
    expect(momentScaleBasis("mwp")).toBe("other-reported-scale");
    expect(momentScaleBasis("mwx")).toBe("other-reported-scale");
  });

  it("treats absent, empty, and whitespace-only types as unreported", () => {
    expect(momentScaleBasis(null)).toBe("unreported-scale");
    expect(momentScaleBasis(undefined)).toBe("unreported-scale");
    expect(momentScaleBasis("")).toBe("unreported-scale");
    expect(momentScaleBasis("   ")).toBe("unreported-scale");
  });
});

describe("seismicMomentScaleBasis", () => {
  it("assigns each event's moment to the basis of its reported method", () => {
    const result = seismicMomentScaleBasis([
      quake(5, "mww"),
      quake(5, "mb"),
      quake(5, null),
    ]);
    const m5 = momentFromMagnitude(5)!;
    for (const basis of MOMENT_SCALE_BASIS_ORDER) {
      expect(result.shares[basis].eventCount).toBe(1);
      expect(result.shares[basis].totalMomentNm).toBeCloseTo(m5, 3);
      expect(result.shares[basis].momentFraction).toBeCloseTo(1 / 3, 12);
    }
    expect(result.totalMomentNm).toBeCloseTo(3 * m5, 3);
    expect(result.contributingEventCount).toBe(3);
    expect(result.approximatedMomentFraction).toBeCloseTo(2 / 3, 12);
  });

  it("separates the count-weighted view from the moment-weighted one", () => {
    // The real M4.5+/30-day feed is numerically dominated by mb events while
    // its energy comes almost entirely from a few mww solutions. Reporting the
    // share by count would overstate how much of the total is approximated.
    const events = [
      ...Array.from({ length: 50 }, () => quake(4.6, "mb")),
      quake(7.8, "mww"),
    ];
    const result = seismicMomentScaleBasis(events);
    expect(result.shares["other-reported-scale"].eventCount).toBe(50);
    expect(result.shares["moment-magnitude"].eventCount).toBe(1);
    // 50 of 51 events are not moment magnitudes, but they carry <1% of moment.
    expect(result.shares["moment-magnitude"].momentFraction).toBeGreaterThan(
      0.99
    );
    expect(result.approximatedMomentFraction!).toBeLessThan(0.01);
  });

  it("expresses each basis group's moment as an equivalent magnitude", () => {
    // Two equal moments sum to one event ~0.2 magnitude units larger:
    // (2/3)·log10(2) ≈ 0.2007.
    const result = seismicMomentScaleBasis([quake(6, "mww"), quake(6, "mwc")]);
    expect(
      result.shares["moment-magnitude"].equivalentMomentMagnitude
    ).toBeCloseTo(6 + (2 / 3) * Math.log10(2), 9);
    expect(
      result.shares["other-reported-scale"].equivalentMomentMagnitude
    ).toBeNull();
  });

  it("breaks the total down by verbatim reported label, largest moment first", () => {
    const result = seismicMomentScaleBasis([
      quake(4.5, "mb"),
      quake(4.5, "mb"),
      quake(7, "mww"),
      quake(5, null),
    ]);
    expect(result.reportedTypes.map((row) => row.magnitudeType)).toEqual([
      "mww",
      null,
      "mb",
    ]);
    const mb = result.reportedTypes.find((row) => row.magnitudeType === "mb")!;
    expect(mb.eventCount).toBe(2);
    expect(mb.basis).toBe("other-reported-scale");
    expect(mb.totalMomentNm).toBeCloseTo(2 * momentFromMagnitude(4.5)!, 3);
    const fractions = result.reportedTypes.reduce(
      (sum, row) => sum + row.momentFraction,
      0
    );
    expect(fractions).toBeCloseTo(1, 12);
  });

  it("keeps two spellings of one method as two rows rather than merging them", () => {
    const result = seismicMomentScaleBasis([quake(5, "mww"), quake(5, "Mww")]);
    expect(result.reportedTypes).toHaveLength(2);
    expect(result.reportedTypes.map((row) => row.magnitudeType).sort()).toEqual(
      ["Mww", "mww"]
    );
    // Both still classify as moment magnitudes, so the headline is unaffected.
    expect(result.approximatedMomentFraction).toBe(0);
  });

  it("orders exact moment ties deterministically, unreported last", () => {
    const forward = seismicMomentScaleBasis([
      quake(5, "mb"),
      quake(5, null),
      quake(5, "ml"),
    ]);
    const reversed = seismicMomentScaleBasis([
      quake(5, "ml"),
      quake(5, null),
      quake(5, "mb"),
    ]);
    expect(forward.reportedTypes.map((row) => row.magnitudeType)).toEqual([
      "mb",
      "ml",
      null,
    ]);
    expect(reversed.reportedTypes.map((row) => row.magnitudeType)).toEqual(
      forward.reportedTypes.map((row) => row.magnitudeType)
    );
  });

  it("skips events with no defined moment instead of folding in NaN", () => {
    const result = seismicMomentScaleBasis([
      quake(Number.NaN, "mww"),
      quake(Number.POSITIVE_INFINITY, "mb"),
      quake(5, "mww"),
    ]);
    expect(result.suppliedEventCount).toBe(3);
    expect(result.contributingEventCount).toBe(1);
    expect(result.skippedEventCount).toBe(2);
    expect(result.totalMomentNm).toBeCloseTo(momentFromMagnitude(5)!, 3);
    expect(result.approximatedMomentFraction).toBe(0);
  });

  it("reports an empty set without inventing a fraction", () => {
    const result = seismicMomentScaleBasis([]);
    expect(result.suppliedEventCount).toBe(0);
    expect(result.contributingEventCount).toBe(0);
    expect(result.totalMomentNm).toBe(0);
    expect(result.approximatedMomentFraction).toBeNull();
    expect(result.reportedTypes).toEqual([]);
    for (const basis of MOMENT_SCALE_BASIS_ORDER) {
      expect(result.shares[basis].momentFraction).toBe(0);
      expect(result.shares[basis].equivalentMomentMagnitude).toBeNull();
    }
  });

  it("retains provenance, the moment relation, and native units", () => {
    const result = seismicMomentScaleBasis([quake(5, "mww")]);
    expect(result.kind).toBe("usgs-seismic-moment-scale-basis");
    expect(result.isForecast).toBe(false);
    expect(result.source).toBe(SEISMICITY_SOURCE);
    expect(result.reference).toBe(SEISMIC_MOMENT_REFERENCE);
    expect(SEISMIC_MOMENT_SCALE_BASIS_UNITS.moment).toBe(
      "N·m (scalar seismic moment)"
    );
    expect(result.limitations.length).toBeGreaterThan(0);
    // The approximation this module measures is the one seismicMoment declares.
    expect(SEISMIC_MOMENT_REFERENCE.assumesMomentMagnitude).toBe(true);
  });

  it("never claims to convert between magnitude scales", () => {
    // An mb 6.0 keeps the moment its reported value implies; the module labels
    // the basis and leaves the number alone.
    const result = seismicMomentScaleBasis([quake(6, "mb")]);
    expect(result.totalMomentNm).toBeCloseTo(momentFromMagnitude(6)!, 3);
    expect(result.approximatedMomentFraction).toBe(1);
    expect(
      result.limitations.some((limitation) =>
        limitation.includes("Attribution is not correction")
      )
    ).toBe(true);
  });
});
