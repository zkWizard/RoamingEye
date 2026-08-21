import { describe, expect, it } from "vitest";
import {
  inversionAccuracyCsvHeaders,
  probeInversionAccuracy,
} from "./probeInversionAccuracy";
import { PROBE_SCALES } from "./probe";
import { uncalibratedVegetationAccuracyCsvHeaders } from "./vegetationIndexRamp";
import { unvalidatedInversionCsvHeaders } from "./unvalidatedInversionAccuracy";
import { characterizeLayerInversion } from "./briefValueUncertainty";
import type { LayerId } from "./timeline";

/** The layers the probe can actually sample, which is what the CSV is written for. */
const PROBED_LAYERS = Object.keys(PROBE_SCALES) as LayerId[];

describe("unvalidatedInversionCsvHeaders", () => {
  it("speaks for snow, the one probed layer no other builder covers", () => {
    const headers = unvalidatedInversionCsvHeaders(
      "snow",
      probeInversionAccuracy("snow").status
    );
    expect(headers.length).toBeGreaterThan(0);
    expect(headers[0]).toContain("# inversion_validation_unmeasured:");
    expect(headers[0]).toContain("unmeasured rather than absent");
  });

  it("gives every ramp-inverted layer exactly one accuracy builder", () => {
    // The header-key form of the panel's exclusivity rule: a file states its
    // accuracy once, and a layer with no measurement says so rather than
    // saying nothing. A categorical layer and an uncalibrated scale are
    // excluded because neither has a ± band that could be missing — silence
    // is the correct disclosure there, not a gap.
    for (const id of PROBED_LAYERS) {
      const reason = characterizeLayerInversion(id).reason;
      if (reason !== null && reason !== "unvalidated-inversion") continue;
      const accuracy = probeInversionAccuracy(id);
      const measured = inversionAccuracyCsvHeaders(accuracy).filter((line) =>
        line.startsWith("# inversion_validation:")
      );
      const gradient = uncalibratedVegetationAccuracyCsvHeaders(
        id,
        accuracy.status
      );
      const unmeasured = unvalidatedInversionCsvHeaders(id, accuracy.status);
      const speaking =
        (measured.length > 0 ? 1 : 0) +
        (gradient.length > 0 ? 1 : 0) +
        (unmeasured.length > 0 ? 1 : 0);
      expect(speaking, id).toBe(1);
    }
  });

  it("stays silent wherever the classifier does not say the inversion is unvalidated", () => {
    // Derived from the committed sources rather than a layer list, so a layer
    // that gains a colormap document drops out of this builder by itself.
    for (const id of PROBED_LAYERS) {
      const accuracy = probeInversionAccuracy(id);
      const spoken =
        unvalidatedInversionCsvHeaders(id, accuracy.status).length > 0;
      const unvalidated =
        characterizeLayerInversion(id).reason === "unvalidated-inversion";
      const vegetation =
        uncalibratedVegetationAccuracyCsvHeaders(id, accuracy.status).length >
        0;
      expect(spoken, id).toBe(unvalidated && !vegetation);
    }
  });

  it("keeps its key distinguishable from the measured figure's", () => {
    // A script keyed on the exact name of the calibrated figure must not pick
    // a statement of absence up as a measurement.
    for (const line of unvalidatedInversionCsvHeaders(
      "snow",
      probeInversionAccuracy("snow").status
    )) {
      expect(line).not.toContain("# inversion_validation:");
      expect(line).not.toContain("# inversion_validation_gradient");
    }
  });

  it("quotes no error figure it does not have", () => {
    // The whole point is that nothing is measured: inventing a band here would
    // be worse than the silence it replaces.
    const joined = unvalidatedInversionCsvHeaders(
      "snow",
      probeInversionAccuracy("snow").status
    ).join(" ");
    expect(joined).not.toMatch(/RMSE/);
    expect(joined).not.toMatch(/±\s*\d/);
  });

  it("writes no CSV delimiter into a header line", () => {
    // A `#` line must never contain a comma (probe.ts csvHeaderText).
    for (const id of PROBED_LAYERS) {
      for (const line of unvalidatedInversionCsvHeaders(
        id,
        probeInversionAccuracy(id).status
      )) {
        expect(line, id).not.toContain(",");
      }
    }
  });
});
