import { describe, expect, it } from "vitest";
import { LAYERS } from "../lib/timeline";
import { dataCurrencyNote } from "./dataCurrency";

const AUG_2026 = { year: 2026, month: 8 };

describe("dataCurrencyNote", () => {
  it("names the record end and how far behind the calendar it sits", () => {
    const note = dataCurrencyNote(
      LAYERS.ndvi,
      { year: 2026, month: 6 },
      AUG_2026
    );
    expect(note.text).toBe("Newest data: Jun 2026 · 2 months behind Aug 2026");
    expect(note.detail).toContain("MOD13A3");
    expect(note.detail).toContain("have not been published yet");
  });

  it("singularises a one-month lag", () => {
    const note = dataCurrencyNote(
      LAYERS.ndvi,
      { year: 2026, month: 7 },
      AUG_2026
    );
    expect(note.text).toBe("Newest data: Jul 2026 · 1 month behind Aug 2026");
  });

  it("reports the long reanalysis and land-model lags honestly", () => {
    // GLDAS trails furthest of the monthly products; the line must say so
    // rather than round it away.
    const precip = dataCurrencyNote(
      LAYERS.precip,
      { year: 2026, month: 3 },
      AUG_2026
    );
    expect(precip.text).toContain("5 months behind Aug 2026");
  });

  it("counts an annual product in years, never in months", () => {
    const note = dataCurrencyNote(
      LAYERS.landcover,
      { year: 2024, month: 1 },
      AUG_2026
    );
    // A month count over an annual product measures the cadence, not the lag.
    expect(note.text).not.toContain("month");
    expect(note.detail).toContain("once a year");
  });

  it("names a closed year the annual product has not released", () => {
    // Land cover's real state: MCD12Q1 ends at 2024 while 2025 closed in
    // December. The cadence explains the absence of 2026, not of 2025, so
    // "annual product" alone reassures where it should disclose.
    const note = dataCurrencyNote(
      LAYERS.landcover,
      { year: 2024, month: 1 },
      AUG_2026
    );
    expect(note.text).toBe("Newest data: 2024 · 2025 not published yet");
    expect(note.detail).toContain("MCD12Q1");
    expect(note.detail).toContain("2025 ended without a release");
    // The current year is withheld from the gap: it cannot be published yet.
    expect(note.text).not.toContain("2026");
  });

  it("spans a range when several closed years are unreleased", () => {
    const note = dataCurrencyNote(
      LAYERS.landcover,
      { year: 2022, month: 1 },
      AUG_2026
    );
    expect(note.text).toBe("Newest data: 2022 · 2023–2025 not published yet");
  });

  it("stays on cadence alone while only the open year is missing", () => {
    // 2025 released, 2026 still running: nothing has closed without a
    // release, so there is no lag to name.
    const note = dataCurrencyNote(
      LAYERS.landcover,
      { year: 2025, month: 1 },
      AUG_2026
    );
    expect(note.text).toBe("Newest data: 2025 · annual product");
    expect(note.text).not.toContain("not published");
  });

  it("never renders a gap for an annual record ahead of the clock", () => {
    const note = dataCurrencyNote(
      LAYERS.landcover,
      { year: 2027, month: 1 },
      AUG_2026
    );
    expect(note.text).toBe("Newest data: 2027 · annual product");
  });

  it("keeps every resting line on one row at 390px", () => {
    // The status row's reserved height is what stops the bottom HUD from
    // growing upward over the globe, so no branch may run longer than the
    // longest line that already shipped — the monthly lag form, measured at
    // 48 chars ("Newest data: Mar 2026 · 5 months behind Aug 2026"). The
    // land-cover branches below come in at 42 and 47, so naming the gap
    // never makes this row the one that wraps.
    const cases = [
      dataCurrencyNote(LAYERS.ndvi, { year: 2026, month: 3 }, AUG_2026),
      dataCurrencyNote(LAYERS.landcover, { year: 2024, month: 1 }, AUG_2026),
      dataCurrencyNote(LAYERS.landcover, { year: 2022, month: 1 }, AUG_2026),
      dataCurrencyNote(LAYERS.landcover, { year: 2025, month: 1 }, AUG_2026),
    ];
    for (const note of cases) expect(note.text.length).toBeLessThanOrEqual(48);
  });

  it("drops the lag clause when the record reaches the current month", () => {
    const note = dataCurrencyNote(LAYERS.ndvi, AUG_2026, AUG_2026);
    expect(note.text).toBe("Newest data: Aug 2026");
    expect(note.text).not.toContain("·");
  });

  it("never renders a negative lag if a record runs ahead of the clock", () => {
    const note = dataCurrencyNote(
      LAYERS.ndvi,
      { year: 2026, month: 9 },
      AUG_2026
    );
    expect(note.text).toBe("Newest data: Sep 2026");
  });

  it("stays short enough to hold one line in the 390px status row", () => {
    // The row's reserved height is what keeps the bottom HUD from growing
    // upward over the globe; a wrapped line would defeat it.
    for (const layer of Object.values(LAYERS)) {
      const note = dataCurrencyNote(layer, { year: 2025, month: 12 }, AUG_2026);
      expect(note.text.length).toBeLessThanOrEqual(52);
    }
  });
});
