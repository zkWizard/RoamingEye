import { MERRA2_AIR_TEMPERATURE_RAMP_CAPS } from "./atmosphereProbeDomain";
import type { LayerId } from "./timeline";

/**
 * How many of a 2 m air-temperature probe's sampled months charted anything at
 * all — and what the statistics reduced from them are consequently statistics
 * *of*.
 *
 * `airTemperatureAveragedSupport.ts` answers the *spatial* version of this
 * question: what share of an averaged footprint each monthly mean covered. This
 * module answers the *temporal* one, which no air-temperature mode stated: how
 * many of the months on the chart's own x-axis contributed a value at all.
 *
 * The same pairing already exists for snow (`snowAveragedSupport.ts` /
 * `snowChartedRecord.ts`), for the vegetation indices
 * (`vegetationAveragedSupport.ts` / `vegetationChartedRecord.ts`) and for the
 * two water-cycle fields (`gldasAveragedSupport.ts` /
 * `gldasChartedRecord.ts`); air temperature was left with only the first half.
 * That gap is widest exactly where the spatial clause cannot reach: a **point
 * probe passes no shares**, so `airTemperatureAveragedSupportNote` returns null
 * for it by design, and a point whose record is partly charted had no clause in
 * any mode at all. It printed a full statistics line with nothing on it to say
 * the months behind it are a selected subset.
 *
 * Unlike its siblings the mechanism is not a domain boundary and not a
 * transparent band at one end of a ramp. MERRA-2 is a global reanalysis defined
 * over land and ocean alike (atmosphereProbeDomain.ts), so no month is missing
 * by construction. What removes a month is the rendered ramp: GIBS publishes
 * `MERRA2_2m_Air_Temperature_Monthly` between 220 K and 310 K and closes it at
 * *both* ends with an open catch-all, `parseColormapEntries` drops both by the
 * same documented design that drops the GLDAS caps, and the two cap colours sit
 * 76.6 and 74.5 RGB units from the nearest ramp colour — outside the 60-unit
 * `NO_DATA_DISTANCE`, so they are rejected rather than censored into a terminal
 * bin. A month beyond either end therefore inverts to `null` and vanishes from
 * the series exactly as an undrawn pixel vanishes from a mean. Those bounds are
 * read from `MERRA2_AIR_TEMPERATURE_RAMP_CAPS` rather than restated, so this
 * clause cannot outlive the measured colormap facts.
 *
 * That both ends are open is why this clause must say something the GLDAS one
 * does not. GLDAS's low cap is a `< 0` fill — nonphysical, so no real month is
 * lost beneath it — and its clause can name the censored end as the top alone.
 * Snow's and vegetation's excluded months sit at one end too, so those clauses
 * can name the conditioning as a damped swing. Here **both** discarded ends are
 * physically reachable monthly means — below 220 K (−53.15 °C) on the East
 * Antarctic plateau in winter, at or above 310 K (36.85 °C) in the hottest
 * desert summers — so the record is bracketed inward from both sides at once:
 * the charted maximum need not be the record's warmest month, and the charted
 * minimum need not be its coldest. A polar point whose deepest winters fell
 * below the floor reports its coldest month from those that stayed above it.
 *
 * What it will not do: it offers no corrected, reweighted or substituted
 * statistic, never counts an excluded month as anything, never assigns an
 * overall direction of error (the two exclusions pull opposite ways and a count
 * cannot separate them), and never says which end excluded any given month.
 * Separating them needs the sampled colours, which the probe path does not
 * load, and the sampler collapses every colour it cannot match into one absent
 * value — so an uncharted month is never evidence that the location *was* cold
 * or hot, only that nothing was drawn for it.
 *
 * `emptyAtmosphereProbeNote` owns the *wholly* empty record for this layer and
 * already refuses both readings there; this module is silent in that case, so
 * the two never qualify one record twice. It extends the same refusal to the
 * partial record.
 *
 * Nothing here claims heat, cold, comfort, hazard, health, season length,
 * trend, cause, or any future value; a charted-month count is not a count of
 * warm or cold months.
 *
 * Pure, render-free logic (see airTemperatureChartedRecord.test.ts). The cited
 * dataset is unchanged: MERRA-2 `M2TMNXSLV` v5.12.4
 * (doi:10.5067/AP1B0BA5PD2K), rendered through the GIBS colormap document named
 * in `MERRA2_AIR_TEMPERATURE_RAMP_CAPS`.
 */

/** The one layer this module speaks for; kept literal for the drift guard. */
export const AIR_TEMPERATURE_CHARTED_RECORD_LAYER_ID = "airtemp" as const;

export type AirTemperatureChartedRecordStatus =
  /** Not the air-temperature layer, or no months were sampled at all. */
  | "unreported"
  /** No month charted a value — `emptyAtmosphereProbeNote` speaks for this. */
  | "no-charted-month"
  /** Every sampled month charted a value; nothing was excluded. */
  | "fully-charted"
  /** Some months charted and some did not. */
  | "partly-charted";

export const AIR_TEMPERATURE_CHARTED_RECORD_LIMITATIONS = [
  "A month drops out of the series when its value fell beyond either open end of the rendered ramp; the charted series cannot separate the two, and both ends are physically reachable monthly means.",
  "The charted-month count is a measure of what the ramp drew, not of how warm or cold the location was, and an uncharted month is never evidence of a cold one or a hot one.",
  "Statistics reduced from the charted months are conditional on those months having been drawn; they are not the record's.",
  "Because both open caps are discarded, the charted maximum may sit below the record's warmest month and the charted minimum above its coldest; no bound is implied in either direction.",
  "No corrected statistic is offered and an excluded month is never counted as any value, because a discarded month could have sat at either end of the ramp.",
  "No overall direction of error is stated: the exclusions pull in opposite directions and a count cannot separate them.",
] as const;

export interface AirTemperatureChartedRecordSummary {
  kind: "observed-air-temperature-charted-record";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  layerId: typeof AIR_TEMPERATURE_CHARTED_RECORD_LAYER_ID;
  status: AirTemperatureChartedRecordStatus;
  /** Number of sampled months on the chart's x-axis. */
  sampledMonths: number;
  /** Number of those that charted a usable value. */
  chartedMonths: number;
  limitations: readonly string[];
}

/**
 * Classify an air-temperature probe's series by how much of it charted.
 * `values` are the probe's per-month entries aligned with its sampled months;
 * only their presence is read, so gradient positions and physical values
 * classify identically.
 */
export function summarizeAirTemperatureChartedRecord(
  values: readonly (number | null | undefined)[] | null | undefined
): AirTemperatureChartedRecordSummary {
  const sampledMonths = values?.length ?? 0;
  const chartedMonths =
    values?.filter((v) => v !== null && v !== undefined && Number.isFinite(v))
      .length ?? 0;

  const status: AirTemperatureChartedRecordStatus =
    sampledMonths === 0
      ? "unreported"
      : chartedMonths === 0
        ? "no-charted-month"
        : chartedMonths === sampledMonths
          ? "fully-charted"
          : "partly-charted";

  return {
    kind: "observed-air-temperature-charted-record",
    isForecast: false,
    layerId: AIR_TEMPERATURE_CHARTED_RECORD_LAYER_ID,
    status,
    sampledMonths,
    chartedMonths,
    limitations: AIR_TEMPERATURE_CHARTED_RECORD_LIMITATIONS,
  };
}

/**
 * One status-line clause, or null when there is nothing worth saying.
 *
 * Silent on a fully charted record, where nothing was excluded and the clause
 * would describe an exclusion that did not happen; silent when no month charted
 * at all, which `emptyAtmosphereProbeNote` replaces the whole sentence for and
 * which already refuses both readings; silent when no months were sampled.
 */
export function airTemperatureChartedRecordClause(
  summary: AirTemperatureChartedRecordSummary
): string | null {
  if (summary.status !== "partly-charted") return null;

  const { closedSpan, unit } = MERRA2_AIR_TEMPERATURE_RAMP_CAPS;

  return (
    `charted in ${summary.chartedMonths} of ${summary.sampledMonths} sampled ` +
    `months — the MERRA-2 ramp is representable only between ` +
    `${closedSpan.min} and ${closedSpan.max} ${unit}, and the open catch-all ` +
    `beyond each end is discarded rather than charted, so an uncharted month ` +
    `is evidence of neither a cold one nor a hot one; the statistics above ` +
    `cover the charted months alone, and because months are dropped at both ` +
    `ends the maximum need not be the record's warmest nor the minimum its ` +
    `coldest`
  );
}

/**
 * The clause for an air-temperature probe series, or null when it does not
 * apply. Gated to the air-temperature layer: this module reasons about the two
 * open caps on that product's rendered ramp, and an absent month means
 * something different for a layer bounded by a domain, drawn across its whole
 * range, or whose caps are censored into a terminal bin rather than rejected.
 * Applies in every probe mode, because a month drops out for the same reason
 * whether the panel charted a point median or an averaged mean — and the point
 * probe, which supplies no shares, is the mode the spatial clause cannot speak
 * for.
 */
export function airTemperatureChartedRecordNote(
  layerId: LayerId | null | undefined,
  values: readonly (number | null | undefined)[] | null | undefined
): string | null {
  if (layerId !== AIR_TEMPERATURE_CHARTED_RECORD_LAYER_ID) return null;
  return airTemperatureChartedRecordClause(
    summarizeAirTemperatureChartedRecord(values)
  );
}
