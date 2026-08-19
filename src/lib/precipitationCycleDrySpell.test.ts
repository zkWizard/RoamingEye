import { describe, expect, it } from "vitest";
import { describePrecipitationCycleDrySpell } from "./precipitationCycleDrySpell";
import {
  precipitationCycleClause,
  probePrecipitationCycle,
} from "./probePrecipitationCycle";
import { KOPPEN_DRY_MONTH_MM } from "./precipitationDrySpell";
import type { YearMonth } from "./timeline";

/**
 * A synthetic probe series: `years` calendar years of monthly mm/day values
 * indexed by calendar month, supplied the way the probe supplies its own —
 * months ascending, physical units. Going through the real probe bridge rather
 * than hand-building a cycle keeps the mm/day → monthly-depth integration in
 * the test path, which is where the 60 mm threshold is actually decided.
 */
function series(
  perMonthMmPerDay: readonly number[],
  years = 5,
  startYear = 2000
): { months: YearMonth[]; values: (number | null)[] } {
  const months: YearMonth[] = [];
  const values: (number | null)[] = [];
  for (let y = 0; y < years; y++) {
    for (let month = 1; month <= 12; month++) {
      months.push({ year: startYear + y, month });
      values.push(perMonthMmPerDay[month - 1]);
    }
  }
  return { months, values };
}

/** The cycle a probe series reduces to, for the dry-month descriptor to read. */
function cycleOf(perMonthMmPerDay: readonly number[]) {
  const { months, values } = series(perMonthMmPerDay);
  return probePrecipitationCycle("precip", months, values);
}

// 1 mm/day integrates to 28-31 mm a month, comfortably below the 60 mm break;
// 4 mm/day integrates to 112-124 mm, comfortably above it.
const DRY = 1;
const WET = 4;

describe("describePrecipitationCycleDrySpell", () => {
  it("reads a dry season that does not cross the turn of the year", () => {
    // Dry May-Sep, the ordinary Southern-Hemisphere wet-and-dry shape.
    const spell = describePrecipitationCycleDrySpell(
      cycleOf([WET, WET, WET, WET, DRY, DRY, DRY, DRY, DRY, WET, WET, WET])
    );
    expect(spell?.dryMonthCount).toBe(5);
    expect(spell?.drySpellCount).toBe(1);
    expect(spell?.longestDryRun).toBe(5);
  });

  it("keeps a dry season whole when it straddles the turn of the year", () => {
    // Dry Nov-Mar, the ordinary Northern-Hemisphere wet-and-dry shape and the
    // reason the window is rotated to start at the wettest month. Read as a
    // plain January-to-December window these five months split into Jan-Mar and
    // Nov-Dec, and the reading would claim a three-month dry season in two
    // spells. The circular answer is one spell of five, and that is what the
    // rotation must recover.
    const spell = describePrecipitationCycleDrySpell(
      cycleOf([DRY, DRY, DRY, WET, WET, WET, WET, WET, WET, WET, DRY, DRY])
    );
    expect(spell?.dryMonthCount).toBe(5);
    expect(spell?.drySpellCount).toBe(1);
    expect(spell?.longestDryRun).toBe(5);
  });

  it("separates two genuine dry spells from one long season", () => {
    // Dry Feb-Mar and Aug-Sep. Same dry-month COUNT as a contiguous four-month
    // season, and every permutation-invariant index on this line reads the two
    // cases identically; only the run lengths tell them apart.
    const spell = describePrecipitationCycleDrySpell(
      cycleOf([WET, DRY, DRY, WET, WET, WET, WET, DRY, DRY, WET, WET, WET])
    );
    expect(spell?.dryMonthCount).toBe(4);
    expect(spell?.drySpellCount).toBe(2);
    expect(spell?.longestDryRun).toBe(2);
  });

  it("reports a perhumid cycle as having no dry month", () => {
    const spell = describePrecipitationCycleDrySpell(
      cycleOf(Array.from({ length: 12 }, () => WET))
    );
    expect(spell?.dryMonthCount).toBe(0);
    expect(spell?.drySpellCount).toBe(0);
    expect(spell?.longestDryRun).toBe(0);
  });

  it("reports an arid cycle as dry in every month", () => {
    // Exercises the second arm of the rotation argument: when the WETTEST month
    // is itself below the threshold, every month is, and the window is a single
    // run of twelve whichever month it starts on.
    const spell = describePrecipitationCycleDrySpell(
      cycleOf(Array.from({ length: 12 }, () => DRY))
    );
    expect(spell?.dryMonthCount).toBe(12);
    expect(spell?.drySpellCount).toBe(1);
    expect(spell?.longestDryRun).toBe(12);
  });

  it("treats a month exactly at the threshold as wet, not dry", () => {
    // 2 mm/day over a 30-day September integrates to exactly 60 mm, and a dry
    // month is STRICTLY below the break, so the one month that could round into
    // the dry count must not. The same rate in a 31-day month would be 62 mm.
    const cycle = cycleOf([
      WET,
      WET,
      WET,
      WET,
      WET,
      WET,
      WET,
      WET,
      2,
      WET,
      WET,
      WET,
    ]);
    const september = cycle?.monthlyClimatology.find(
      (month) => month.calendarMonth === 9
    );
    expect(september?.meanMm).toBeCloseTo(KOPPEN_DRY_MONTH_MM, 6);
    expect(describePrecipitationCycleDrySpell(cycle)?.dryMonthCount).toBe(0);
  });

  it("honours a caller-supplied threshold", () => {
    const cycle = cycleOf([
      WET,
      WET,
      WET,
      WET,
      DRY,
      DRY,
      DRY,
      WET,
      WET,
      WET,
      WET,
      WET,
    ]);
    const strict = describePrecipitationCycleDrySpell(cycle, {
      dryMonthThresholdMm: 200,
    });
    expect(strict?.dryMonthThresholdMm).toBe(200);
    // Every month is below 200 mm, so the whole cycle turns dry.
    expect(strict?.dryMonthCount).toBe(12);
  });

  it("carries the cycle's cited product through unchanged", () => {
    const cycle = cycleOf([
      WET,
      WET,
      WET,
      WET,
      DRY,
      DRY,
      DRY,
      WET,
      WET,
      WET,
      WET,
      WET,
    ]);
    expect(describePrecipitationCycleDrySpell(cycle)?.source).toEqual(
      cycle?.source
    );
    expect(describePrecipitationCycleDrySpell(cycle)?.isForecast).toBe(false);
  });

  it("withholds a reading without a full, available cycle", () => {
    expect(describePrecipitationCycleDrySpell(null)).toBeNull();
    // Three years clears the years-per-month floor; two does not, so the cycle
    // never reaches "available" and no dry-month sequence may be stated.
    const { months, values } = series(
      [WET, WET, WET, WET, DRY, DRY, DRY, WET, WET, WET, WET, WET],
      2
    );
    const thin = probePrecipitationCycle("precip", months, values);
    expect(thin?.status).not.toBe("available");
    expect(describePrecipitationCycleDrySpell(thin)).toBeNull();
  });
});

describe("precipitationCycleClause dry-month tail", () => {
  it("names a contiguous dry season", () => {
    const cycle = cycleOf([
      DRY,
      DRY,
      DRY,
      WET,
      WET,
      WET,
      WET,
      WET,
      WET,
      WET,
      DRY,
      DRY,
    ]);
    const clause = precipitationCycleClause(
      cycle,
      null,
      describePrecipitationCycleDrySpell(cycle)
    );
    expect(clause).toContain("dry season 5 mo (Köppen, below 60 mm)");
  });

  it("says how many spells the dry months arrived in when there is more than one", () => {
    const cycle = cycleOf([
      WET,
      DRY,
      DRY,
      WET,
      WET,
      WET,
      WET,
      DRY,
      DRY,
      WET,
      WET,
      WET,
    ]);
    const clause = precipitationCycleClause(
      cycle,
      null,
      describePrecipitationCycleDrySpell(cycle)
    );
    expect(clause).toContain("4 dry mo in 2 spells, longest 2 mo");
    expect(clause).not.toContain("dry season");
  });

  it("states the perhumid and arid cycles in their own words", () => {
    const wetCycle = cycleOf(Array.from({ length: 12 }, () => WET));
    expect(
      precipitationCycleClause(
        wetCycle,
        null,
        describePrecipitationCycleDrySpell(wetCycle)
      )
    ).toContain("no calendar month below 60 mm");

    const dryCycle = cycleOf(Array.from({ length: 12 }, () => DRY));
    const aridClause = precipitationCycleClause(
      dryCycle,
      null,
      describePrecipitationCycleDrySpell(dryCycle)
    );
    expect(aridClause).toContain("every calendar month below 60 mm");
    // "dry season 12 mo" would be a year with no season at all.
    expect(aridClause).not.toContain("dry season");
  });

  it("stays one reading rather than opening a second sentence", () => {
    const cycle = cycleOf([
      DRY,
      DRY,
      DRY,
      WET,
      WET,
      WET,
      WET,
      WET,
      WET,
      WET,
      DRY,
      DRY,
    ]);
    const clause = precipitationCycleClause(
      cycle,
      null,
      describePrecipitationCycleDrySpell(cycle)
    );
    expect(clause?.split(" · ")).toHaveLength(1);
  });

  it("is unchanged when no dry-month sequence is supplied", () => {
    const cycle = cycleOf([
      DRY,
      DRY,
      DRY,
      WET,
      WET,
      WET,
      WET,
      WET,
      WET,
      WET,
      DRY,
      DRY,
    ]);
    expect(precipitationCycleClause(cycle)).toBe(
      precipitationCycleClause(cycle, null, null)
    );
    expect(precipitationCycleClause(cycle)).not.toContain("dry");
  });
});
