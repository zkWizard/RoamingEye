import { describe, expect, it } from "vitest";
import {
  summarizeAnnualNdviPhenology,
  type NdviAnnualPhenology,
  type NdviMonthlyObservation,
} from "./phenology";
import { describeNdviCycleAsymmetry } from "./phenologyCycleAsymmetry";

/** Build a full 12-month year of NDVI observations from a value-per-month map. */
function yearObservations(
  year: number,
  ndviByMonth: readonly number[]
): NdviMonthlyObservation[] {
  return ndviByMonth.map((ndvi, index) => ({
    month: { year, month: index + 1 },
    ndvi,
  }));
}

/** Convenience: the single annual summary for a northern-hemisphere point. */
function annualFor(
  year: number,
  ndviByMonth: readonly number[],
  latitude = 45
): NdviAnnualPhenology {
  const [summary] = summarizeAnnualNdviPhenology(
    yearObservations(year, ndviByMonth),
    latitude
  );
  return summary;
}

describe("describeNdviCycleAsymmetry", () => {
  it("splits the year into two complementary arcs that sum to 12", () => {
    // Trough in Feb (month 2), peak in Jul (month 7): a classic northern cycle.
    const monthly = [
      0.3, 0.1, 0.2, 0.4, 0.6, 0.7, 0.8, 0.7, 0.5, 0.4, 0.35, 0.32,
    ];
    const result = describeNdviCycleAsymmetry(annualFor(2020, monthly));

    expect(result.status).toBe("available");
    expect(result.troughMonth).toBe(2);
    expect(result.peakMonth).toBe(7);
    expect(result.troughToPeakMonths).toBe(5);
    expect(result.peakToTroughMonths).toBe(7);
    expect(
      (result.troughToPeakMonths ?? 0) + (result.peakToTroughMonths ?? 0)
    ).toBe(12);
    expect(result.asymmetryMonths).toBe(2);
    expect(result.dominantArc).toBe("peak-to-trough");
    expect(result.isForecast).toBe(false);
    expect(result.kind).toBe("observed-ndvi-cycle-asymmetry");
    expect(result.reason).toBeNull();
  });

  it("wraps the trough-to-peak arc across year end", () => {
    // Peak in Feb (2), trough in Sep (9): forward trough->peak wraps 9->...->2.
    const monthly = [
      0.7, 0.8, 0.6, 0.5, 0.4, 0.35, 0.3, 0.28, 0.2, 0.3, 0.5, 0.65,
    ];
    const result = describeNdviCycleAsymmetry(annualFor(2021, monthly));

    expect(result.peakMonth).toBe(2);
    expect(result.troughMonth).toBe(9);
    // Sep(9) -> Feb(2) forward is 5 months (Oct,Nov,Dec,Jan,Feb).
    expect(result.troughToPeakMonths).toBe(5);
    expect(result.peakToTroughMonths).toBe(7);
    expect(result.dominantArc).toBe("peak-to-trough");
    expect(result.asymmetryMonths).toBe(2);
  });

  it("reports a balanced split as an even 6/6 partition", () => {
    // Trough in Jan (1), peak in Jul (7): exactly half the calendar apart.
    const monthly = [
      0.1, 0.2, 0.3, 0.45, 0.6, 0.72, 0.8, 0.72, 0.6, 0.45, 0.3, 0.2,
    ];
    const result = describeNdviCycleAsymmetry(annualFor(2019, monthly));

    expect(result.troughToPeakMonths).toBe(6);
    expect(result.peakToTroughMonths).toBe(6);
    expect(result.asymmetryMonths).toBe(0);
    expect(result.dominantArc).toBe("balanced");
  });

  it("labels a trough-to-peak-dominant year", () => {
    // Trough in Jan (1), peak in Oct (10): forward trough->peak is 9 months.
    const monthly = [
      0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.6, 0.75, 0.5, 0.3,
    ];
    const result = describeNdviCycleAsymmetry(annualFor(2022, monthly));

    expect(result.troughMonth).toBe(1);
    expect(result.peakMonth).toBe(10);
    expect(result.troughToPeakMonths).toBe(9);
    expect(result.peakToTroughMonths).toBe(3);
    expect(result.dominantArc).toBe("trough-to-peak");
    expect(result.asymmetryMonths).toBe(6);
  });

  it("carries hemisphere and NASA provenance through unchanged", () => {
    const monthly = [
      0.3, 0.1, 0.2, 0.4, 0.6, 0.7, 0.8, 0.7, 0.5, 0.4, 0.35, 0.32,
    ];
    const annual = annualFor(2020, monthly, -33);
    const result = describeNdviCycleAsymmetry(annual);

    expect(result.hemisphere).toBe("southern");
    expect(result.source).toBe(annual.source);
    expect(result.unit).toBe(annual.unit);
    expect(result.year).toBe(2020);
  });

  it("returns a sparse result when the year has no extrema", () => {
    // Only five valid months: below the annual-extrema threshold, so peak/trough
    // are null and there is nothing to partition.
    const sparse: NdviMonthlyObservation[] = [1, 2, 3, 4, 5].map((month) => ({
      month: { year: 2020, month },
      ndvi: 0.4,
    }));
    const [annual] = summarizeAnnualNdviPhenology(sparse, 45);
    const result = describeNdviCycleAsymmetry(annual);

    expect(result.status).toBe("sparse");
    expect(result.reason).toBe("sparse-year");
    expect(result.troughToPeakMonths).toBeNull();
    expect(result.peakToTroughMonths).toBeNull();
    expect(result.asymmetryMonths).toBeNull();
    expect(result.dominantArc).toBeNull();
    expect(result.peakMonth).toBeNull();
    expect(result.troughMonth).toBeNull();
  });

  it("reports a flat year when peak and trough share a calendar month", () => {
    // A perfectly constant year: peak and trough resolve to the same month.
    const flat = yearObservations(2020, new Array(12).fill(0.5));
    const [annual] = summarizeAnnualNdviPhenology(flat, 45);
    const result = describeNdviCycleAsymmetry(annual);

    expect(result.status).toBe("flat");
    expect(result.reason).toBe("no-within-year-variation");
    expect(result.troughToPeakMonths).toBeNull();
    expect(result.peakToTroughMonths).toBeNull();
    // The shared extrema month is still echoed for auditability.
    expect(result.peakMonth).toBe(result.troughMonth);
    expect(result.peakMonth).not.toBeNull();
  });
});
