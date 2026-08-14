import { describe, expect, it } from "vitest";
import {
  asSentence,
  BARE_PROBE_ABSENCE_LINE,
  probeAbsenceStatusLine,
} from "./probeAbsenceStatus";
import { emptyMarineProbeNote } from "./marineProbeDomain";

const SST = "sst" as const;

/** An empty record: every sampled month came back without a usable value. */
const EMPTY = [null, null, null, null];

describe("asSentence", () => {
  it("capitalises and terminates a bare clause", () => {
    expect(asSentence("only 40% of the box returned data")).toBe(
      "Only 40% of the box returned data."
    );
  });

  it("leaves existing terminal punctuation alone", () => {
    expect(asSentence("only 40% of the box returned data.")).toBe(
      "Only 40% of the box returned data."
    );
  });
});

describe("probeAbsenceStatusLine", () => {
  it("falls back to the bare line when nothing is known about the absence", () => {
    expect(probeAbsenceStatusLine(null, null)).toBe(BARE_PROBE_ABSENCE_LINE);
    expect(probeAbsenceStatusLine()).toBe(BARE_PROBE_ABSENCE_LINE);
  });

  it("lets a domain note REPLACE the bare line rather than follow it", () => {
    const note =
      "Sea Surface Temperature: defined over the ocean surface only.";
    const line = probeAbsenceStatusLine(null, note);
    expect(line).toBe(note);
    expect(line).not.toContain(BARE_PROBE_ABSENCE_LINE);
  });

  it("leads with a spatial support note, which describes what was sampled", () => {
    expect(
      probeAbsenceStatusLine("only 40% of the box returned data", null)
    ).toBe("Only 40% of the box returned data.");
  });

  it("keeps a domain note after a support note rather than dropping evidence", () => {
    expect(
      probeAbsenceStatusLine(
        "only 40% of the box returned data",
        "Domain note."
      )
    ).toBe("Only 40% of the box returned data. Domain note.");
  });

  it("never precedes the real marine domain note with the retrieval-failure line", () => {
    // The regression this module exists for: probing an inland point with the
    // SST layer selected. `marineProbeDomain` was written because the bare line
    // "reports a domain boundary as a retrieval failure", and its note is
    // deliberately two-sided about what the absence means — so the assertion
    // must not lead it.
    const note = emptyMarineProbeNote(SST, EMPTY);
    expect(note).not.toBeNull();
    const line = probeAbsenceStatusLine(null, note);
    expect(line).toBe(note);
    expect(line.startsWith(BARE_PROBE_ABSENCE_LINE)).toBe(false);
    expect(line).not.toContain("No data at this point");
  });
});
