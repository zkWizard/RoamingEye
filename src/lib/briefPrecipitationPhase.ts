import { inversionUncertaintyForLayer } from "./briefValueUncertainty";
import type {
  EnvironmentSignalBrief,
  EnvironmentSignalId,
} from "./environmentBrief";
import type { DatasetRef, LayerId } from "./timeline";

/**
 * Provenance-first *precipitation-phase* descriptor for a multi-signal
 * environment brief.
 *
 * The brief's precipitation signal reads
 * `GLDAS_Surface_Total_Precipitation_Rate_Monthly`, whose authoritative GIBS
 * `ows:Title` is "Total Precipitation Rate (Monthly, Surface, Noah LSM,
 * GLDAS)". That is the land model's **total** precipitation flux: rain and
 * snowfall summed, with no phase split rendered. The brief long labelled this
 * signal "Rainfall", which asserted a liquid-only quantity the product does not
 * serve — and asserted it most wrongly in exactly the places an environmental
 * reader cares about, where a winter total is largely snow.
 *
 * Correcting the label (done at the definition site in `environmentBrief.ts`)
 * raises the question this module answers: *can the brief say anything about
 * the phase at all?* The brief already co-observes 2 m air temperature, so the
 * tempting move is to read a below-freezing month as a frozen one. This module
 * exists to make that move honestly, which — on today's committed figures —
 * means refusing it.
 *
 * The refusal is quantitative, not rhetorical. Air temperature reaches the
 * brief through the same colormap inversion every raster layer does, and its
 * measured end-to-end RMSE is ±18.95 K (`MEASURED_INVERSION`, METHODS §3,
 * docs/validation.md). The distance from a typical monthly-mean air
 * temperature to the freezing point is far smaller than that band, so the
 * co-observed temperature usually cannot place the month on one side of 273.15 K
 * at all. The module reports which of those two situations holds, and never
 * reports a rain/snow fraction under either.
 *
 * Three honesty rules are load-bearing:
 *  - **No phase is ever partitioned.** `phaseResolved` is the literal `false`;
 *    there is no field in which a liquid share could appear. The best outcome
 *    is a directional *indication*, never a split.
 *  - **The uncertainty is reused, never re-derived.** The band comes from
 *    `inversionUncertaintyForLayer`, which reads the CI-asserted
 *    `MEASURED_INVERSION` figures. When a legend recalibration tightens air
 *    temperature, this module's answers tighten with it rather than going stale.
 *  - **A monthly mean is not a precipitating-hour temperature.** Even a band
 *    lying wholly below freezing describes the month's average state, not the
 *    hours it actually precipitated, so the strongest available status is
 *    `indicated-frozen` — an indication, with the caveat carried in `limits`.
 *
 * This is a descriptor over provenance and documented error. It makes no
 * condition, risk, hazard, causal, or forecast claim, and the brief's shared
 * method limits still hold.
 */

/**
 * Freezing point of water at standard pressure, in kelvin — the air-temperature
 * signal's native unit. The comparison is only performed when the signal really
 * reports kelvin (see `THERMAL_NATIVE_UNIT`), so this constant can never be
 * silently compared against a Celsius value.
 */
export const FREEZING_POINT_K = 273.15;

/** The only air-temperature native unit this comparison is defined for. */
export const THERMAL_NATIVE_UNIT = "K";

export type PrecipitationPhaseStatus =
  /** No usable precipitation observation, so there is no total to qualify. */
  | "no-precipitation-observation"
  /** A total is reported but no usable co-observed air temperature exists. */
  | "no-thermal-context"
  /** Air temperature is reported in a unit this freezing comparison is undefined for. */
  | "thermal-context-unit-unsupported"
  /** Air temperature carries no measured inversion figure, so it bounds nothing. */
  | "thermal-context-uncharacterized"
  /** The temperature's measured uncertainty band spans freezing: no indication. */
  | "unresolved-band-straddles-freezing"
  /** The whole band lies below freezing — an indication of frozen phase only. */
  | "indicated-frozen"
  /** The whole band lies above freezing — an indication of liquid phase only. */
  | "indicated-liquid";

/** The co-observed thermal context, when one could be assessed. */
export interface ThermalContext {
  id: EnvironmentSignalId;
  layerId: LayerId;
  /** Observed monthly value in `nativeUnit`. */
  observedValue: number;
  nativeUnit: string;
  /** Measured colormap-inversion RMSE in `nativeUnit`; null when uncharacterized. */
  nativeRmse: number | null;
  /** `observedValue − nativeRmse`; null when uncharacterized. */
  lower: number | null;
  /** `observedValue + nativeRmse`; null when uncharacterized. */
  upper: number | null;
}

/** The precipitation signal whose phase is being questioned. */
export interface PrecipitationContext {
  id: EnvironmentSignalId;
  layerId: LayerId;
  label: string;
  source: DatasetRef;
  /** Observed total precipitation rate in `nativeUnit`. */
  observedValue: number;
  nativeUnit: string;
}

export interface PrecipitationPhaseDescriptor {
  kind: "brief-precipitation-phase";
  status: PrecipitationPhaseStatus;
  /**
   * Always `false`. The rendered product is a phase-summed total, so no split
   * between liquid and frozen precipitation is available at any status — this
   * field is typed to the literal so a consumer cannot branch on it becoming
   * true later.
   */
  phaseResolved: false;
  /** The quantity GIBS renders, per the layer's authoritative `ows:Title`. */
  renderedQuantity: string;
  /** The precipitation signal assessed; null when none was usable. */
  precipitation: PrecipitationContext | null;
  /** The co-observed thermal signal; null when none was usable. */
  thermal: ThermalContext | null;
  /** Freezing point used for the comparison, in `THERMAL_NATIVE_UNIT`. */
  freezingPoint: number;
  /** Honest one-line statement; carries no phase split and no condition claim. */
  statement: string;
  limits: string[];
}

/** The quantity the precipitation layer actually renders (GIBS `ows:Title`). */
const RENDERED_QUANTITY =
  "total precipitation rate (rain and snowfall summed; GLDAS Noah LSM surface total)";

const PHASE_LIMITS = [
  "The cited layer renders a phase-summed total precipitation rate; no rain/snow split is published, derived, or implied at any status.",
  "Any indication comes from a monthly-mean air temperature, which describes the month's average state — not the hours precipitation actually fell — so a warm month can still contain frozen precipitation and a cold month liquid.",
  "The thermal band is the air-temperature layer's measured end-to-end colormap-inversion RMSE (METHODS §3, docs/validation.md), not a confidence interval and not the source product's own validation against in-situ measurements.",
  "The two signals are independent products on their own composite calendars and grids; a co-observed temperature is context for the total, not a measurement of the precipitating column.",
];

/**
 * Describe what — if anything — the brief can honestly say about the phase of
 * its reported precipitation total, using the co-observed air-temperature
 * signal and that signal's *measured* inversion uncertainty.
 *
 * Signals are matched on `layerId`, not on the legacy `"rainfall"` signal id:
 * the layer id is what ties a brief signal to the GIBS layer whose `ows:Title`
 * defines the quantity, and it is the identifier that stayed correct while the
 * label drifted.
 */
export function describeBriefPrecipitationPhase(
  signals: readonly EnvironmentSignalBrief[]
): PrecipitationPhaseDescriptor {
  const precipitationSignal = usableSignalForLayer(signals, "precip");
  if (precipitationSignal === null) {
    return descriptor("no-precipitation-observation", null, null);
  }
  const precipitation: PrecipitationContext = {
    id: precipitationSignal.id,
    layerId: precipitationSignal.layerId,
    label: precipitationSignal.label,
    source: { ...precipitationSignal.source },
    observedValue: precipitationSignal.observedValue as number,
    nativeUnit: precipitationSignal.nativeUnit,
  };

  const thermalSignal = usableSignalForLayer(signals, "airtemp");
  if (thermalSignal === null) {
    return descriptor("no-thermal-context", precipitation, null);
  }
  // Refuse the comparison outright rather than assume kelvin: a Celsius value
  // compared against 273.15 would read every month as deeply frozen.
  if (thermalSignal.nativeUnit !== THERMAL_NATIVE_UNIT) {
    return descriptor("thermal-context-unit-unsupported", precipitation, {
      id: thermalSignal.id,
      layerId: thermalSignal.layerId,
      observedValue: thermalSignal.observedValue as number,
      nativeUnit: thermalSignal.nativeUnit,
      nativeRmse: null,
      lower: null,
      upper: null,
    });
  }

  const uncertainty = inversionUncertaintyForLayer(
    thermalSignal.layerId,
    thermalSignal.nativeUnit
  );
  const observedValue = thermalSignal.observedValue as number;
  if (uncertainty === null) {
    return descriptor("thermal-context-uncharacterized", precipitation, {
      id: thermalSignal.id,
      layerId: thermalSignal.layerId,
      observedValue,
      nativeUnit: thermalSignal.nativeUnit,
      nativeRmse: null,
      lower: null,
      upper: null,
    });
  }

  const nativeRmse = Math.abs(uncertainty.nativeRmse);
  const lower = observedValue - nativeRmse;
  const upper = observedValue + nativeRmse;
  const thermal: ThermalContext = {
    id: thermalSignal.id,
    layerId: thermalSignal.layerId,
    observedValue,
    nativeUnit: thermalSignal.nativeUnit,
    nativeRmse,
    lower,
    upper,
  };
  // Strict comparisons: a band whose edge lands exactly on freezing has not
  // cleared it, and stays unresolved.
  const status: PrecipitationPhaseStatus =
    upper < FREEZING_POINT_K
      ? "indicated-frozen"
      : lower > FREEZING_POINT_K
        ? "indicated-liquid"
        : "unresolved-band-straddles-freezing";

  return descriptor(status, precipitation, thermal);
}

/** The usable (`available`) signal rendering a given layer, or null. */
function usableSignalForLayer(
  signals: readonly EnvironmentSignalBrief[],
  layerId: LayerId
): EnvironmentSignalBrief | null {
  return (
    signals.find(
      (signal) =>
        signal.layerId === layerId &&
        signal.status === "available" &&
        signal.observedValue !== null &&
        Number.isFinite(signal.observedValue)
    ) ?? null
  );
}

function descriptor(
  status: PrecipitationPhaseStatus,
  precipitation: PrecipitationContext | null,
  thermal: ThermalContext | null
): PrecipitationPhaseDescriptor {
  return {
    kind: "brief-precipitation-phase",
    status,
    phaseResolved: false,
    renderedQuantity: RENDERED_QUANTITY,
    precipitation,
    thermal,
    freezingPoint: FREEZING_POINT_K,
    statement: phaseStatement(status, thermal),
    limits: PHASE_LIMITS,
  };
}

function phaseStatement(
  status: PrecipitationPhaseStatus,
  thermal: ThermalContext | null
): string {
  const quantity = `The reported value is a ${RENDERED_QUANTITY}; its phase is not rendered.`;

  switch (status) {
    case "no-precipitation-observation":
      return "No usable precipitation observation, so there is no total whose phase could be described.";
    case "no-thermal-context":
      return `${quantity} No usable co-observed air temperature, so no phase indication is available.`;
    case "thermal-context-unit-unsupported":
      return `${quantity} The co-observed air temperature is reported in ${thermal!.nativeUnit}, not ${THERMAL_NATIVE_UNIT}, so the freezing-point comparison is undefined and no phase indication is asserted.`;
    case "thermal-context-uncharacterized":
      return `${quantity} The co-observed air temperature carries no measured colormap-inversion figure, so it bounds nothing and no phase indication is asserted.`;
    case "unresolved-band-straddles-freezing":
      return `${quantity} The co-observed air temperature is ${formatK(thermal!.observedValue)} ± ${formatK(thermal!.nativeRmse!)} (measured inversion error), a band spanning ${formatK(thermal!.lower!)} to ${formatK(thermal!.upper!)} that includes the ${formatK(FREEZING_POINT_K)} freezing point — it cannot indicate whether the total fell as rain or snow.`;
    case "indicated-frozen":
      return `${quantity} The co-observed air temperature is ${formatK(thermal!.observedValue)} ± ${formatK(thermal!.nativeRmse!)} (measured inversion error), a band lying entirely below the ${formatK(FREEZING_POINT_K)} freezing point — an indication that the month was frozen on average, not a measurement that the precipitation fell as snow.`;
    case "indicated-liquid":
      return `${quantity} The co-observed air temperature is ${formatK(thermal!.observedValue)} ± ${formatK(thermal!.nativeRmse!)} (measured inversion error), a band lying entirely above the ${formatK(FREEZING_POINT_K)} freezing point — an indication that the month was above freezing on average, not a measurement that the precipitation fell as rain.`;
  }
}

function formatK(value: number): string {
  return `${Number(value.toFixed(2))} ${THERMAL_NATIVE_UNIT}`;
}
