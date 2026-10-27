import { describe, expect, it } from "vitest";
import { monthRangeForLayer } from "./timeline";
import { LAYERS } from "./timeline";
import {
  chooseCompareHit,
  describeThenNow,
  needsNaturalFeature,
  parsePlaceCompare,
  parseThenNow,
  resolveCompareMonths,
  type CompareHit,
  type ThenNowQuery,
} from "./thenNow";

describe("chooseCompareHit", () => {
  const warehouse: CompareHit = {
    category: "building",
    boundingBox: [44.63, 44.64, -93.27, -93.26],
  };
  const river: CompareHit = {
    category: "waterway",
    boundingBox: [-1.58, -1.35, -52.68, -52.09],
  };
  const state: CompareHit = {
    category: "boundary",
    boundingBox: [32.5, 42.0, -124.5, -114.1],
  };

  it("asks for a natural feature only when the top hit is a business", () => {
    expect(needsNaturalFeature(warehouse)).toBe(true);
    expect(needsNaturalFeature(state)).toBe(false);
    expect(needsNaturalFeature(undefined)).toBe(false);
  });

  it("skips a business and takes the natural feature", () => {
    expect(chooseCompareHit([warehouse], [river])).toBe(river);
  });

  it("keeps a region and does not need the natural list", () => {
    expect(chooseCompareHit([state], [])).toBe(state);
  });

  it("falls back to the only hit there is", () => {
    expect(chooseCompareHit([warehouse], [])).toBe(warehouse);
    expect(chooseCompareHit([], [])).toBeUndefined();
  });
});

describe("parseThenNow", () => {
  it("reads a place and two years, and pins the earlier month", () => {
    expect(parseThenNow("Amazon 2005 vs 2020")).toEqual({
      place: "Amazon",
      layer: "ndvi",
      earlier: { year: 2005, month: 8 },
      later: { year: 2020, month: 8 },
    });
  });

  it("keeps the earlier year on the left whichever way they were written", () => {
    expect(parseThenNow("2020 vs 2005 Amazon")?.earlier.year).toBe(2005);
    expect(parseThenNow("2020 vs 2005 Amazon")?.later.year).toBe(2020);
    expect(parseThenNow("Amazon 2005-2020")?.place).toBe("Amazon");
    expect(parseThenNow("Amazon 2005 to 2020")?.later.year).toBe(2020);
  });

  it("uses a written month for both sides", () => {
    const parsed = parseThenNow("Amazon March 2005 vs 2020");
    expect(parsed?.earlier).toEqual({ year: 2005, month: 3 });
    expect(parsed?.later).toEqual({ year: 2020, month: 3 });
    expect(parsed?.place).toBe("Amazon");
  });

  it("maps a fire query to aerosols in September, against the latest September", () => {
    expect(parseThenNow("California fires 2020")).toEqual({
      place: "California",
      layer: "aerosol",
      earlier: { year: 2020, month: 9 },
      later: { year: null, month: 9 },
    });
  });

  it("maps a snow query to snow cover in January", () => {
    expect(parseThenNow("snow Alps 2010")).toEqual({
      place: "Alps",
      layer: "snow",
      earlier: { year: 2010, month: 1 },
      later: { year: null, month: 1 },
    });
    expect(parseThenNow("SNOW the Alps 2010")?.place).toBe("Alps");
  });

  it("lets the first phenomenon word win", () => {
    expect(parseThenNow("drought in the Sahel 2015")).toMatchObject({
      place: "Sahel",
      layer: "ndvi",
      earlier: { year: 2015, month: 8 },
    });
    expect(parseThenNow("soil moisture Sahel 2015")?.layer).toBe("soil");
  });

  it("maps everyday layer words", () => {
    expect(parseThenNow("heat in Phoenix 2018")).toMatchObject({
      place: "Phoenix",
      layer: "lst",
      earlier: { year: 2018, month: 7 },
    });
    expect(parseThenNow("greenness in the Amazon 2010")?.layer).toBe("ndvi");
    expect(parseThenNow("forest Amazon 2010")?.place).toBe("Amazon");
    expect(parseThenNow("air temperature Paris 2019")?.layer).toBe("airtemp");
  });

  it("strips a leading compare from a month query", () => {
    expect(parseThenNow("compare Amazon 2005 and 2020")).toMatchObject({
      place: "Amazon",
      layer: "ndvi",
      earlier: { year: 2005, month: 8 },
      later: { year: 2020, month: 8 },
    });
  });

  it("is not a month comparison when two places are named", () => {
    expect(parseThenNow("Houston vs Austin rainfall 2026")).toBeNull();
    expect(parseThenNow("compare Houston and Austin")).toBeNull();
  });

  it("is not a comparison without a year or a place", () => {
    expect(parseThenNow("Qui")).toBeNull();
    expect(parseThenNow("Quito")).toBeNull();
    expect(parseThenNow("Amazon")).toBeNull();
    expect(parseThenNow("2005 vs 2020")).toBeNull();
    expect(parseThenNow("")).toBeNull();
    expect(parseThenNow("Amazon 1999 2005 2020")).toBeNull();
    expect(parseThenNow("Amazon 2005 vs 2005")).toBeNull();
  });
});

describe("describeThenNow", () => {
  it("names the place, the two months, and the layer", () => {
    const query = parseThenNow("Amazon 2005 vs 2020") as ThenNowQuery;
    expect(describeThenNow(query)).toEqual({
      label: "Amazon, Aug 2005 vs Aug 2020",
      detail: "Vegetation (NDVI)",
    });
  });

  it("says the open side is the latest month of that name", () => {
    const query = parseThenNow("California fires 2020") as ThenNowQuery;
    expect(describeThenNow(query).label).toBe(
      "California, Sep 2020 vs the latest Sep"
    );
    expect(describeThenNow(query).detail).toBe("Aerosols (AOD)");
  });
});

describe("resolveCompareMonths", () => {
  const months = monthRangeForLayer(LAYERS.ndvi);

  it("snaps both written years onto published months", () => {
    const query = parseThenNow("Amazon 2005 vs 2020") as ThenNowQuery;
    expect(resolveCompareMonths(months, query)).toEqual({
      earlier: { year: 2005, month: 8 },
      later: { year: 2020, month: 8 },
    });
  });

  it("fills a one-year query with the latest published month of that name", () => {
    const query = parseThenNow("California fires 2020") as ThenNowQuery;
    const aerosol = monthRangeForLayer(LAYERS.aerosol);
    const pair = resolveCompareMonths(aerosol, query);
    expect(pair?.earlier).toEqual({ year: 2020, month: 9 });
    expect(pair?.later.month).toBe(9);
    expect(pair && pair.later.year).toBeGreaterThan(2020);
  });

  it("declines a year the layer does not publish", () => {
    const query = parseThenNow("Amazon 1990 vs 2020") as ThenNowQuery;
    expect(resolveCompareMonths(months, query)).toBeUndefined();
  });

  it("declines a comparison of a month with itself", () => {
    const only = [{ year: 2020, month: 8 }];
    const query = parseThenNow("Amazon 2020 vs 2024") as ThenNowQuery;
    expect(resolveCompareMonths(only, query)).toBeUndefined();
  });
});

describe("parsePlaceCompare", () => {
  it("reads two places, a layer word, and a year", () => {
    expect(parsePlaceCompare("Houston vs Austin rainfall 2026")).toEqual({
      placeA: "Houston",
      placeB: "Austin",
      layer: "precip",
      defaultMonth: 9,
      requested: { year: 2026, month: null },
    });
  });

  it("accepts compare/and, versus, and a missing date", () => {
    expect(
      parsePlaceCompare("compare Houston and Austin rainfall")
    ).toMatchObject({
      placeA: "Houston",
      placeB: "Austin",
      layer: "precip",
      requested: { year: null, month: null },
    });
    expect(parsePlaceCompare("Houston versus Austin")).toMatchObject({
      placeA: "Houston",
      placeB: "Austin",
      layer: "ndvi",
      requested: { year: null, month: null },
    });
    expect(parsePlaceCompare("compare Houston with Austin heat")).toMatchObject(
      {
        layer: "lst",
        defaultMonth: 7,
      }
    );
  });

  it("keeps a written month and maps the other everyday words", () => {
    expect(parsePlaceCompare("Houston vs Austin heat July 2018")).toMatchObject(
      {
        layer: "lst",
        requested: { year: 2018, month: 7 },
      }
    );
    expect(parsePlaceCompare("Amazon vs Congo greenness")?.layer).toBe("ndvi");
    expect(parsePlaceCompare("Alps vs Rockies snow")?.layer).toBe("snow");
    expect(parsePlaceCompare("California vs Oregon smoke")?.layer).toBe(
      "aerosol"
    );
    expect(parsePlaceCompare("Amazon vs Congo forest")?.layer).toBe("ndvi");
  });

  it("does not treat a year swipe or a single place as two places", () => {
    expect(parsePlaceCompare("Amazon 2005 vs 2020")).toBeNull();
    expect(parsePlaceCompare("2020 vs 2005 Amazon")).toBeNull();
    expect(parsePlaceCompare("California fires 2020")).toBeNull();
    expect(parsePlaceCompare("Quito")).toBeNull();
    expect(parsePlaceCompare("Houston vs Austin 2010 vs 2020")).toBeNull();
  });

  it("keeps the layer already on the globe when the query names none", () => {
    expect(parsePlaceCompare("Houston versus Austin", "precip")).toMatchObject({
      layer: "precip",
    });
    expect(parsePlaceCompare("Houston vs Austin rainfall", "ndvi")?.layer).toBe(
      "precip"
    );
    expect(parsePlaceCompare("Houston versus Austin", "terrain")?.layer).toBe(
      "ndvi"
    );
    expect(parsePlaceCompare("Houston versus Austin", "landcover")?.layer).toBe(
      "ndvi"
    );
  });
});
