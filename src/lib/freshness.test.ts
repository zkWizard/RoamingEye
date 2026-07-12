import { describe, it, expect, vi, afterEach } from "vitest";
import {
  describeDomainsUrl,
  parseLatestFromDomains,
  refreshDataLatest,
  FRESHNESS_FAMILIES,
} from "./freshness";
import {
  LAYERS,
  DATA_LATEST,
  addMonths,
  monthRangeForLayer,
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

  const domainsResponse = (end: string): Response =>
    new Response(`<Domain>2020-01-01/${end}/P1M</Domain>`);

  /** Route the mock by the probe layer named in the request URL. */
  function respondByLayer(ends: {
    ndvi?: string | Error;
    lst?: string | Error;
    snow?: string | Error;
  }): void {
    mocked.mockImplementation((url: string) => {
      const key = url.includes("NDVI")
        ? "ndvi"
        : url.includes("Land_Surface_Temp")
          ? "lst"
          : "snow";
      const end = ends[key as keyof typeof ends];
      if (end === undefined || end instanceof Error) {
        return Promise.reject(end ?? new Error("network down"));
      }
      return Promise.resolve(domainsResponse(end));
    });
  }

  const dynamicLayers = FRESHNESS_FAMILIES.flatMap((f) => f.layers);

  afterEach(() => {
    // Pins mutate the shared LAYERS config; scrub them between tests.
    for (const id of dynamicLayers) {
      delete (LAYERS[id] as { latest?: YearMonth }).latest;
    }
    mocked.mockReset();
  });

  it("covers every time-varying layer without a compiled latest, exactly once", () => {
    const withCompiledLatest = Object.values(LAYERS)
      .filter((l) => l.latest)
      .map((l) => l.id);
    // Static layers (terrain) have no time dimension to verify.
    const dynamic = Object.values(LAYERS)
      .filter((l) => !l.latest && !l.static)
      .map((l) => l.id)
      .sort();
    expect([...dynamicLayers].sort()).toEqual(dynamic);
    for (const id of dynamicLayers) {
      expect(withCompiledLatest).not.toContain(id);
    }
  });

  it("all families fail → false, nothing moves", async () => {
    respondByLayer({});
    await expect(refreshDataLatest()).resolves.toBe(false);
    const end = monthRangeForLayer(LAYERS.lst).at(-1);
    expect(end).toEqual(DATA_LATEST);
  });

  it("a lagging product never rides the leader's extension", async () => {
    // NDVI two months ahead of the baseline, LST one, snow unreachable.
    const floor = DATA_LATEST;
    const day = (m: YearMonth): string =>
      `${m.year}-${String(m.month).padStart(2, "0")}-01`;
    respondByLayer({
      ndvi: day(addMonths(floor, 2)),
      lst: day(addMonths(floor, 1)),
      snow: new Error("timeout"),
    });
    await expect(refreshDataLatest()).resolves.toBe(true);
    expect(monthRangeForLayer(LAYERS.ndvi).at(-1)).toEqual(addMonths(floor, 2));
    expect(monthRangeForLayer(LAYERS.evi).at(-1)).toEqual(addMonths(floor, 2));
    // LST is offered only its own verified end…
    expect(monthRangeForLayer(LAYERS.lst).at(-1)).toEqual(addMonths(floor, 1));
    // …and the failed family stays on the pre-refresh baseline even though
    // the global latest has moved past it (the old single-probe design
    // would have dragged both to the leader's end — blank months).
    expect(monthRangeForLayer(LAYERS.snow).at(-1)).toEqual(floor);
    // Compiled-latest layers are untouched.
    expect(monthRangeForLayer(LAYERS.airtemp).at(-1)).toEqual(
      LAYERS.airtemp.latest
    );
  });

  it("answers at or behind the baseline change nothing (never backward)", async () => {
    const before = monthRangeForLayer(LAYERS.ndvi).at(-1);
    respondByLayer({
      ndvi: "2020-01-01",
      lst: "2020-01-01",
      snow: "2020-01-01",
    });
    await expect(refreshDataLatest()).resolves.toBe(false);
    expect(monthRangeForLayer(LAYERS.ndvi).at(-1)).toEqual(before);
  });
});
