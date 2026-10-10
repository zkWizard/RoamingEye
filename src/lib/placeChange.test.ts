import { describe, expect, it } from "vitest";
import {
  annualValue,
  effectiveYears,
  formatHeadline,
  formatSpan,
  matchingPreset,
  monthlyDisplayValue,
  PLACE_CHANGE_METRICS,
  placeChange,
  placeMetricShown,
  plateBoundaryCrosses,
  presetRange,
  quakeQueryUrl,
  tallyQuakes,
  tallyVolcanoes,
  usableYears,
  yearBounds,
  type PlaceChangeLayerId,
} from "./placeChange";
import type { GeoGeometry } from "./geojson";

const metric = (id: PlaceChangeLayerId) =>
  PLACE_CHANGE_METRICS.find((m) => m.layerId === id)!;

const square: GeoGeometry = {
  type: "Polygon",
  coordinates: [
    [
      [-100, 30],
      [-90, 30],
      [-90, 40],
      [-100, 40],
      [-100, 30],
    ],
  ],
};

describe("monthly and annual values", () => {
  it("converts kelvin layers to °C and leaves the others in their unit", () => {
    expect(monthlyDisplayValue("airtemp", 300, 1)).toBeCloseTo(26.85, 6);
    expect(monthlyDisplayValue("lst", 273.15, 1)).toBeCloseTo(0, 6);
    expect(monthlyDisplayValue("ndvi", 0.42, 0.9)).toBe(0.42);
    expect(monthlyDisplayValue("precip", null, 0)).toBeNull();
  });

  it("scales snow to a share of the whole area, with an empty month as 0%", () => {
    expect(monthlyDisplayValue("snow", 80, 0.25)).toBe(20);
    expect(monthlyDisplayValue("snow", null, 0)).toBe(0);
  });

  const months = (values: (number | null)[], validFraction = 1) =>
    values.map((value) => ({ value, validFraction }));

  it("needs most of a seasonal cycle before it reports a year", () => {
    const eight = [1, 1, 1, 1, 1, 1, 1, 1, null, null, null, null];
    expect(annualValue("ndvi", months(eight))).toBeNull();
    expect(
      annualValue("ndvi", months([...eight.slice(0, 8), 4, null, null, null]))
    ).toBe(12 / 9);
  });

  it("turns a mean precipitation rate into an annual total", () => {
    expect(annualValue("precip", months(Array(12).fill(2)))).toBeCloseTo(
      730.5,
      6
    );
  });

  it("judges coverage against the place's own best month, not the boundary", () => {
    // A boundary that is mostly sea: land never covers more than 20% of it.
    const island = months(Array(12).fill(0.5), 0.2);
    expect(annualValue("ndvi", island)).toBe(0.5);
    // A month drawn over a sliver of that land drops out; the rest still count.
    const slivered = [
      ...island.slice(0, 11),
      { value: 0.9, validFraction: 0.01 },
    ];
    expect(annualValue("ndvi", slivered)).toBe(0.5);
  });

  it("keeps every snow month, since its value is already a share of the area", () => {
    const snow = [
      ...months(Array(6).fill(0), 0),
      ...months(Array(6).fill(10), 0.1),
    ];
    expect(annualValue("snow", snow)).toBe(5);
  });
});

describe("year ranges", () => {
  it("only offers years the layer has (nearly) fully published", () => {
    const years = usableYears("ndvi");
    // MOD13A3 starts in March 2000, so 2000 is not a whole year.
    expect(years[0]).toBe(2001);
    expect(years).not.toContain(years[years.length - 1] + 1);
  });

  it("narrows a range to what a layer holds, or gives up", () => {
    const years = [2001, 2002, 2003, 2010, 2025];
    expect(effectiveYears(years, { from: 1990, to: 2025 })).toEqual({
      from: 2001,
      to: 2025,
    });
    // Only 2010 falls inside, and one year is not a change.
    expect(effectiveYears(years, { from: 2004, to: 2024 })).toBeNull();
    expect(effectiveYears(years, { from: 2026, to: 2030 })).toBeNull();
  });

  it("builds presets back from the latest year and recognises them", () => {
    const bounds = yearBounds([
      [1980, 2025],
      [2001, 2025],
    ]);
    expect(bounds).toEqual({ from: 1980, to: 2025 });
    expect(presetRange("20y", bounds)).toEqual({ from: 2005, to: 2025 });
    expect(presetRange("all", bounds)).toEqual({ from: 1980, to: 2025 });
    expect(matchingPreset({ from: 2015, to: 2025 }, bounds)).toBe("10y");
    expect(matchingPreset({ from: 2012, to: 2025 }, bounds)).toBeNull();
  });
});

describe("change headlines", () => {
  it("leads ratio quantities with a percentage", () => {
    const change = placeChange(metric("precip"), 800, 680);
    expect(change.direction).toBe("down");
    expect(change.tone).toBe("warm"); // drier
    expect(formatHeadline(metric("precip"), change)).toBe("−15%");
    expect(formatSpan(metric("precip"), change)).toBe("800 → 680 mm/yr");
  });

  it("keeps one decimal for small percentages", () => {
    const change = placeChange(metric("ndvi"), 0.41, 0.44);
    expect(formatHeadline(metric("ndvi"), change)).toBe("+7.3%");
    expect(change.tone).toBe("green");
  });

  it("leads temperatures with an absolute difference", () => {
    const change = placeChange(metric("airtemp"), 19.24, 20.41);
    expect(formatHeadline(metric("airtemp"), change)).toBe("+1.2 °C");
    expect(change.tone).toBe("warm");
    expect(formatSpan(metric("airtemp"), change)).toBe("19.2 → 20.4 °C");
  });

  it("calls a change flat when it does not survive the display precision", () => {
    const temp = placeChange(metric("airtemp"), 20.01, 20.04);
    expect(temp.direction).toBe("flat");
    expect(formatHeadline(metric("airtemp"), temp)).toBe("0.0 °C");
    const rain = placeChange(metric("precip"), 800, 802);
    expect(rain.direction).toBe("flat");
    expect(formatHeadline(metric("precip"), rain)).toBe("0%");
  });

  it("prints thousands separators and a true minus sign", () => {
    const change = placeChange(metric("precip"), 1200, 1500);
    expect(formatSpan(metric("precip"), change)).toBe("1,200 → 1,500 mm/yr");
    const cold = placeChange(metric("airtemp"), -3.2, -1.1);
    expect(formatSpan(metric("airtemp"), cold)).toBe("−3.2 → −1.1 °C");
  });

  it("hides snow where there was none in either year", () => {
    expect(
      placeMetricShown(metric("snow"), placeChange(metric("snow"), 0.1, 0))
    ).toBe(false);
    expect(
      placeMetricShown(metric("snow"), placeChange(metric("snow"), 0.1, 4))
    ).toBe(true);
    expect(
      placeMetricShown(metric("ndvi"), placeChange(metric("ndvi"), 0, 0))
    ).toBe(true);
  });
});

describe("hazards", () => {
  it("queries USGS over the extent for the whole range", () => {
    const url = new URL(
      quakeQueryUrl(
        { south: 30, north: 40, west: -100, east: -90 },
        {
          from: 2005,
          to: 2025,
        }
      )
    );
    expect(url.searchParams.get("starttime")).toBe("2005-01-01");
    expect(url.searchParams.get("endtime")).toBe("2026-01-01");
    expect(url.searchParams.get("minmagnitude")).toBe("4.5");
  });

  it("counts only the events inside the boundary", () => {
    // FDSN text rows, as USGS returns them.
    const row = (lat: number, lon: number, mag: number) =>
      `us7000abcd|2020-03-26T15:16:28.000Z|${lat}|${lon}|6.0|us|us|us|us7000abcd|mww|${mag}|us|Somewhere`;
    const text = [
      "#EventID|Time|Latitude|Longitude|Depth/km|Author|Catalog|Contributor|ContributorID|MagType|Magnitude|MagAuthor|EventLocationName",
      row(35, -95, 5.1),
      row(36, -95, 4.6),
      row(35, -80, 7),
      "",
    ].join("\n");
    expect(tallyQuakes(text, square)).toEqual({
      count: 2,
      capped: false,
      maxMagnitude: 5.1,
    });
    // USGS answers an empty search with 204 and no body.
    expect(tallyQuakes("", square)).toEqual({
      count: 0,
      capped: false,
      maxMagnitude: null,
    });
  });

  it("counts volcanoes inside, or measures to the nearest one", () => {
    const inside = tallyVolcanoes(
      [
        { lat: 35, lon: -95, lastEruptionYear: 1950 },
        { lat: 36, lon: -96, lastEruptionYear: null },
      ],
      square,
      { lat: 35, lon: -95 }
    );
    expect(inside).toEqual({
      inside: 2,
      latestEruption: 1950,
      nearestKm: null,
    });
    const outside = tallyVolcanoes(
      [{ lat: 35, lon: -85, lastEruptionYear: 2001 }],
      square,
      { lat: 35, lon: -95 }
    );
    expect(outside.inside).toBe(0);
    expect(outside.nearestKm).toBeGreaterThan(900);
    expect(outside.nearestKm).toBeLessThan(920);
  });

  it("knows when a plate boundary runs through the place", () => {
    expect(
      plateBoundaryCrosses(
        [
          {
            points: [
              [-95, 35],
              [-80, 35],
            ],
          },
        ],
        square
      )
    ).toBe(true);
    expect(
      plateBoundaryCrosses(
        [
          {
            points: [
              [-80, 35],
              [-70, 35],
            ],
          },
        ],
        square
      )
    ).toBe(false);
  });
});
