import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { MEASURED_INVERSION } from "./validation";
import type { CalibratedLayerId } from "./colormap";
import { classifyQuantityKind, type QuantityKind } from "./quantityKind";
import {
  classifyTemporalAggregation,
  type TemporalAggregation,
} from "./temporalAggregation";
import type { EnvironmentSignalId } from "./environmentBrief";
import type { DatasetRef } from "./timeline";

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

/**
 * Drift guard for METHODS.md §8 (Temporal commensurability): the handbook
 * documents which signals are time-integrable (quantityKind) and how each cited
 * product reduces a month to one value (temporalAggregation). Those mappings live
 * in code; if a future edit changes a classification, the documented claim would
 * silently rot. Bind the two together so the doc stays honest, exactly as §3 is
 * bound to MEASURED_INVERSION.
 */
const ref = (shortName: string): DatasetRef => ({
  shortName,
  version: "0",
  doi: "10.5067/TEST",
  title: shortName,
});

/** The signal quantity kinds §8's prose relies on. */
const DOC_QUANTITY_KIND: Record<EnvironmentSignalId, QuantityKind> = {
  vegetation: "dimensionless-index",
  rainfall: "flux",
  "soil-moisture": "state",
  "air-temperature": "state",
};

/** The product within-month aggregations §8's table lists. */
const DOC_AGGREGATION: Record<string, TemporalAggregation> = {
  MOD13A3: "within-month-composite",
  GLDAS_NOAH025_M: "monthly-time-average",
  M2TMNXSLV: "monthly-time-average",
};

describe("METHODS.md §8 temporal commensurability", () => {
  it("matches the code's quantity-kind classification for every signal", () => {
    for (const [id, kind] of Object.entries(DOC_QUANTITY_KIND) as [
      EnvironmentSignalId,
      QuantityKind,
    ][]) {
      expect(
        classifyQuantityKind(id),
        `METHODS.md §8 documents ${id} as "${kind}"; classifyQuantityKind disagrees — re-check the handbook`
      ).toBe(kind);
    }
    // The load-bearing honesty: exactly the flux is time-integrable.
    const integrable = (
      Object.keys(DOC_QUANTITY_KIND) as EnvironmentSignalId[]
    ).filter((id) => DOC_QUANTITY_KIND[id] === "flux");
    expect(integrable).toEqual(["rainfall"]);
  });

  it("matches the code's within-month aggregation for every documented product", () => {
    for (const [shortName, aggregation] of Object.entries(DOC_AGGREGATION) as [
      string,
      TemporalAggregation,
    ][]) {
      expect(
        classifyTemporalAggregation(ref(shortName)),
        `METHODS.md §8 documents ${shortName} as "${aggregation}"; classifyTemporalAggregation disagrees — re-check the handbook`
      ).toBe(aggregation);
    }
  });

  it("documents both temporal-commensurability descriptors and their honest limits", () => {
    expect(methods).toContain("time-integrable");
    expect(methods).toContain("within-month composite");
    expect(methods).toContain("monthly time-average");
    expect(methods).toContain("not temporally commensurate");
    expect(methods).toContain("src/lib/quantityKind.ts");
    expect(methods).toContain("src/lib/temporalAggregation.ts");
  });
});
