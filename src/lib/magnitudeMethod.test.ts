import { describe, it, expect } from "vitest";
import {
  MAGNITUDE_METHOD_REFERENCE,
  MAGNITUDE_METHOD_SOURCE,
  formatReportedMagnitude,
  magnitudeMethodNote,
  magnitudeMethodReference,
  reportedMagnitudeStanding,
} from "./magnitudeMethod";

describe("MAGNITUDE_METHOD_REFERENCE", () => {
  it("keys every row by its own lower-case code", () => {
    for (const [key, reference] of Object.entries(MAGNITUDE_METHOD_REFERENCE)) {
      expect(reference.code).toBe(key);
      expect(key).toBe(key.toLowerCase());
    }
  });

  it("keeps every documented range ordered and finite", () => {
    for (const reference of Object.values(MAGNITUDE_METHOD_REFERENCE)) {
      if (reference.minM !== null)
        expect(Number.isFinite(reference.minM)).toBe(true);
      if (reference.maxM !== null)
        expect(Number.isFinite(reference.maxM)).toBe(true);
      if (reference.minM !== null && reference.maxM !== null) {
        expect(reference.minM).toBeLessThanOrEqual(reference.maxM);
      }
    }
  });

  it("transcribes the USGS ranges for the methods the live feed supplies", () => {
    // The M4.5+/30-day feed is dominated by mb and mww; ml, mwr also appear.
    expect(MAGNITUDE_METHOD_REFERENCE.mb).toMatchObject({
      minM: 4.0,
      maxM: 6.5,
      saturatesAboveM: 6.5,
    });
    expect(MAGNITUDE_METHOD_REFERENCE.mww).toMatchObject({
      minM: 5.0,
      maxM: null,
    });
    expect(MAGNITUDE_METHOD_REFERENCE.ml).toMatchObject({
      minM: 2.0,
      maxM: 6.5,
    });
    expect(MAGNITUDE_METHOD_REFERENCE.mwr).toMatchObject({
      minM: 4.0,
      maxM: 6.5,
    });
  });

  it("records a saturation onset only where USGS states one", () => {
    // mb and Ms_20 are the two rows carrying an explicit saturation statement;
    // silence elsewhere must not be recorded as "does not saturate".
    const withOnset = Object.values(MAGNITUDE_METHOD_REFERENCE)
      .filter((reference) => reference.saturatesAboveM !== null)
      .map((reference) => reference.code)
      .sort();
    expect(withOnset).toEqual(["mb", "ms_20"]);
  });

  it("cites the USGS magnitude-types page", () => {
    expect(MAGNITUDE_METHOD_SOURCE.url).toContain("usgs.gov");
  });
});

describe("magnitudeMethodReference", () => {
  it("matches a feed code case-insensitively and ignores surrounding space", () => {
    expect(magnitudeMethodReference("mb")?.code).toBe("mb");
    expect(magnitudeMethodReference("Mww")?.code).toBe("mww");
    expect(magnitudeMethodReference("  ML  ")?.code).toBe("ml");
  });

  it("does not infer a method from a code's spelling", () => {
    // "mwx" and "mbq" resemble listed codes but are not in the USGS table, so
    // they must not inherit mww's or mb's range by prefix matching.
    expect(magnitudeMethodReference("mwx")).toBeNull();
    expect(magnitudeMethodReference("mbq")).toBeNull();
  });

  it("treats absent, empty, and whitespace-only codes as no method", () => {
    expect(magnitudeMethodReference(null)).toBeNull();
    expect(magnitudeMethodReference(undefined)).toBeNull();
    expect(magnitudeMethodReference("")).toBeNull();
    expect(magnitudeMethodReference("   ")).toBeNull();
  });
});

describe("reportedMagnitudeStanding", () => {
  it("places a value inside its method's documented range", () => {
    expect(reportedMagnitudeStanding(5.6, "mb")).toBe(
      "within-documented-range"
    );
    expect(reportedMagnitudeStanding(7.4, "mww")).toBe(
      "within-documented-range"
    );
  });

  it("treats both documented bounds as inclusive", () => {
    expect(reportedMagnitudeStanding(4.0, "mb")).toBe(
      "within-documented-range"
    );
    expect(reportedMagnitudeStanding(6.5, "mb")).toBe(
      "within-documented-range"
    );
  });

  it("reports a value above the documented upper bound", () => {
    expect(reportedMagnitudeStanding(6.6, "mb")).toBe("above-documented-range");
    expect(reportedMagnitudeStanding(4.5, "md")).toBe("above-documented-range");
  });

  it("reports a value below the documented lower bound", () => {
    // Roughly a fifth of the live feed's mww events sit below the ~5.0 bound.
    expect(reportedMagnitudeStanding(4.5, "mww")).toBe(
      "below-documented-range"
    );
  });

  it("never places a value against an open-ended bound", () => {
    // mww has no documented upper bound and me no documented lower one.
    expect(reportedMagnitudeStanding(9.5, "mww")).toBe(
      "within-documented-range"
    );
    expect(reportedMagnitudeStanding(1, "md")).toBe("within-documented-range");
  });

  it("separates an unreported method from an undocumented one", () => {
    expect(reportedMagnitudeStanding(5, null)).toBe("method-unreported");
    expect(reportedMagnitudeStanding(5, "  ")).toBe("method-unreported");
    expect(reportedMagnitudeStanding(5, "mwx")).toBe("method-undocumented");
  });

  it("does not place a non-finite magnitude in a range", () => {
    expect(reportedMagnitudeStanding(Number.NaN, "mb")).toBe(
      "method-undocumented"
    );
    expect(reportedMagnitudeStanding(Number.POSITIVE_INFINITY, "mb")).toBe(
      "method-undocumented"
    );
  });
});

describe("magnitudeMethodNote", () => {
  it("calls a saturated reading a lower bound rather than a measurement", () => {
    expect(magnitudeMethodNote(6.9, "mb")).toBe(
      "mb saturates above M 6.5 — reported value is a lower bound on size"
    );
  });

  it("qualifies an above-range value with no documented saturation onset", () => {
    expect(magnitudeMethodNote(4.5, "md")).toBe(
      "above the M 4 upper bound USGS documents for md"
    );
  });

  it("stays silent inside the documented range", () => {
    expect(magnitudeMethodNote(5.6, "mb")).toBeNull();
    expect(magnitudeMethodNote(6.5, "mb")).toBeNull();
  });

  it("stays silent below the documented range", () => {
    // A regional-network mww at 4.5 is a documented edge, not an error, so the
    // readout must not imply the feed reported something invalid.
    expect(magnitudeMethodNote(4.5, "mww")).toBeNull();
  });

  it("stays silent when no documented method applies", () => {
    expect(magnitudeMethodNote(9, "mwx")).toBeNull();
    expect(magnitudeMethodNote(9, null)).toBeNull();
  });
});

describe("formatReportedMagnitude", () => {
  it("names the measurement behind a documented method code", () => {
    expect(formatReportedMagnitude(5.6, "mb")).toBe(
      "M 5.6 mb (body-wave, reported)"
    );
    expect(formatReportedMagnitude(7.4, "mww")).toBe(
      "M 7.4 mww (W-phase moment, reported)"
    );
  });

  it("shows an undocumented code verbatim without inventing a name", () => {
    expect(formatReportedMagnitude(5, "mwx")).toBe("M 5 mwx (reported)");
  });

  it("omits the method when the feed did not state one", () => {
    expect(formatReportedMagnitude(6.1, null)).toBe("M 6.1 (reported)");
    expect(formatReportedMagnitude(6.1, "   ")).toBe("M 6.1 (reported)");
  });

  it("never presents a magnitude as recomputed", () => {
    for (const type of ["mb", "mww", "mwx", null]) {
      expect(formatReportedMagnitude(5, type)).toContain("reported");
    }
  });
});
