import { describe, expect, it } from "vitest";
import { parseDateQuery } from "./dates";

describe("parseDateQuery", () => {
  it("reads a month name, a numeric month, and a bare year", () => {
    expect(parseDateQuery("Aug 2023")).toEqual({
      year: 2023,
      month: 8,
      label: "August 2023",
    });
    expect(parseDateQuery("August 2023")?.month).toBe(8);
    expect(parseDateQuery("2023-08")).toEqual({
      year: 2023,
      month: 8,
      label: "August 2023",
    });
    expect(parseDateQuery("2023/8")?.month).toBe(8);
    expect(parseDateQuery("2023")).toEqual({
      year: 2023,
      month: 1,
      label: "2023",
    });
    expect(parseDateQuery("sept 2020")?.month).toBe(9);
  });

  it("leaves a sentence for another provider", () => {
    expect(parseDateQuery("Sahel in Aug 2023")).toBeNull();
    expect(parseDateQuery("2023-13")).toBeNull();
    expect(parseDateQuery("Aug")).toBeNull();
  });
});
