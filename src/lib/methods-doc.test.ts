import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { MEASURED_INVERSION } from "./validation";
import type { CalibratedLayerId } from "./colormap";

/**
 * Drift guard for METHODS.md §3: the inversion-accuracy table quotes the
 * per-layer RMSE figures that the validation harness measures
 * (validation.MEASURED_INVERSION). If those numbers change (a colormap
 * re-render, a legend edit — caught live by the inversion-validation
 * contract), this fails until the handbook is updated, so the documented
 * accuracy can't silently rot away from the code.
 */

const methods = readFileSync(
  new URL("../../METHODS.md", import.meta.url),
  "utf8"
);

/** How METHODS.md renders an RMSE figure (kept identical to the table). */
function shown(rmse: number | null): string {
  if (rmse === null) return "no-data";
  return rmse >= 1 ? (Math.round(rmse * 10) / 10).toFixed(1) : rmse.toFixed(2);
}

describe("METHODS.md inversion-accuracy table", () => {
  it("quotes every calibrated layer's measured RMSE (or no-data)", () => {
    for (const [layer, m] of Object.entries(MEASURED_INVERSION) as [
      CalibratedLayerId,
      (typeof MEASURED_INVERSION)[CalibratedLayerId],
    ][]) {
      expect(
        methods.includes(shown(m.rmse)),
        `METHODS.md §3 is missing the ${layer} figure "${shown(m.rmse)}" — re-measure and update the table`
      ).toBe(true);
    }
  });

  it("documents the trend method and the honest limitation", () => {
    expect(methods).toContain("Seasonal Mann-Kendall");
    expect(methods).toContain("Sen's slope");
    expect(methods).toContain("cos(latitude)");
    // The load-bearing honesty: relative use for the poorly-inverted layers.
    expect(methods.toLowerCase()).toContain("relative and temporal analysis");
  });
});
