import { describe, it, expect } from "vitest";
import {
  momentFromMagnitude,
  magnitudeFromMoment,
  cumulativeSeismicMoment,
  SEISMIC_MOMENT_REFERENCE,
  SEISMIC_MOMENT_UNITS,
} from "./seismicMoment";

describe("momentFromMagnitude", () => {
  it("applies M0 = 10^(1.5·Mw + 9.1)", () => {
    // Mw 0 → 10^9.1 N·m; each +1 magnitude is 10^1.5 ≈ 31.6× more moment.
    expect(momentFromMagnitude(0)).toBeCloseTo(10 ** 9.1, 3);
    expect(momentFromMagnitude(6)).toBeCloseTo(10 ** 18.1, 3);
    const ratio = momentFromMagnitude(7)! / momentFromMagnitude(6)!;
    expect(ratio).toBeCloseTo(10 ** 1.5, 6);
  });

  it("accepts negative magnitudes as small positive moments", () => {
    const moment = momentFromMagnitude(-1);
    expect(moment).toBeGreaterThan(0);
    expect(moment).toBeCloseTo(10 ** (9.1 - 1.5), 3);
  });

  it("returns null for non-finite magnitudes", () => {
    expect(momentFromMagnitude(NaN)).toBeNull();
    expect(momentFromMagnitude(Infinity)).toBeNull();
    expect(momentFromMagnitude(-Infinity)).toBeNull();
  });
});

describe("magnitudeFromMoment", () => {
  it("is the exact inverse of momentFromMagnitude", () => {
    for (const mw of [-0.5, 0, 3.2, 4.5, 6, 7.4, 9.1]) {
      expect(magnitudeFromMoment(momentFromMagnitude(mw)!)).toBeCloseTo(mw, 10);
    }
  });

  it("returns null for undefined-log moments", () => {
    expect(magnitudeFromMoment(0)).toBeNull();
    expect(magnitudeFromMoment(-1)).toBeNull();
    expect(magnitudeFromMoment(NaN)).toBeNull();
    expect(magnitudeFromMoment(Infinity)).toBeNull();
  });
});

describe("cumulativeSeismicMoment", () => {
  it("sums seismic moments, not magnitudes", () => {
    // Two identical M6 events double the moment, which is one 10^1.5 step —
    // i.e. an equivalent Mw of 6 + (log10 2)/1.5, well short of a naive "M12".
    const { totalMomentNm, equivalentMomentMagnitude } =
      cumulativeSeismicMoment([6, 6]);
    expect(totalMomentNm).toBeCloseTo(2 * momentFromMagnitude(6)!, 3);
    expect(equivalentMomentMagnitude).toBeCloseTo(6 + Math.log10(2) / 1.5, 10);
  });

  it("is dominated by the largest event", () => {
    // Adding an M4 to an M8 barely moves the equivalent magnitude, because the
    // M8 carries ~10^6 times the moment of the M4.
    const withSmall = cumulativeSeismicMoment([8, 4]);
    expect(withSmall.equivalentMomentMagnitude).toBeCloseTo(8, 5);
  });

  it("matches a single event when given one magnitude", () => {
    const result = cumulativeSeismicMoment([5.5]);
    expect(result.contributingCount).toBe(1);
    expect(result.equivalentMomentMagnitude).toBeCloseTo(5.5, 10);
    expect(result.totalMomentNm).toBeCloseTo(momentFromMagnitude(5.5)!, 3);
  });

  it("skips non-finite magnitudes but still totals the rest", () => {
    const result = cumulativeSeismicMoment([6, NaN, 6, Infinity]);
    expect(result.contributingCount).toBe(2);
    expect(result.skippedCount).toBe(2);
    expect(result.equivalentMomentMagnitude).toBeCloseTo(
      6 + Math.log10(2) / 1.5,
      10
    );
  });

  it("reports an explicit empty result for no usable events", () => {
    const empty = cumulativeSeismicMoment([]);
    expect(empty.contributingCount).toBe(0);
    expect(empty.totalMomentNm).toBe(0);
    expect(empty.equivalentMomentMagnitude).toBeNull();

    const allSkipped = cumulativeSeismicMoment([NaN, Infinity]);
    expect(allSkipped.contributingCount).toBe(0);
    expect(allSkipped.skippedCount).toBe(2);
    expect(allSkipped.equivalentMomentMagnitude).toBeNull();
  });

  it("is order-independent (addition commutes)", () => {
    const a = cumulativeSeismicMoment([4.5, 6.2, 7.1, 5.0]);
    const b = cumulativeSeismicMoment([7.1, 5.0, 4.5, 6.2]);
    expect(a.equivalentMomentMagnitude).toBeCloseTo(
      b.equivalentMomentMagnitude!,
      10
    );
  });

  it("carries source provenance and native units", () => {
    const result = cumulativeSeismicMoment([5]);
    expect(result.reference).toBe(SEISMIC_MOMENT_REFERENCE);
    expect(result.reference.assumesMomentMagnitude).toBe(true);
    expect(result.units).toBe(SEISMIC_MOMENT_UNITS);
  });
});
