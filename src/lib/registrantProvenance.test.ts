import { describe, expect, it } from "vitest";
import {
  composeEnvironmentBrief,
  unsupportedBriefLanguageHits,
  type EnvironmentBriefInput,
  type EnvironmentSignalBrief,
  type EnvironmentSignalId,
} from "./environmentBrief";
import {
  parseDoiRegistrant,
  registrantAuthority,
  summarizeRegistrantProvenance,
} from "./registrantProvenance";

/** A fully-usable four-signal brief, all observations within availability. */
const USABLE_INPUT: EnvironmentBriefInput = {
  vegetation: {
    dataMonth: { year: 2026, month: 1 },
    value: 0.61,
    validFraction: 0.82,
  },
  rainfall: {
    dataMonth: { year: 2026, month: 1 },
    value: 0.00012,
    validFraction: 0.74,
  },
  soilMoisture: {
    dataMonth: { year: 2026, month: 1 },
    value: 6.4,
    validFraction: 0.67,
  },
  airTemperature: {
    dataMonth: { year: 2026, month: 1 },
    value: 289.4,
    validFraction: 0.93,
  },
  availableThrough: { year: 2026, month: 3 },
};

function signalsFor(input: EnvironmentBriefInput) {
  return composeEnvironmentBrief(input).signals;
}

/** Override one signal's cited DOI, so multi-authority cases are testable. */
function withDoi(
  signals: EnvironmentSignalBrief[],
  id: EnvironmentSignalId,
  doi: string
): EnvironmentSignalBrief[] {
  return signals.map((signal) =>
    signal.id === id ? { ...signal, source: { ...signal.source, doi } } : signal
  );
}

describe("parseDoiRegistrant", () => {
  it("reads the 10.<registrant> prefix from a well-formed DOI", () => {
    expect(parseDoiRegistrant("10.5067/MODIS/MOD13A3.061")).toBe("10.5067");
    expect(parseDoiRegistrant("10.5067/AP1B0BA5PD2K")).toBe("10.5067");
    expect(parseDoiRegistrant("10.24381/cds.abc123")).toBe("10.24381");
  });

  it("trims surrounding whitespace before parsing", () => {
    expect(parseDoiRegistrant("  10.1234/xyz \n")).toBe("10.1234");
  });

  it("returns null rather than inventing a registrant for bad input", () => {
    // No suffix slash: a prefix alone is not a resolvable DOI.
    expect(parseDoiRegistrant("10.5067")).toBeNull();
    expect(parseDoiRegistrant("")).toBeNull();
    expect(parseDoiRegistrant("   ")).toBeNull();
    expect(parseDoiRegistrant("not-a-doi")).toBeNull();
    // Missing the mandatory "10." registry prefix.
    expect(parseDoiRegistrant("11.5067/x")).toBeNull();
    expect(parseDoiRegistrant(undefined)).toBeNull();
    expect(parseDoiRegistrant(null)).toBeNull();
  });
});

describe("registrantAuthority", () => {
  it("names NASA ESDIS for the Earthdata prefix and nothing else", () => {
    expect(registrantAuthority("10.5067")).toBe("NASA ESDIS (Earthdata)");
    expect(registrantAuthority("10.24381")).toBeNull();
  });
});

describe("summarizeRegistrantProvenance", () => {
  it("flags the whole brief as tracing to one registering authority", () => {
    const summary = summarizeRegistrantProvenance(signalsFor(USABLE_INPUT));

    expect(summary.kind).toBe("registrant-provenance");
    expect(summary.consideredSignalIds).toEqual([
      "vegetation",
      "rainfall",
      "soil-moisture",
      "air-temperature",
    ]);
    // Three distinct products (NDVI, GLDAS, MERRA-2) but one registrant.
    expect(summary.distinctRegistrants).toBe(1);
    expect(summary.unknownRegistrantSignalIds).toEqual([]);
    expect(summary.singleRegistrant).toBe(true);
    expect(summary.groups[0]).toMatchObject({
      registrant: "10.5067",
      authority: "NASA ESDIS (Earthdata)",
      products: ["MOD13A3 v061", "GLDAS_NOAH025_M v2.1", "M2TMNXSLV v5.12.4"],
      signalIds: ["vegetation", "rainfall", "soil-moisture", "air-temperature"],
    });
    // One registrant backs multiple distinct products — the finding this lens
    // adds over per-product source independence.
    expect(summary.sharedRegistrants).toHaveLength(1);
    expect(summary.statement).toBe(
      "4 usable observations across 3 distinct products, all trace to one registering authority — NASA ESDIS (Earthdata) (10.5067); distinct products but a single registrant, so they are not institutionally independent and a registration- or curation-authority-wide change would affect them together."
    );
  });

  it("keeps every considered signal in a group or the unknown list, provenance intact", () => {
    const summary = summarizeRegistrantProvenance(signalsFor(USABLE_INPUT));
    const grouped = summary.groups.flatMap((group) => group.signalIds);
    expect([...grouped, ...summary.unknownRegistrantSignalIds].sort()).toEqual(
      ["air-temperature", "rainfall", "soil-moisture", "vegetation"].sort()
    );
    for (const group of summary.groups) {
      expect(group.registrant).toMatch(/^10\.\d+$/);
      expect(group.products.length).toBeGreaterThan(0);
    }
  });

  it("reports multiple authorities when a signal cites a different registrant", () => {
    // Re-home air temperature under a hypothetical non-Earthdata registrant.
    const signals = withDoi(
      signalsFor(USABLE_INPUT),
      "air-temperature",
      "10.24381/cds.airtemp"
    );
    const summary = summarizeRegistrantProvenance(signals);

    expect(summary.distinctRegistrants).toBe(2);
    expect(summary.singleRegistrant).toBe(false);
    // The Earthdata registrant still spans two distinct products (NDVI, GLDAS).
    expect(summary.sharedRegistrants).toHaveLength(1);
    expect(summary.sharedRegistrants[0].registrant).toBe("10.5067");
    expect(summary.statement).toBe(
      "4 usable observations across 2 registering authorities: NASA ESDIS (Earthdata) (10.5067); DOI registrant 10.24381. vegetation, rainfall, soil-moisture share NASA ESDIS (Earthdata) (10.5067) across 2 distinct products — co-registered, not institutionally independent."
    );
  });

  it("lists signals whose DOI carries no parseable registrant, never guessing", () => {
    const signals = withDoi(
      signalsFor(USABLE_INPUT),
      "air-temperature",
      "not-a-doi"
    );
    const summary = summarizeRegistrantProvenance(signals);

    expect(summary.unknownRegistrantSignalIds).toEqual(["air-temperature"]);
    expect(summary.singleRegistrant).toBe(false);
    expect(summary.distinctRegistrants).toBe(1);
    expect(summary.statement).toBe(
      "3 of 4 usable observations across 2 distinct products, all trace to one registering authority — NASA ESDIS (Earthdata) (10.5067); distinct products but a single registrant, so they are not institutionally independent. DOI registrant not parseable for: air-temperature."
    );
  });

  it("considers only usable observations by default", () => {
    // Soil moisture present but not-yet-published => not usable.
    const summary = summarizeRegistrantProvenance(
      signalsFor({
        ...USABLE_INPUT,
        soilMoisture: { dataMonth: { year: 2026, month: 9 }, value: 6.4 },
      })
    );

    expect(summary.consideredSignalIds).not.toContain("soil-moisture");
    expect(summary.singleRegistrant).toBe(true);
  });

  it("can describe the whole registrant basis with include: all", () => {
    const summary = summarizeRegistrantProvenance(
      signalsFor({ ...USABLE_INPUT, soilMoisture: null }),
      { include: "all" }
    );

    // soil-moisture is unavailable but still cites a 10.5067 DOI.
    expect(summary.consideredSignalIds).toContain("soil-moisture");
    expect(summary.groups[0].signalIds).toContain("soil-moisture");
  });

  it("is not applicable to a single usable signal", () => {
    const summary = summarizeRegistrantProvenance(
      signalsFor({
        ...USABLE_INPUT,
        rainfall: null,
        soilMoisture: null,
        airTemperature: null,
      })
    );

    expect(summary.consideredSignalIds).toEqual(["vegetation"]);
    expect(summary.singleRegistrant).toBe(false);
    expect(summary.statement).toBe(
      "1 usable observation registered by NASA ESDIS (Earthdata) (10.5067); institutional independence is not applicable to a single signal."
    );
  });

  it("handles a brief with no usable observations", () => {
    const summary = summarizeRegistrantProvenance(
      signalsFor({
        vegetation: null,
        rainfall: null,
        soilMoisture: null,
        airTemperature: null,
        availableThrough: { year: 2026, month: 3 },
      })
    );

    expect(summary.consideredSignalIds).toEqual([]);
    expect(summary.distinctRegistrants).toBe(0);
    expect(summary.singleRegistrant).toBe(false);
    expect(summary.statement).toBe(
      "No usable observations to assess for registering-authority provenance."
    );
  });

  it("keeps statements free of forecast, risk, and causal language", () => {
    const cases = [
      signalsFor(USABLE_INPUT),
      withDoi(signalsFor(USABLE_INPUT), "air-temperature", "10.24381/cds.x"),
      withDoi(signalsFor(USABLE_INPUT), "air-temperature", "not-a-doi"),
      signalsFor({
        ...USABLE_INPUT,
        rainfall: null,
        soilMoisture: null,
        airTemperature: null,
      }),
    ];
    for (const signals of cases) {
      const summary = summarizeRegistrantProvenance(signals);
      expect(unsupportedBriefLanguageHits(summary.statement)).toEqual([]);
    }
  });
});
