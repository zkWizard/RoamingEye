import { describe, it, expect, vi, afterEach } from "vitest";
import {
  describeDomainsUrl,
  isObservableMonth,
  parseLatestFromDomains,
  refreshDataLatest,
  FRESHNESS_FAMILIES,
} from "./freshness";
import {
  LAYERS,
  DATA_LATEST,
  addMonths,
  compareYm,
  monthRangeForLayer,
  type LayerId,
  type YearMonth,
} from "./timeline";
import { fetchWithRetry } from "./net";

vi.mock("./net", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./net")>();
  return { ...actual, fetchWithRetry: vi.fn() };
});

// The real response shape (captured live from GIBS, 2026-07).
const DOMAINS_XML =
  `<Domains xmlns:ows='http://www.opengis.net/ows/1.1'><SpaceDomain>` +
  `<BoundingBox miny='-90' maxx='180' crs='urn:ogc:def:crs:OGC:2:84' minx='-180' maxy='90'/>` +
  `</SpaceDomain><DimensionDomain><ows:Identifier>time</ows:Identifier>` +
  `<Domain>2020-02-01/2025-03-01/P1M,2025-05-01/2026-05-01/P1M</Domain>` +
  `<Size>2</Size></DimensionDomain></Domains>`;

describe("parseLatestFromDomains", () => {
  it("returns the largest interval end across all intervals", () => {
    expect(parseLatestFromDomains(DOMAINS_XML)).toEqual({
      year: 2026,
      month: 5,
    });
  });

  it("handles a single interval", () => {
    expect(
      parseLatestFromDomains("<Domain>2025-05-01/2026-06-01/P1M</Domain>")
    ).toEqual({ year: 2026, month: 6 });
  });

  it("handles a bare date (no interval syntax)", () => {
    expect(parseLatestFromDomains("<Domain>2026-07-01</Domain>")).toEqual({
      year: 2026,
      month: 7,
    });
  });

  it("returns null for malformed responses — never moves the timeline", () => {
    expect(parseLatestFromDomains("")).toBeNull();
    expect(parseLatestFromDomains("<html>gateway error</html>")).toBeNull();
    expect(parseLatestFromDomains("<Domain></Domain>")).toBeNull();
    expect(
      parseLatestFromDomains("<Domain>not-a-date/either</Domain>")
    ).toBeNull();
    expect(parseLatestFromDomains("<Domain>2026-99-01</Domain>")).toBeNull();
  });
});

describe("isObservableMonth", () => {
  // Mid-month, so "the current month" is unambiguously in progress.
  const now = new Date("2026-08-14T09:30:00Z");

  it("accepts past months and the in-progress current month", () => {
    expect(isObservableMonth({ year: 2026, month: 7 }, now)).toBe(true);
    expect(isObservableMonth({ year: 2026, month: 8 }, now)).toBe(true);
    expect(isObservableMonth({ year: 2000, month: 3 }, now)).toBe(true);
  });

  it("rejects a month that has not begun", () => {
    expect(isObservableMonth({ year: 2026, month: 9 }, now)).toBe(false);
    expect(isObservableMonth({ year: 2028, month: 1 }, now)).toBe(false);
  });

  it("judges the boundary in UTC, not local time", () => {
    // 23:30 on the last day of August in UTC — a UTC+2 clock is already in
    // September, but September is not observable yet.
    const lastInstant = new Date("2026-08-31T23:30:00Z");
    expect(isObservableMonth({ year: 2026, month: 9 }, lastInstant)).toBe(
      false
    );
    expect(isObservableMonth({ year: 2026, month: 8 }, lastInstant)).toBe(true);
  });
});

describe("describeDomainsUrl", () => {
  it("asks for a layer's own time domain from just before the baseline", () => {
    const url = describeDomainsUrl("ndvi", { year: 2026, month: 5 });
    expect(url).toContain("REQUEST=DescribeDomains");
    expect(url).toContain("LAYER=MODIS_Terra_L3_NDVI_Monthly");
    expect(url).toContain("TILEMATRIXSET=1km");
    // The slash must stay literal — GIBS 400s a percent-encoded range.
    expect(url).toContain("TIME=2026-04-01/2028-01-01");
  });

  it("uses each probe layer's identifier and matrix set", () => {
    const lstUrl = describeDomainsUrl("lst", { year: 2026, month: 5 });
    expect(lstUrl).toContain(
      "LAYER=MODIS_Terra_L3_Land_Surface_Temp_Monthly_Day"
    );
    expect(lstUrl).toContain("TILEMATRIXSET=2km");
  });
});

describe("refreshDataLatest (per-product families)", () => {
  const mocked = vi.mocked(fetchWithRetry);

  // Pin the clock: the observability ceiling is judged against it, so these
  // cases must not depend on when the suite runs. Well past the compiled
  // baseline, so every fixture month below is observable.
  const NOW = new Date("2026-12-15T00:00:00Z");

  const domainsResponse = (end: string): Response =>
    new Response(`<Domain>2020-01-01/${end}/P1M</Domain>`);

  /** A month as the day-stamp DescribeDomains reports it. */
  const day = (m: YearMonth): string =>
    `${m.year}-${String(m.month).padStart(2, "0")}-01`;

  /** Route the mock by the probe layer named in the request URL. An
   *  unlisted probe rejects, which is how a family is failed in a test. */
  function respondByLayer(
    ends: Partial<Record<LayerId, string | Error>>
  ): void {
    mocked.mockImplementation((url: string) => {
      const probe = FRESHNESS_FAMILIES.map((f) => f.probe).find((id) =>
        url.includes(`LAYER=${LAYERS[id].wmsLayer}`)
      );
      const end = probe ? ends[probe] : undefined;
      if (end === undefined || end instanceof Error) {
        return Promise.reject(end ?? new Error("network down"));
      }
      return Promise.resolve(domainsResponse(end));
    });
  }

  const dynamicLayers = FRESHNESS_FAMILIES.flatMap((f) => f.layers);
  // The compiled baselines, captured before any test pins over them. The
  // lagging layers *have* one and must get it back — deleting it would hand
  // them the global DATA_LATEST and silently undo the lag they encode.
  const compiled = new Map(
    dynamicLayers.map((id) => [id, LAYERS[id].latest] as const)
  );

  afterEach(() => {
    // Pins mutate the shared LAYERS config; restore them between tests.
    for (const id of dynamicLayers) {
      const layer = LAYERS[id] as { latest?: YearMonth };
      const baseline = compiled.get(id);
      if (baseline) layer.latest = baseline;
      else delete layer.latest;
    }
    mocked.mockReset();
  });

  it("covers each verified layer exactly once, and nothing static", () => {
    // Families partition their layers: a layer inheriting two products'
    // schedules would take whichever answer landed last.
    expect(new Set(dynamicLayers).size).toBe(dynamicLayers.length);
    for (const id of dynamicLayers) {
      expect(LAYERS[id].static ?? false).toBe(false);
    }
    // Every atmosphere layer is verified — the lag in their compiled
    // baselines is what made a boot check worth having.
    expect(dynamicLayers).toContain("airtemp");
    expect(dynamicLayers).toContain("aerosol");
    expect(dynamicLayers).toContain("precip");
  });

  it("a family's probe speaks for layers that share its granule", () => {
    // GLDAS precipitation and soil moisture are one granule, one DOI.
    const gldas = FRESHNESS_FAMILIES.find((f) => f.probe === "precip");
    expect(gldas?.layers).toEqual(["precip", "soil"]);
    expect(LAYERS.soil.dataset?.shortName).toBe(
      LAYERS.precip.dataset?.shortName
    );
    expect(LAYERS.soil.dataset?.doi).toBe(LAYERS.precip.dataset?.doi);
    // MERRA-2 air temperature and aerosol are NOT: different collections
    // (M2TMNXSLV vs M2TMNXAER), so they get a probe each.
    expect(LAYERS.airtemp.dataset?.shortName).not.toBe(
      LAYERS.aerosol.dataset?.shortName
    );
  });

  it("all families fail → false, nothing moves", async () => {
    respondByLayer({});
    await expect(refreshDataLatest(NOW)).resolves.toBe(false);
    const end = monthRangeForLayer(LAYERS.lst).at(-1);
    expect(end).toEqual(DATA_LATEST);
  });

  it("a lagging product never rides the leader's extension", async () => {
    // NDVI two months ahead of the baseline, LST one, snow unreachable.
    const floor = DATA_LATEST;
    respondByLayer({
      ndvi: day(addMonths(floor, 2)),
      lst: day(addMonths(floor, 1)),
      snow: new Error("timeout"),
    });
    await expect(refreshDataLatest(NOW)).resolves.toBe(true);
    expect(monthRangeForLayer(LAYERS.ndvi).at(-1)).toEqual(addMonths(floor, 2));
    expect(monthRangeForLayer(LAYERS.evi).at(-1)).toEqual(addMonths(floor, 2));
    // LST is offered only its own verified end…
    expect(monthRangeForLayer(LAYERS.lst).at(-1)).toEqual(addMonths(floor, 1));
    // …and the failed family stays on the pre-refresh baseline even though
    // the global latest has moved past it (the old single-probe design
    // would have dragged both to the leader's end — blank months).
    expect(monthRangeForLayer(LAYERS.snow).at(-1)).toEqual(floor);
    // The lagging families answered nothing, so they hold their own
    // compiled baselines — well behind the month NDVI just verified.
    expect(monthRangeForLayer(LAYERS.airtemp).at(-1)).toEqual(
      compiled.get("airtemp")
    );
    expect(monthRangeForLayer(LAYERS.precip).at(-1)).toEqual(
      compiled.get("precip")
    );
  });

  it("answers at or behind the baseline change nothing (never backward)", async () => {
    const before = monthRangeForLayer(LAYERS.ndvi).at(-1);
    respondByLayer({
      ndvi: "2020-01-01",
      lst: "2020-01-01",
      snow: "2020-01-01",
    });
    await expect(refreshDataLatest(NOW)).resolves.toBe(false);
    expect(monthRangeForLayer(LAYERS.ndvi).at(-1)).toEqual(before);
  });

  it("a domain end past the current month is discarded, not offered", async () => {
    // The DescribeDomains window runs two years ahead (describeDomainsUrl), so
    // a declared-but-unproduced domain end is parseable and plausible-looking.
    // Accepting it would put ~13 months of 404-ing tiles on the timeline.
    const before = monthRangeForLayer(LAYERS.ndvi).at(-1);
    respondByLayer({
      ndvi: "2028-01-01",
      lst: "2028-01-01",
      snow: "2028-01-01",
    });
    await expect(refreshDataLatest(NOW)).resolves.toBe(false);
    expect(monthRangeForLayer(LAYERS.ndvi).at(-1)).toEqual(before);
    expect(monthRangeForLayer(LAYERS.snow).at(-1)).toEqual(before);
  });

  it("one family's future end cannot drag the others forward", async () => {
    const floor = DATA_LATEST;
    const day = (m: YearMonth): string =>
      `${m.year}-${String(m.month).padStart(2, "0")}-01`;
    respondByLayer({
      ndvi: "2030-01-01", // declared domain runs ahead of production
      lst: day(addMonths(floor, 1)), // genuinely published
      snow: day(floor),
    });
    await expect(refreshDataLatest(NOW)).resolves.toBe(true);
    // NDVI falls back to the curated baseline rather than to LST's month:
    // rejecting an answer must not borrow another product's schedule.
    expect(monthRangeForLayer(LAYERS.ndvi).at(-1)).toEqual(floor);
    expect(monthRangeForLayer(LAYERS.evi).at(-1)).toEqual(floor);
    expect(monthRangeForLayer(LAYERS.lst).at(-1)).toEqual(addMonths(floor, 1));
  });

  it("a lagging family extends to a verified end below the global baseline", async () => {
    // The defect this covers: GLDAS trails the MODIS composites, so its
    // verified end sits *under* DATA_LATEST. Measured against the global
    // floor it looked like a stale answer and was discarded, leaving
    // published months (Feb–Mar 2026, when this was written) unreachable.
    const baseline = compiled.get("precip")!;
    const verified = addMonths(baseline, 2);
    expect(compareYm(verified, DATA_LATEST)).toBeLessThan(0);

    respondByLayer({ precip: day(verified) });
    await expect(refreshDataLatest()).resolves.toBe(true);
    expect(monthRangeForLayer(LAYERS.precip).at(-1)).toEqual(verified);
    // Soil moisture is the same granule, so it extends with it.
    expect(monthRangeForLayer(LAYERS.soil).at(-1)).toEqual(verified);
  });

  it("a failed lagging family falls back to its own baseline, not the global", async () => {
    // The mirror risk: inheriting DATA_LATEST would advertise months
    // MERRA-2 has not published — blank tiles offered as observations.
    respondByLayer({});
    await expect(refreshDataLatest()).resolves.toBe(false);
    for (const id of ["airtemp", "aerosol"] as const) {
      expect(monthRangeForLayer(LAYERS[id]).at(-1)).toEqual(compiled.get(id));
      expect(compareYm(LAYERS[id].latest!, DATA_LATEST)).toBeLessThan(0);
    }
  });

  it("an answer behind a lagging family's own baseline is ignored", async () => {
    // Forward-only applies per family: a shrunken domain must not rewind a
    // record the compiled baseline already vouches for.
    const baseline = compiled.get("aerosol")!;
    respondByLayer({ aerosol: day(addMonths(baseline, -3)) });
    await expect(refreshDataLatest()).resolves.toBe(false);
    expect(monthRangeForLayer(LAYERS.aerosol).at(-1)).toEqual(baseline);
  });

  it("asks a lagging family about its own baseline, not the global month", () => {
    // The window opens one month before the family's floor; anchoring it to
    // DATA_LATEST would start the query after months it needs to discover.
    const url = describeDomainsUrl("precip", LAYERS.precip.latest!);
    expect(url).toContain("TIME=2025-12-01/");
  });
});
