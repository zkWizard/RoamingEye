import { describe, expect, it } from "vitest";
import {
  composeEnvironmentBrief,
  type EnvironmentBriefInput,
  type EnvironmentObservation,
  type EnvironmentSignalBrief,
} from "./environmentBrief";
import { MEASURED_INVERSION } from "./validation";
import {
  FREEZING_POINT_K,
  THERMAL_NATIVE_UNIT,
  describeBriefPrecipitationPhase,
} from "./briefPrecipitationPhase";

const AVAILABLE_THROUGH = { year: 2026, month: 3 };

/** Air temperature's measured end-to-end colormap-inversion RMSE, in K. */
const AIRTEMP_RMSE_K = MEASURED_INVERSION.airtemp.rmse as number;

function obs(value: number, validFraction = 0.9): EnvironmentObservation {
  return { dataMonth: { year: 2026, month: 1 }, value, validFraction };
}

function briefWith(
  overrides: Partial<EnvironmentBriefInput>
): ReturnType<typeof composeEnvironmentBrief> {
  return composeEnvironmentBrief({
    vegetation: null,
    rainfall: null,
    soilMoisture: null,
    airTemperature: null,
    availableThrough: AVAILABLE_THROUGH,
    ...overrides,
  });
}

/** A brief carrying a usable total-precipitation value plus a given 2 m temperature. */
function phaseFor(airTemperatureK: number | null) {
  const brief = briefWith({
    rainfall: obs(0.00002),
    airTemperature: airTemperatureK === null ? null : obs(airTemperatureK),
  });
  return describeBriefPrecipitationPhase(brief.signals);
}

describe("the brief's precipitation label", () => {
  it("names the phase-summed total GIBS renders, not rainfall", () => {
    const signal = briefWith({ rainfall: obs(0.00002) }).signals.find(
      (s) => s.layerId === "precip"
    )!;
    // GIBS ows:Title for GLDAS_Surface_Total_Precipitation_Rate_Monthly is
    // "Total Precipitation Rate (Monthly, Surface, Noah LSM, GLDAS)" — a
    // rain+snow total. A liquid-only label would misname the quantity.
    expect(signal.label).toMatch(/precipitation/i);
    expect(signal.label).not.toMatch(/rainfall|rain\b/i);
    expect(signal.statement).not.toMatch(/rainfall/i);
  });
});

describe("describeBriefPrecipitationPhase", () => {
  it("never resolves a phase, whatever the inputs", () => {
    for (const t of [null, 200, 273.15, 320]) {
      const result = phaseFor(t);
      expect(result.kind).toBe("brief-precipitation-phase");
      expect(result.phaseResolved).toBe(false);
      // No field anywhere may carry a liquid/frozen split.
      expect(JSON.stringify(result)).not.toMatch(/fraction|share|percent/i);
    }
  });

  it("reports the quantity the layer actually renders", () => {
    const result = phaseFor(280);
    expect(result.renderedQuantity).toMatch(/total precipitation rate/i);
    expect(result.renderedQuantity).toMatch(/snowfall/i);
    expect(result.statement).toMatch(/phase is not rendered/i);
  });

  it("has nothing to qualify when precipitation is unusable", () => {
    const result = describeBriefPrecipitationPhase(
      briefWith({ airTemperature: obs(280) }).signals
    );
    expect(result.status).toBe("no-precipitation-observation");
    expect(result.precipitation).toBeNull();
    expect(result.thermal).toBeNull();
  });

  it("ignores a precipitation signal that carries no usable value", () => {
    // A no-data month supplies an observation object but no value; it must not
    // be treated as a total whose phase is worth discussing.
    const result = describeBriefPrecipitationPhase(
      briefWith({
        rainfall: { dataMonth: { year: 2026, month: 1 }, value: null },
        airTemperature: obs(280),
      }).signals
    );
    expect(result.status).toBe("no-precipitation-observation");
  });

  it("reports no indication when air temperature is missing", () => {
    const result = phaseFor(null);
    expect(result.status).toBe("no-thermal-context");
    expect(result.precipitation).not.toBeNull();
    expect(result.precipitation!.layerId).toBe("precip");
    expect(result.thermal).toBeNull();
    expect(result.statement).toMatch(/no phase indication is available/i);
  });

  it("refuses the comparison when the thermal signal is not in kelvin", () => {
    // Guards a future unit refactor: 12 °C compared against 273.15 would read
    // as deeply frozen. The comparison must be declined, not mis-evaluated.
    const brief = briefWith({
      rainfall: obs(0.00002),
      airTemperature: obs(12),
    });
    const celsius: EnvironmentSignalBrief[] = brief.signals.map((signal) =>
      signal.layerId === "airtemp" ? { ...signal, nativeUnit: "°C" } : signal
    );
    const result = describeBriefPrecipitationPhase(celsius);
    expect(result.status).toBe("thermal-context-unit-unsupported");
    expect(result.thermal!.nativeRmse).toBeNull();
    expect(result.statement).toMatch(/comparison is undefined/i);
  });

  it("declines to indicate a phase when the measured band spans freezing", () => {
    // A near-freezing month: ±18.95 K straddles 273.15 K by a wide margin.
    const result = phaseFor(270);
    expect(result.status).toBe("unresolved-band-straddles-freezing");
    expect(result.thermal!.nativeRmse).toBe(AIRTEMP_RMSE_K);
    expect(result.thermal!.lower).toBeCloseTo(270 - AIRTEMP_RMSE_K, 10);
    expect(result.thermal!.upper).toBeCloseTo(270 + AIRTEMP_RMSE_K, 10);
    expect(result.statement).toMatch(/cannot indicate whether/i);
  });

  it("indicates frozen only when the whole band clears freezing", () => {
    const below = FREEZING_POINT_K - AIRTEMP_RMSE_K - 1;
    expect(phaseFor(below).status).toBe("indicated-frozen");
    expect(phaseFor(below).statement).toMatch(/not a measurement/i);

    // One kelvin warmer the band touches freezing again and the claim is dropped.
    expect(phaseFor(below + 2).status).toBe(
      "unresolved-band-straddles-freezing"
    );
  });

  it("indicates liquid only when the whole band clears freezing", () => {
    const above = FREEZING_POINT_K + AIRTEMP_RMSE_K + 1;
    expect(phaseFor(above).status).toBe("indicated-liquid");
    expect(phaseFor(above).statement).toMatch(/not a measurement/i);
    expect(phaseFor(above - 2).status).toBe(
      "unresolved-band-straddles-freezing"
    );
  });

  it("keeps a band edge exactly on freezing unresolved", () => {
    // Strict comparison: touching the freezing point has not cleared it.
    expect(phaseFor(FREEZING_POINT_K - AIRTEMP_RMSE_K).status).toBe(
      "unresolved-band-straddles-freezing"
    );
    expect(phaseFor(FREEZING_POINT_K + AIRTEMP_RMSE_K).status).toBe(
      "unresolved-band-straddles-freezing"
    );
  });

  it("cannot indicate a phase across the whole ordinary monthly-mean range", () => {
    // The point of the module, stated as a measurement. With air temperature's
    // committed RMSE of 18.95 K, the band clears freezing only outside
    // 273.15 ∓ 18.95 K — i.e. 254.20 K to 292.10 K, roughly −19 °C to +19 °C.
    // Essentially every monthly mean over inhabited land falls inside that
    // window, so the co-observed temperature indicates nothing about phase.
    for (let k = 255; k <= 291; k += 1) {
      expect(phaseFor(k).status).toBe("unresolved-band-straddles-freezing");
    }
    // Outside it the band does clear, so the module is not merely always-null:
    // only a deep-cold or reliably-warm month earns an indication.
    expect(phaseFor(254).status).toBe("indicated-frozen");
    expect(phaseFor(293).status).toBe("indicated-liquid");
  });

  it("reuses the committed inversion figure rather than re-deriving one", () => {
    const result = phaseFor(280);
    expect(result.thermal!.nativeRmse).toBe(MEASURED_INVERSION.airtemp.rmse);
    expect(result.thermal!.nativeUnit).toBe(THERMAL_NATIVE_UNIT);
    expect(result.freezingPoint).toBe(FREEZING_POINT_K);
  });

  it("carries provenance and the limits that make the statement honest", () => {
    const result = phaseFor(280);
    expect(result.precipitation!.source.shortName).toBe("GLDAS_NOAH025_M");
    expect(result.precipitation!.source.doi).toBe("10.5067/SXAVCZFAQLNO");
    expect(result.limits.join(" ")).toMatch(/no rain\/snow split/i);
    expect(result.limits.join(" ")).toMatch(
      /not the hours precipitation actually fell/i
    );
  });

  it("makes no risk, forecast, or causal claim", () => {
    for (const t of [null, 200, 273, 320]) {
      const text = `${phaseFor(t).statement} ${phaseFor(t).limits.join(" ")}`;
      expect(text).not.toMatch(/\brisk|hazard|forecast|predict|unsafe|danger/i);
    }
  });
});
