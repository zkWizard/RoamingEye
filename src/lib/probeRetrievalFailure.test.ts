import { describe, expect, it } from "vitest";

import { HttpError, OfflineError } from "./net";
import {
  PROBE_RETRIEVAL_FAILURE_LINE,
  classifyProbeLoadFailure,
  probeRetrievalFailureNote,
} from "./probeRetrievalFailure";

const URL = "https://gibs.earthdata.nasa.gov/wms.cgi?TIME=2020-01-01";

describe("classifyProbeLoadFailure", () => {
  it("calls the definitive 4xx set the source declining a month", () => {
    // The statuses lib/net.ts documents as "the server understood and said
    // no" — for a GIBS GetMap, a month the product does not publish.
    for (const status of [400, 401, 403, 404, 405, 410, 414, 422]) {
      expect(classifyProbeLoadFailure(new HttpError(URL, status))).toBe(
        "source-declined"
      );
    }
  });

  it("calls a retryable status a transport failure", () => {
    // These survived fetchWithRetry's whole budget, so the month is unknown,
    // not absent.
    for (const status of [500, 502, 503, 504, 429]) {
      expect(classifyProbeLoadFailure(new HttpError(URL, status))).toBe(
        "transport-failed"
      );
    }
  });

  it("calls net.ts's own timeout a transport failure", () => {
    // fetchWithTimeout converts its abort into HttpError(408) precisely so a
    // timeout stays a failure; 408 is not in the definitive set.
    expect(classifyProbeLoadFailure(new HttpError(URL, 408))).toBe(
      "transport-failed"
    );
  });

  it("calls an offline browser a transport failure", () => {
    expect(classifyProbeLoadFailure(new OfflineError(URL))).toBe(
      "transport-failed"
    );
  });

  it("defaults an unrecognized error to transport", () => {
    // A decode failure or a payload-type rejection carries no status. The
    // conservative direction: withholding a domain note costs a sentence,
    // while the reverse reports a broken download as the product's answer.
    expect(classifyProbeLoadFailure(new Error("decode failed"))).toBe(
      "transport-failed"
    );
    expect(classifyProbeLoadFailure(undefined)).toBe("transport-failed");
  });
});

describe("probeRetrievalFailureNote", () => {
  it("speaks for an empty record whose months never arrived", () => {
    expect(probeRetrievalFailureNote([null, null, null], 3)).toBe(
      PROBE_RETRIEVAL_FAILURE_LINE
    );
  });

  it("speaks when only some of an empty record's months failed", () => {
    // The rest were declined. The record is still unsafe to read as the
    // product's answer, because part of it was never seen.
    expect(probeRetrievalFailureNote([null, null, null], 1)).toBe(
      PROBE_RETRIEVAL_FAILURE_LINE
    );
  });

  it("stays silent when every empty month was declined", () => {
    // The case the domain notes exist for, and explain correctly.
    expect(probeRetrievalFailureNote([null, null], 0)).toBeNull();
  });

  it("stays silent for a record that charted anything", () => {
    // A flaky month inside a charted series is a gap, which the record-gap
    // and coverage clauses already own.
    expect(probeRetrievalFailureNote([null, 0.4, null], 2)).toBeNull();
    expect(probeRetrievalFailureNote([0.4], 0)).toBeNull();
  });

  it("stays silent for an empty month list", () => {
    expect(probeRetrievalFailureNote([], 0)).toBeNull();
  });

  it("never claims a reading, a direction or a cause in the data", () => {
    // The whole point is that nothing was measured, so the line must not read
    // as an observation about the point or the product.
    const line = PROBE_RETRIEVAL_FAILURE_LINE.toLowerCase();
    for (const forbidden of [
      "no data at this point",
      "not evidence of a failed retrieval",
      "warmer",
      "colder",
      "at least",
      "zero",
      "understates",
    ]) {
      expect(line).not.toContain(forbidden);
    }
    expect(line).toContain("not a reading");
  });
});
