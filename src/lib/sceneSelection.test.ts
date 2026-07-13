import { describe, it, expect } from "vitest";
import {
  candidateDates,
  coverageScore,
  formatSceneSelectionStatus,
  mapWithConcurrency,
  SCENE_LAYERS,
} from "./sceneSelection";

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

describe("mapWithConcurrency", () => {
  it("preserves input order while bounding simultaneously active work", async () => {
    let active = 0;
    let peakActive = 0;
    const values = await mapWithConcurrency([3, 1, 4, 1, 5], 2, async (n) => {
      active++;
      peakActive = Math.max(peakActive, active);
      await Promise.resolve();
      active--;
      return n * 10;
    });

    expect(values).toEqual([30, 10, 40, 10, 50]);
    expect(peakActive).toBe(2);
  });

  it("uses one worker for an invalid concurrency limit", async () => {
    let active = 0;
    let peakActive = 0;
    await mapWithConcurrency([1, 2], 0, async (n) => {
      active++;
      peakActive = Math.max(peakActive, active);
      await Promise.resolve();
      active--;
      return n;
    });
    expect(peakActive).toBe(1);
  });
});

describe("formatSceneSelectionStatus", () => {
  it("labels thumbnail screening without presenting it as spatial coverage", () => {
    expect(
      formatSceneSelectionStatus({
        layer: SCENE_LAYERS[0],
        date: "2024-08-05",
        score: 0.276,
      })
    ).toBe(
      "Sentinel-2 · HLS S30 · 30 m · 2024-08-05 · 28% usable thumbnail signal (screening only)"
    );
  });

  it("does not invent a percent for an invalid score", () => {
    expect(
      formatSceneSelectionStatus({
        layer: SCENE_LAYERS[1],
        date: "2024-08-05",
        score: Number.NaN,
      })
    ).toContain("usable thumbnail signal unavailable (screening only)");
  });
});
