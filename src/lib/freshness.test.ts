import { describe, it, expect } from "vitest";
import { describeDomainsUrl, parseLatestFromDomains } from "./freshness";

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
  it("asks for the NDVI time domain from just before the baseline", () => {
    const url = describeDomainsUrl({ year: 2026, month: 5 });
    expect(url).toContain("REQUEST=DescribeDomains");
    expect(url).toContain("LAYER=MODIS_Terra_L3_NDVI_Monthly");
    expect(url).toContain("TILEMATRIXSET=1km");
    // The slash must stay literal — GIBS 400s a percent-encoded range.
    expect(url).toContain("TIME=2026-04-01/2028-01-01");
  });
});
