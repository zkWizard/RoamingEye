import { describe, expect, it } from "vitest";
import {
  summarizePlaceMonthAlignment,
  type PlaceMonthCard,
} from "./placeMonthAlignment";

/** The real panel line-up: five cards on four publication schedules. */
const PANEL: PlaceMonthCard[] = [
  { label: "Vegetation", month: { year: 2026, month: 4 } },
  { label: "Rainfall", month: { year: 2026, month: 1 } },
  { label: "Soil moisture", month: { year: 2026, month: 1 } },
  { label: "Air temperature", month: { year: 2026, month: 3 } },
  { label: "Sea surface temperature", month: { year: 2026, month: 3 } },
];

describe("summarizePlaceMonthAlignment", () => {
  it("groups the panel's cards into cohorts sharing a month, oldest first", () => {
    const summary = summarizePlaceMonthAlignment(PANEL);
    expect(summary.cohorts.map((cohort) => cohort.month)).toEqual([
      { year: 2026, month: 1 },
      { year: 2026, month: 3 },
      { year: 2026, month: 4 },
    ]);
    expect(summary.cohorts.map((cohort) => cohort.labels)).toEqual([
      ["Rainfall", "Soil moisture"],
      ["Air temperature", "Sea surface temperature"],
      ["Vegetation"],
    ]);
    expect(summary.cardCount).toBe(5);
  });

  it("reports the inclusive span the cards' months cover", () => {
    const summary = summarizePlaceMonthAlignment(PANEL);
    expect(summary.earliest).toEqual({ year: 2026, month: 1 });
    expect(summary.latest).toEqual({ year: 2026, month: 4 });
    expect(summary.spanMonths).toBe(4);
  });

  it("spans a year boundary without arithmetic error", () => {
    const summary = summarizePlaceMonthAlignment([
      { label: "Rainfall", month: { year: 2025, month: 11 } },
      { label: "Vegetation", month: { year: 2026, month: 2 } },
    ]);
    expect(summary.spanMonths).toBe(4);
    expect(summary.contemporaneous).toBe(false);
  });

  it("denies contemporaneity and names each cohort when months differ", () => {
    const summary = summarizePlaceMonthAlignment(PANEL);
    expect(summary.contemporaneous).toBe(false);
    expect(summary.statement).toBe(
      "Each product publishes on its own schedule, so these 5 cards are not one " +
        "contemporaneous snapshot: they span 4 months, Jan 2026 to Apr 2026. " +
        "Rainfall and Soil moisture read Jan 2026; Air temperature and Sea surface " +
        "temperature read Mar 2026; Vegetation reads Apr 2026. Only cards reading " +
        "the same month may be compared in time."
    );
  });

  it("joins three or more labels in a cohort with a serial comma", () => {
    const summary = summarizePlaceMonthAlignment([
      { label: "Rainfall", month: { year: 2026, month: 1 } },
      { label: "Soil moisture", month: { year: 2026, month: 1 } },
      { label: "Vegetation", month: { year: 2026, month: 1 } },
      { label: "Air temperature", month: { year: 2026, month: 3 } },
    ]);
    expect(summary.statement).toContain(
      "Rainfall, Soil moisture, and Vegetation read Jan 2026"
    );
  });

  it("affirms contemporaneity only when every card shares one month", () => {
    const summary = summarizePlaceMonthAlignment([
      { label: "Rainfall", month: { year: 2026, month: 1 } },
      { label: "Soil moisture", month: { year: 2026, month: 1 } },
    ]);
    expect(summary.contemporaneous).toBe(true);
    expect(summary.spanMonths).toBe(1);
    expect(summary.statement).toBe(
      "All 2 cards read Jan 2026, so they are contemporaneous."
    );
  });

  it("declines to call a lone card contemporaneous with anything", () => {
    const summary = summarizePlaceMonthAlignment([
      { label: "Rainfall", month: { year: 2026, month: 1 } },
    ]);
    expect(summary.contemporaneous).toBe(false);
    expect(summary.statement).toBe(
      "1 card, reading Jan 2026; contemporaneity needs two or more cards."
    );
  });

  it("drops cards without a valid month rather than inventing one", () => {
    const summary = summarizePlaceMonthAlignment([
      { label: "Rainfall", month: { year: 2026, month: 1 } },
      { label: "Broken", month: { year: 2026, month: 13 } },
      { label: "Fractional", month: { year: 2026.5, month: 2 } },
      {
        label: "Missing",
        month: null as unknown as { year: number; month: number },
      },
    ]);
    expect(summary.cardCount).toBe(1);
    expect(summary.cohorts).toHaveLength(1);
    expect(summary.cohorts[0].labels).toEqual(["Rainfall"]);
  });

  it("assesses nothing when no card supplies a month", () => {
    const summary = summarizePlaceMonthAlignment([]);
    expect(summary.cardCount).toBe(0);
    expect(summary.earliest).toBeNull();
    expect(summary.latest).toBeNull();
    expect(summary.spanMonths).toBeNull();
    expect(summary.contemporaneous).toBe(false);
    expect(summary.statement).toBe(
      "No card supplied a data month; contemporaneity cannot be assessed."
    );
  });

  // The only causal clause the statement carries is about publication
  // schedules; it must never say anything causal about the environment.
  it("keeps the statement free of condition, trend, and forecast language", () => {
    const summary = summarizePlaceMonthAlignment(PANEL);
    const prose = `${summary.statement} ${summary.limits.join(" ")}`;
    for (const word of [
      "caused",
      "drought",
      "expect",
      "forecast",
      "healthy",
      "predict",
      "trend",
      "warming",
      "worse",
    ]) {
      expect(prose.toLowerCase()).not.toContain(word);
    }
  });

  it("states the limits that keep the summary from over-claiming", () => {
    const summary = summarizePlaceMonthAlignment(PANEL);
    expect(summary.limits).toHaveLength(3);
    // A card can read a month and still report nothing usable for it.
    expect(summary.limits[0]).toContain("no usable coverage");
    // Contemporaneity is not commensurability; both descriptors are needed.
    expect(summary.limits[2]).toContain("not commensurate");
  });
});
