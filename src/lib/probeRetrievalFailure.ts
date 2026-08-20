/**
 * Say when an empty probe record is the network's doing rather than the
 * atmosphere's.
 *
 * `lib/net.ts` goes to real trouble to keep failure kinds apart. It types
 * `OfflineError` for a browser the UA reports as disconnected, `HttpError` for
 * a status, and it converts its own timeout into `HttpError(408)` specifically
 * so a timeout can never be mistaken for a caller abort — a conflation that
 * once left the boot curtain up over the whole app for ever. It also names the
 * one class that is *not* a failure at all: `isDefinitiveStatus` covers the
 * 4xx set where "the server understood and said no", which for a GIBS WMS
 * GetMap is the source declining to draw a month it does not publish.
 *
 * `ProbeSampler.sampleMonth` discarded that entire taxonomy. Every load error
 * except an abort returned `{ value: null, validFraction: 0 }` under the
 * comment "A missing month is a gap in the chart, not a failure" — which is
 * true of a declined month and false of every other kind, and the code applied
 * it to all of them. A per-month failure never rejects the sampling promise,
 * so `runProbe`'s own `.catch` — which already carries the right sentence,
 * "Sampling failed — check the connection and retry." — cannot see one.
 *
 * What the reader got instead was a claim about the world. An empty record
 * falls through to `probeAbsenceStatus`, whose bare line is
 * "No data at this point for this layer." — an unqualified assertion about the
 * probed point — or to a domain note, and the atmosphere and land-surface
 * notes end "not evidence of a failed retrieval". A reader whose connection
 * had dropped read exactly the sentence that rules out what had happened,
 * attributed to MERRA-2 or GLDAS by name. Turning wifi off and probing any
 * layer reproduces it: `isOnline()` is checked per attempt, so all 250-odd
 * months throw `OfflineError` before a request is even made, and the panel
 * reports the resulting silence as the product's answer.
 *
 * This module decides only the case where that inference is unsafe: the record
 * is wholly empty *and* at least one month failed on transport. It stays
 * silent for a record that has any value in it — a single flaky month inside
 * an otherwise charted series is genuinely a gap in the chart, and the
 * existing gap and coverage clauses already speak for it — and silent when
 * every empty month was declined, which is the case the domain notes exist to
 * explain and explain correctly.
 *
 * Ranked above the domain notes at the call site for the reason the domain
 * notes themselves give: a note about what a product covers is a claim about
 * the product, and a record that never arrived is no evidence about the
 * product at all. At most one of the two is ever rendered.
 *
 * Pure, render-free logic (see probeRetrievalFailure.test.ts).
 */

import { HttpError, isDefinitiveStatus } from "./net";

/**
 * How a month's source image failed to load.
 *
 * `source-declined` is the server answering definitively — the month is not
 * published, so its absence *is* the record. `transport-failed` is everything
 * else that survived `fetchWithRetry`'s budget: offline, a timeout, a 5xx, a
 * rate limit the retries could not outlast, or a body that never decoded. The
 * two must not be merged, because only the first licenses a statement about
 * the data.
 */
export type ProbeMonthLoadFailure = "source-declined" | "transport-failed";

/**
 * Classify a load error that reached `sampleMonth`'s catch.
 *
 * Aborts are re-thrown before this is called, so they never arrive here.
 * Anything not recognizable as a definitive HTTP status is treated as
 * transport: the conservative direction, since mislabelling a real failure as
 * the product's answer is the defect this exists to close, while the reverse
 * only withholds a sentence.
 */
export function classifyProbeLoadFailure(err: unknown): ProbeMonthLoadFailure {
  if (err instanceof HttpError && isDefinitiveStatus(err.status)) {
    return "source-declined";
  }
  return "transport-failed";
}

/** The status line for an empty record whose months failed to arrive. */
export const PROBE_RETRIEVAL_FAILURE_LINE =
  "No months could be retrieved — this is a failed download, not a reading. " +
  "Check the connection and retry.";

/**
 * The note for a record that came back empty because its imagery never
 * arrived, or null when the record's silence is safe to attribute to the data.
 *
 * @param values the charted series, in gradient positions
 * @param transportFailureMonths how many months failed on transport
 */
export function probeRetrievalFailureNote(
  values: readonly (number | null)[],
  transportFailureMonths: number
): string | null {
  if (transportFailureMonths <= 0) return null;
  // A record with any value in it was charted; a single unreachable month
  // there is a gap, which the record-gap and coverage clauses already own.
  if (values.some((value) => value !== null)) return null;
  return PROBE_RETRIEVAL_FAILURE_LINE;
}
