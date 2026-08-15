import {
  type LayerConfig,
  type YearMonth,
  compareYm,
  formatYm,
} from "../lib/timeline";

/**
 * Says, in one line, what "current" means for the layer on screen.
 *
 * The timeline stops at the newest month NASA has actually published, which
 * is never the current month: a monthly composite can only be built once its
 * month has closed, and each product then takes its own processing time —
 * MODIS composites land a few weeks later, MERRA-2 reanalysis a couple of
 * months, GLDAS around five. The UI never said so, and the silence read as a
 * fault: users hit the end of the scrubber in August, found no July, and
 * concluded the site was broken rather than that July does not exist yet.
 *
 * The lag is computed from the record end rather than written down per
 * product, so it cannot drift: boot-time freshness probing (lib/freshness.ts)
 * moves a layer's record end forward whenever GIBS publishes, and this line
 * follows it in the same breath.
 */
export interface DataCurrencyNote {
  /** Resting line for the timeline status row. Kept short enough to stay on
   *  one line at 390px — the row's reserved height is what keeps the bottom
   *  HUD from growing over the globe. */
  text: string;
  /** The fuller "why", for the row's tooltip and accessible description. */
  detail: string;
}

/** Whole months from `from` to `to`, negative when `from` is the later one. */
function monthsBetween(from: YearMonth, to: YearMonth): number {
  return (to.year - from.year) * 12 + (to.month - from.month);
}

/**
 * @param layer   the layer on screen (for cadence and the product's name)
 * @param recordEnd the newest entry the timeline offers for it
 * @param today   the real-world current month, passed in to stay pure
 */
export function dataCurrencyNote(
  layer: LayerConfig,
  recordEnd: YearMonth,
  today: YearMonth
): DataCurrencyNote {
  const product = layer.dataset?.shortName ?? layer.wmsLayer;

  // Annual products are a year behind by construction, so a month count would
  // overstate a lag that is really just the cadence.
  if (layer.cadence === "annual") {
    return {
      text: `Newest data: ${recordEnd.year} · annual product`,
      detail:
        `${product} publishes once a year, so the newest year on the ` +
        `timeline is ${recordEnd.year}. Later years have not been ` +
        `released yet.`,
    };
  }

  const label = formatYm(recordEnd);
  const lag = monthsBetween(recordEnd, today);

  // A record that reaches the current month (or somehow past it) has no lag
  // worth explaining — say where it ends and stop.
  if (lag <= 0 || compareYm(recordEnd, today) >= 0) {
    return {
      text: `Newest data: ${label}`,
      detail: `${product} has published through ${label}.`,
    };
  }

  const plural = lag === 1 ? "month" : "months";
  return {
    text: `Newest data: ${label} · ${lag} ${plural} behind ${formatYm(today)}`,
    detail:
      `${product} composites are released after the month closes and ` +
      `processing finishes, so the record ends at ${label} — ` +
      `${lag} ${plural} behind ${formatYm(today)}. Later months have not ` +
      `been published yet.`,
  };
}
