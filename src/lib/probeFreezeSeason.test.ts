import { describe, expect, it } from "vitest";
import {
  freezeSeasonClause,
  freezeSeasonResolvabilityClause,
  probeAirTemperatureFreezeSeason,
  type ProbeFreezeSeason,
} from "./probeFreezeSeason";
import type { LayerId, YearMonth } from "./timeline";

/** Measured colormap-inversion RMSE for the airtemp layer (validation.ts). */
const AIRTEMP_RMSE_K = 0.485;

/** Repeat a 12-month climatology across `years`, Jan→Dec, from 2019. */
function series(
  climatologyKelvin: readonly number[],
  years = 3
): { months: YearMonth[]; values: (number | null)[] } {
  const months: YearMonth[] = [];
  const values: (number | null)[] = [];
  for (let y = 0; y < years; y++) {
    for (let month = 1; month <= 12; month++) {
      months.push({ year: 2019 + y, month });
      values.push(climatologyKelvin[month - 1]);
    }
  }
  return { months, values };
}

/** A mid-latitude continental cycle: Nov→Mar below freezing, all months clear. */
const SEASONAL = [265, 267, 272, 278, 285, 291, 294, 293, 288, 280, 272, 267];

function summarize(
  climatologyKelvin: readonly number[],
  layerId: LayerId | undefined = "airtemp",
  years = 3
): ProbeFreezeSeason | null {
  const { months, values } = series(climatologyKelvin, years);
  return probeAirTemperatureFreezeSeason(layerId, months, values);
}

describe("probeAirTemperatureFreezeSeason", () => {
  it("returns null for any layer that is not 2 m air temperature", () => {
    // LST is the trap: a clear-sky radiometric skin temperature is a different
    // quantity from the 2 m air temperature the partition is defined on.
    expect(summarize(SEASONAL, "lst")).toBeNull();
    expect(summarize(SEASONAL, "sst")).toBeNull();
  });

  it("returns null when no layer is selected", () => {
    // Called directly: passing undefined through `summarize` would trigger its
    // default parameter instead of reaching the guard.
    const { months, values } = series(SEASONAL);
    expect(
      probeAirTemperatureFreezeSeason(undefined, months, values)
    ).toBeNull();
  });

  it("returns null for an empty record", () => {
    expect(probeAirTemperatureFreezeSeason("airtemp", [], [])).toBeNull();
  });

  it("returns null when the record is too short to build a mean cycle", () => {
    // The cycle helper requires three distinct years per calendar month, so a
    // two-year record yields no classification rather than a thin one.
    expect(summarize(SEASONAL, "airtemp", 2)).toBeNull();
  });

  it("classifies a single contiguous cold season with its boundaries", () => {
    const result = summarize(SEASONAL);
    expect(result?.season.regime).toBe("seasonal-freeze");
    expect(result?.season.belowFreezingMonths).toBe(5);
    expect(result?.season.freezeOnsetMonth).toBe(11);
    expect(result?.season.thawMonth).toBe(4);
    expect(result?.monthRmseK).toBe(AIRTEMP_RMSE_K);
  });

  it("finds no unresolved month when every mean clears the measured error", () => {
    const result = summarize(SEASONAL);
    expect(result?.unresolvedCalendarMonths).toEqual([]);
    expect(result?.onsetUnresolved).toBe(false);
    expect(result?.thawUnresolved).toBe(false);
  });

  it("flags a month sitting inside the measured inversion error of freezing", () => {
    // March at 273.0 K is 0.15 K below the freezing point — well inside the
    // 0.485 K measured error, so the inversion, not MERRA-2, decided its side.
    const nearThreshold = [...SEASONAL];
    nearThreshold[2] = 273.0;
    const result = summarize(nearThreshold);
    expect(result?.unresolvedCalendarMonths).toEqual([3]);
    // The thaw sits between March and April, so an unresolved March moves it
    // even though April itself is far above freezing.
    expect(result?.thawUnresolved).toBe(true);
    expect(result?.onsetUnresolved).toBe(false);
  });

  it("separates a mean just outside the measured error but not one just inside", () => {
    // Matches airTemperatureFreeze.ts: strictly greater than the RMSE is
    // separated, so at-or-within is not. The exact tie is not asserted because
    // it is not representable — 273.15 + 0.485 lands 1.4e-14 K above the
    // freezing point plus the RMSE, so the equality branch cannot be reached
    // from a fixture and only the two sides are meaningful.
    const inside = [...SEASONAL];
    inside[5] = 273.15 + AIRTEMP_RMSE_K * 0.99;
    expect(summarize(inside)?.unresolvedCalendarMonths).toEqual([6]);

    const outside = [...SEASONAL];
    outside[5] = 273.15 + AIRTEMP_RMSE_K * 1.01;
    expect(summarize(outside)?.unresolvedCalendarMonths).toEqual([]);
  });

  it("classifies a frost-free cycle", () => {
    const tropical = new Array(12).fill(300);
    const result = summarize(tropical);
    expect(result?.season.regime).toBe("frost-free");
    expect(result?.season.frostFreeMonths).toBe(12);
    expect(result?.unresolvedCalendarMonths).toEqual([]);
  });

  it("classifies a perennially frozen cycle", () => {
    const polar = new Array(12).fill(250);
    const result = summarize(polar);
    expect(result?.season.regime).toBe("perennial-freeze");
    expect(result?.season.belowFreezingMonths).toBe(12);
    expect(result?.season.freezeOnsetMonth).toBeNull();
  });

  it("counts separate cold spells without inventing a boundary", () => {
    const split = [265, 265, 280, 285, 290, 265, 265, 290, 288, 285, 280, 280];
    const result = summarize(split);
    expect(result?.season.regime).toBe("intermittent-freeze");
    expect(result?.season.freezeRunCount).toBe(2);
    expect(result?.season.freezeOnsetMonth).toBeNull();
    expect(result?.season.thawMonth).toBeNull();
    expect(result?.onsetUnresolved).toBe(false);
    expect(result?.thawUnresolved).toBe(false);
  });

  it("passes nulls through as missing rather than interpolating them", () => {
    const { months, values } = series(SEASONAL);
    // Drop every sampled March: the cycle loses a calendar month, so no
    // classification is made rather than one over eleven months.
    for (let i = 0; i < months.length; i++) {
      if (months[i].month === 3) values[i] = null;
    }
    expect(
      probeAirTemperatureFreezeSeason("airtemp", months, values)
    ).toBeNull();
  });
});

describe("freezeSeasonClause", () => {
  it("is silent when there is nothing well posed to say", () => {
    expect(freezeSeasonClause(null)).toBe("");
  });

  it("names both boundaries of a single contiguous cold season", () => {
    expect(freezeSeasonClause(summarize(SEASONAL))).toBe(
      "mean freeze season Nov onset to Apr thaw, 5 of 12 months below 273.15 K (monthly means, not station frost dates)"
    );
  });

  it("does not rule out daily frost under a frost-free mean cycle", () => {
    expect(freezeSeasonClause(summarize(new Array(12).fill(300)))).toBe(
      "mean annual cycle stays at or above 273.15 K in all 12 months (frost-free monthly means — daily frost not ruled out)"
    );
  });

  it("refuses a permafrost reading of a perennially frozen mean", () => {
    expect(freezeSeasonClause(summarize(new Array(12).fill(250)))).toBe(
      "mean annual cycle is below 273.15 K in all 12 months (monthly means only — not a permafrost or ice diagnosis)"
    );
  });

  it("withholds onset and thaw for a split cold season", () => {
    const split = [265, 265, 280, 285, 290, 265, 265, 290, 288, 285, 280, 280];
    expect(freezeSeasonClause(summarize(split))).toBe(
      "4 of 12 months below 273.15 K in 2 separate spells, so onset and thaw are withheld (monthly means only)"
    );
  });
});

describe("freezeSeasonResolvabilityClause", () => {
  it("is silent for a null summary and for a cleanly separated record", () => {
    expect(freezeSeasonResolvabilityClause(null)).toBe("");
    expect(freezeSeasonResolvabilityClause(summarize(SEASONAL))).toBe("");
  });

  it("names the unresolved month and the boundary it moves", () => {
    const nearThreshold = [...SEASONAL];
    nearThreshold[2] = 273.0;
    expect(freezeSeasonResolvabilityClause(summarize(nearThreshold))).toBe(
      "Mar sits within the 0.485 K measured colormap-inversion error of 273.15 K, so that month's side of the threshold is this pipeline's, not MERRA-2's; the thaw boundary is not resolved to a month"
    );
  });

  it("qualifies the count when no reported boundary is affected", () => {
    // June near freezing leaves the Nov→Apr season's own boundaries clear, but
    // the below-freezing count still depends on which side June lands.
    const midsummer = [...SEASONAL];
    midsummer[5] = 273.3;
    expect(freezeSeasonResolvabilityClause(summarize(midsummer))).toBe(
      "Jun sits within the 0.485 K measured colormap-inversion error of 273.15 K, so that month's side of the threshold is this pipeline's, not MERRA-2's; the month count above may move"
    );
  });

  it("pluralizes and lists several unresolved months in calendar order", () => {
    const twoNear = [...SEASONAL];
    twoNear[2] = 273.0; // Mar, just below freezing — moves the Apr thaw
    twoNear[9] = 273.4; // Oct, just above freezing — moves the Nov onset
    expect(freezeSeasonResolvabilityClause(summarize(twoNear))).toBe(
      "Mar, Oct sit within the 0.485 K measured colormap-inversion error of 273.15 K, so those 2 months' side of the threshold is this pipeline's, not MERRA-2's; the onset and thaw boundaries are not resolved to a month"
    );
  });
});
