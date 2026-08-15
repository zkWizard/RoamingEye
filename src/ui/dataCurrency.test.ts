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

  it("explains an annual product by cadence, not by a month count", () => {
    const note = dataCurrencyNote(
      LAYERS.landcover,
      { year: 2024, month: 1 },
      AUG_2026
    );
    expect(note.text).toBe("Newest data: 2024 · annual product");
    expect(note.text).not.toContain("behind");
    expect(note.detail).toContain("once a year");
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
