import { describe, it, expect } from "vitest";
import { candidateDates, coverageScore } from "./sceneSelection";

describe("candidateDates", () => {
  it("samples ~every third day, zero-padded", () => {
    const dates = candidateDates({ year: 2024, month: 3 });
    expect(dates).toHaveLength(10);
    expect(dates[0]).toBe("2024-03-02");
    expect(dates.at(-1)).toBe("2024-03-29");
    expect(dates).toContain("2024-03-14");
  });

  it("never probes an impossible February date", () => {
    expect(candidateDates({ year: 2023, month: 2 })).toEqual([
      "2023-02-02",
      "2023-02-05",
      "2023-02-08",
      "2023-02-11",
      "2023-02-14",
      "2023-02-17",
      "2023-02-20",
      "2023-02-23",
      "2023-02-26",
    ]);
  });

  it("includes February 29 when the acquisition month is a leap year", () => {
    expect(candidateDates({ year: 2024, month: 2 }).at(-1)).toBe("2024-02-29");
  });
});

describe("coverageScore", () => {
  const buffer = (rgb: [number, number, number], count: number) => {
    const px = new Uint8ClampedArray(count * 4);
    for (let i = 0; i < count; i++) {
      px[i * 4] = rgb[0];
      px[i * 4 + 1] = rgb[1];
      px[i * 4 + 2] = rgb[2];
      px[i * 4 + 3] = 255;
    }
    return px;
  };

  it("scores all-black (no-data) near zero", () => {
    expect(coverageScore(buffer([0, 0, 0], 100))).toBeCloseTo(0);
  });

  it("scores blown-out cloud near zero", () => {
    expect(coverageScore(buffer([255, 255, 255], 100))).toBeCloseTo(0);
  });

  it("scores normal terrain high", () => {
    expect(coverageScore(buffer([90, 110, 70], 100))).toBeCloseTo(1);
  });

  it("scores a half-covered scene around 0.5", () => {
    const half = new Uint8ClampedArray([
      ...buffer([90, 110, 70], 50),
      ...buffer([0, 0, 0], 50),
    ]);
    expect(coverageScore(half)).toBeCloseTo(0.5);
  });
});
