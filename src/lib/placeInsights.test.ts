import { describe, expect, it } from "vitest";
import {
  PLACE_COLORMAP_DOCS,
  PLACE_METRICS,
  latestComparisonMonths,
  nativePlaceSampleValues,
  placeInsightPhysicalReading,
  placeInsightReading,
} from "./placeInsights";
import { LAYERS, type YearMonth } from "./timeline";

describe("place insights", () => {
  it("binds vegetation sampling to the MOD13A3 rendered colormap", () => {
    expect(PLACE_COLORMAP_DOCS.ndvi).toBe("MODIS_L3_NDVI");
  });

  it("withholds rendered vegetation positions from native-value exports", () => {
    expect(nativePlaceSampleValues([0, 0.5, 1, null], "display-ramp")).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });

  it("preserves values decoded through authoritative physical colormaps", () => {
    expect(
      nativePlaceSampleValues([0.0001, null], "authoritative-colormap")
    ).toEqual([0.0001, null]);
  });

  it("uses each product's own latest two months", () => {
    expect(latestComparisonMonths("precip")).toEqual([
      { year: 2025, month: 12 },
      { year: 2026, month: 1 },
    ]);
    expect(latestComparisonMonths("ndvi")).not.toBeNull();
  });

  it("reports rainfall as a monthly total and compares it month over month", () => {
    const rainfall = PLACE_METRICS.find((metric) => metric.id === "rainfall");
    if (!rainfall) throw new Error("rainfall metric missing");
    expect(
      placeInsightReading(
        rainfall,
        [
          { year: 2025, month: 12 },
          { year: 2026, month: 1 },
        ],
        [0.1, 0.2]
      )
    ).toEqual({
      id: "rainfall",
      value: "268 mm",
      detail: "+134 mm vs Dec 2025 · Jan 2026 · annual cycle not removed",
    });
  });

  it("uses the physical GLDAS rainfall rate when NASA's colormap is available", () => {
    const rainfall = PLACE_METRICS.find((metric) => metric.id === "rainfall");
    if (!rainfall) throw new Error("rainfall metric missing");
    expect(
      placeInsightPhysicalReading(
        rainfall,
        [
          { year: 2025, month: 12 },
          { year: 2026, month: 1 },
        ],
        [4.32, 8.64]
      )
    ).toEqual({
      id: "rainfall",
      value: "268 mm",
      detail: "+134 mm vs Dec 2025 · Jan 2026 · annual cycle not removed",
    });
  });

  it("says how much of a rainfall step is month length, not weather", () => {
    const rainfall = PLACE_METRICS.find((metric) => metric.id === "rainfall");
    if (!rainfall) throw new Error("rainfall metric missing");
    // 3.0 mm/day in February, 2.8 mm/day in March: the total rises 3 mm only
    // because March is three days longer. Reported as wetter, unqualified, it
    // would invert what the rain actually did.
    expect(
      placeInsightPhysicalReading(
        rainfall,
        [
          { year: 2026, month: 2 },
          { year: 2026, month: 3 },
        ],
        [3, 87 / 31]
      )
    ).toEqual({
      id: "rainfall",
      value: "87 mm",
      detail:
        "+3 mm vs Feb 2026 · Mar 2026; +9 mm of that is 28 d → 31 d month length, and the daily rate moved the other way (3.0 → 2.8 mm/day) · annual cycle not removed",
    });
  });

  it("leaves non-rainfall metrics free of month-length qualification", () => {
    const air = PLACE_METRICS.find((metric) => metric.id === "air");
    if (!air) throw new Error("air metric missing");
    expect(
      placeInsightPhysicalReading(
        air,
        [
          { year: 2026, month: 2 },
          { year: 2026, month: 3 },
        ],
        [283.15, 285.15]
      ).detail
    ).toBe("+2.0 C vs Feb 2026 · Mar 2026 · annual cycle not removed");
  });

  it("preserves native NDVI values decoded from NASA's colormap", () => {
    const vegetation = PLACE_METRICS.find(
      (metric) => metric.id === "vegetation"
    );
    if (!vegetation) throw new Error("vegetation metric missing");
    expect(
      placeInsightPhysicalReading(
        vegetation,
        [
          { year: 2026, month: 1 },
          { year: 2026, month: 2 },
        ],
        [-0.15, 0.34]
      )
    ).toEqual({
      id: "vegetation",
      value: "0.34",
      detail:
        "Greening +0.49 NDVI vs Jan 2026 · Feb 2026 · annual cycle not removed",
    });
  });

  it("renders air temperature in Celsius and reports missing coverage honestly", () => {
    const air = PLACE_METRICS.find((metric) => metric.id === "air");
    if (!air) throw new Error("air metric missing");
    expect(
      placeInsightReading(
        air,
        [
          { year: 2026, month: 2 },
          { year: 2026, month: 3 },
        ],
        [0.5, 0.6]
      )
    ).toEqual({
      id: "air",
      value: "0.9 C",
      detail: "+9.0 C vs Feb 2026 · Mar 2026 · annual cycle not removed",
    });
    expect(
      placeInsightReading(
        air,
        [
          { year: 2026, month: 2 },
          { year: 2026, month: 3 },
        ],
        [0.5, null]
      )
    ).toEqual({
      id: "air",
      value: "Unavailable",
      detail: "No usable Mar 2026 coverage",
    });
  });
  it("qualifies the vegetation card's month-over-month NDVI step", () => {
    const vegetation = PLACE_METRICS.find(
      (metric) => metric.id === "vegetation"
    );
    if (!vegetation) throw new Error("vegetation metric missing");
    const months: [YearMonth, YearMonth] = [
      { year: 2026, month: 1 },
      { year: 2026, month: 2 },
    ];

    // A step beyond the stability band is named as an index direction, and the
    // reading always says the annual cycle has not been removed so the number
    // cannot be read as an anomaly against a baseline.
    expect(placeInsightReading(vegetation, months, [0.3, 0.5])).toEqual({
      id: "vegetation",
      value: "0.50",
      detail:
        "Greening +0.20 NDVI vs Jan 2026 · Feb 2026 · annual cycle not removed",
    });
    expect(placeInsightReading(vegetation, months, [0.5, 0.3]).detail).toBe(
      "Browning -0.20 NDVI vs Jan 2026 · Feb 2026 · annual cycle not removed"
    );

    // A difference inside the band is not a detected change. This used to be
    // printed as a bare signed delta indistinguishable from composite noise.
    expect(placeInsightReading(vegetation, months, [0.5, 0.52]).detail).toBe(
      "Little change (+0.02 NDVI, within the 0.05 stability band) vs Jan 2026 · Feb 2026 · annual cycle not removed"
    );
  });

  it("withholds a vegetation comparison the two sampled months cannot support", () => {
    const vegetation = PLACE_METRICS.find(
      (metric) => metric.id === "vegetation"
    );
    if (!vegetation) throw new Error("vegetation metric missing");

    // Non-adjacent months are still reported as a single-month regional mean —
    // the value is real — but nothing is labelled "month over month".
    const gapped = placeInsightReading(
      vegetation,
      [
        { year: 2025, month: 2 },
        { year: 2026, month: 2 },
      ],
      [0.3, 0.5]
    );
    expect(gapped.value).toBe("0.50");
    expect(gapped.detail).toBe(
      "Feb 2026 regional mean; Feb 2025 is not the preceding month, so no month-over-month change is reported"
    );

    // NDVI is bounded by its own definition, so an out-of-range decode is
    // withheld rather than shown as a greenness reading.
    expect(
      placeInsightPhysicalReading(
        vegetation,
        [
          { year: 2026, month: 1 },
          { year: 2026, month: 2 },
        ],
        [0.3, 1.4]
      )
    ).toEqual({
      id: "vegetation",
      value: "Unavailable",
      detail: "Feb 2026 value is outside the valid -1 to 1 NDVI range",
    });
    expect(
      placeInsightPhysicalReading(
        vegetation,
        [
          { year: 2026, month: 1 },
          { year: 2026, month: 2 },
        ],
        [1.4, 0.5]
      ).detail
    ).toBe(
      "Feb 2026 regional mean; Jan 2026 is outside the valid -1 to 1 NDVI range and was not compared"
    );
  });

  it("keeps sampling provenance on every vegetation comparison outcome", () => {
    const vegetation = PLACE_METRICS.find(
      (metric) => metric.id === "vegetation"
    );
    if (!vegetation) throw new Error("vegetation metric missing");
    const provenance = {
      validFractions: [1, 0.6],
      sourceImageDimensions: { width: 512, height: 512 },
    };
    const suffix =
      "Feb 2026: 60% sampled coverage; rendered source image 512 x 512 px; approximate regional mean";

    for (const values of [
      [0.3, 0.5],
      [0.5, 0.52],
    ]) {
      expect(
        placeInsightReading(
          vegetation,
          [
            { year: 2026, month: 1 },
            { year: 2026, month: 2 },
          ],
          values,
          provenance
        ).detail
      ).toContain(suffix);
    }
    expect(
      placeInsightReading(
        vegetation,
        [
          { year: 2025, month: 2 },
          { year: 2026, month: 2 },
        ],
        [0.3, 0.5],
        provenance
      ).detail
    ).toContain(suffix);
  });

  it("leaves the other place metrics free of the NDVI stability band", () => {
    // The stability band is an NDVI-specific threshold from `phenologyChange`;
    // applying it to rainfall, soil moisture, or air temperature would be
    // unfounded, so a small adjacent-month step still reports a signed number
    // rather than the vegetation card's "Little change" verdict.
    const air = PLACE_METRICS.find((metric) => metric.id === "air");
    if (!air) throw new Error("air metric missing");
    expect(
      placeInsightReading(
        air,
        [
          { year: 2026, month: 1 },
          { year: 2026, month: 2 },
        ],
        [0.5, 0.501]
      ).detail
    ).toBe("+0.1 C vs Jan 2026 · Feb 2026 · annual cycle not removed");
  });

  it("refuses a month-over-month label on a non-adjacent pair for every metric", () => {
    // Unlike the stability band, adjacency is not NDVI-specific: "month over
    // month" is a claim about the calendar. A twelve-month gap rendered in the
    // one-month step's own format is the reading this guards against.
    for (const id of ["air", "soil", "rainfall"] as const) {
      const metric = PLACE_METRICS.find((m) => m.id === id);
      if (!metric) throw new Error(`${id} metric missing`);
      expect(
        placeInsightReading(
          metric,
          [
            { year: 2025, month: 2 },
            { year: 2026, month: 2 },
          ],
          [0.5, 0.501]
        ).detail
      ).toBe(
        "Feb 2026 regional mean; Feb 2025 is not the preceding month, so no month-over-month change is reported"
      );
    }
  });

  it("ties small and large regional means to coverage and rendered-image provenance", () => {
    const vegetation = PLACE_METRICS.find(
      (metric) => metric.id === "vegetation"
    );
    if (!vegetation) throw new Error("vegetation metric missing");
    const months: [
      { year: number; month: number },
      { year: number; month: number },
    ] = [
      { year: 2026, month: 1 },
      { year: 2026, month: 2 },
    ];

    expect(
      placeInsightReading(vegetation, months, [0.3, 0.4], {
        validFractions: [1, 1],
        sourceImageDimensions: { width: 512, height: 512 },
      }).detail
    ).toContain(
      "Feb 2026: 100% sampled coverage; rendered source image 512 x 512 px; approximate regional mean"
    );
    expect(
      placeInsightReading(vegetation, months, [0.3, 0.4], {
        validFractions: [0.8, 0.76],
        sourceImageDimensions: { width: 1024, height: 512 },
      }).detail
    ).toContain(
      "Feb 2026: 76% sampled coverage; rendered source image 1024 x 512 px; approximate regional mean"
    );
  });

  it("makes partial coastal and missing regional coverage explicit", () => {
    const vegetation = PLACE_METRICS.find(
      (metric) => metric.id === "vegetation"
    );
    if (!vegetation) throw new Error("vegetation metric missing");
    const months: [
      { year: number; month: number },
      { year: number; month: number },
    ] = [
      { year: 2026, month: 1 },
      { year: 2026, month: 2 },
    ];
    const provenance = {
      validFractions: [0.9, 0.25],
      sourceImageDimensions: { width: 512, height: 512 },
    };

    expect(
      placeInsightReading(vegetation, months, [0.3, 0.4], provenance).detail
    ).toContain("Feb 2026: 25% sampled coverage");
    expect(
      placeInsightReading(vegetation, months, [0.3, null], provenance).detail
    ).toContain("No usable Feb 2026 coverage; 25% sampled coverage");
  });

  it("does not present a single in-boundary fallback sample as a regional mean", () => {
    const vegetation = PLACE_METRICS.find(
      (metric) => metric.id === "vegetation"
    );
    if (!vegetation) throw new Error("vegetation metric missing");
    const detail = placeInsightReading(
      vegetation,
      [
        { year: 2026, month: 1 },
        { year: 2026, month: 2 },
      ],
      [0.3, 0.4],
      {
        validFractions: [1, 1],
        sourceImageDimensions: { width: 512, height: 512 },
        geometrySamplingStrategy: "boundary-point",
      }
    ).detail;
    expect(detail).toContain("single in-boundary image sample has data");
    expect(detail).toContain(
      "single boundary point estimate, not a regional mean"
    );
    expect(detail).not.toContain("100% sampled coverage");
  });
});

describe("cryosphere coverage on the place panel", () => {
  it("gives the rendered snow-cover layer a card", () => {
    // A calibrated layer can be absent from the panel with nothing visibly
    // broken — aerosol was, once. This asserts the LAYERS/PLACE_METRICS pair
    // stays closed for the cryosphere.
    const snow = PLACE_METRICS.find((metric) => metric.id === "snow");

    expect(snow).toBeDefined();
    expect(snow?.layerId).toBe("snow");
    expect(LAYERS[snow!.layerId].category).toBe("Cryosphere");
  });

  it("labels a snow difference in percentage points, not percent", () => {
    // Two area percentages differ by percentage points; "%" would read as a
    // relative change in cover.
    const snow = PLACE_METRICS.find((metric) => metric.id === "snow")!;
    const reading = placeInsightPhysicalReading(
      snow,
      [
        { year: 2025, month: 2 },
        { year: 2025, month: 3 },
      ],
      [80, 55]
    );

    expect(reading.detail).toContain("-25 pp");
  });

  it("says a partly drawn vegetation mean is not a whole-boundary mean", () => {
    // The excluded pixels are the boundary's lowest-index ones (GIBS draws no
    // colour below the ramp start), so a bare "60% sampled coverage" understates
    // what the shortfall does to the number printed beside it.
    const vegetation = PLACE_METRICS.find(
      (metric) => metric.id === "vegetation"
    )!;
    const months: [YearMonth, YearMonth] = [
      { year: 2026, month: 1 },
      { year: 2026, month: 2 },
    ];

    const partial = placeInsightReading(vegetation, months, [0.3, 0.4], {
      validFractions: [1, 0.6],
      sourceImageDimensions: { width: 512, height: 512 },
    }).detail;
    expect(partial).toContain("60% sampled coverage");
    expect(partial).toContain("not a whole-boundary mean");

    // Fully drawn: nothing was excluded, so the caveat would describe an
    // exclusion that did not happen.
    const complete = placeInsightReading(vegetation, months, [0.3, 0.4], {
      validFractions: [1, 1],
      sourceImageDimensions: { width: 512, height: 512 },
    }).detail;
    expect(complete).toContain("100% sampled coverage");
    expect(complete).not.toContain("not a whole-boundary mean");
  });

  it("does not round a partial sampled coverage to zero or to complete", () => {
    // A drawn boundary is sampled on a grid up to 28x28, so a few excluded
    // pixels among ~780 is ordinary. Whole-percent rounding hid both ends.
    const vegetation = PLACE_METRICS.find(
      (metric) => metric.id === "vegetation"
    )!;
    const months: [YearMonth, YearMonth] = [
      { year: 2026, month: 1 },
      { year: 2026, month: 2 },
    ];

    // One excluded pixel of 780: a mean over almost-but-not-all of the
    // boundary must not claim the whole of it.
    const nearlyComplete = placeInsightReading(vegetation, months, [0.3, 0.4], {
      validFractions: [1, 779 / 780],
      sourceImageDimensions: { width: 512, height: 512 },
    }).detail;
    expect(nearlyComplete).toContain("99.872% sampled coverage");
    expect(nearlyComplete).not.toContain("100% sampled coverage");
    // The card still says the mean is not a whole-boundary one, and now the
    // percentage agrees with it instead of reading as complete coverage.
    expect(nearlyComplete).toContain("not a whole-boundary mean");

    // A large boundary with a small usable sliver reports a mean; "0%" would
    // be the same text the card prints when nothing was sampled at all.
    const sliver = placeInsightReading(vegetation, months, [0.3, 0.4], {
      validFractions: [1, 0.004],
      sourceImageDimensions: { width: 512, height: 512 },
    }).detail;
    expect(sliver).toContain("0.4% sampled coverage");
    expect(sliver).not.toContain("; 0% sampled coverage");
  });

  it("still prints whole percentages plainly, including the two endpoints", () => {
    const vegetation = PLACE_METRICS.find(
      (metric) => metric.id === "vegetation"
    )!;
    const months: [YearMonth, YearMonth] = [
      { year: 2026, month: 1 },
      { year: 2026, month: 2 },
    ];

    // 0.6 * 100 is 60.000000000000006 in binary floating point; the reader
    // must not see that.
    expect(
      placeInsightReading(vegetation, months, [0.3, 0.4], {
        validFractions: [1, 0.6],
        sourceImageDimensions: { width: 512, height: 512 },
      }).detail
    ).toContain("60% sampled coverage");

    // Exactly complete stays "100%" — the only fraction entitled to it.
    expect(
      placeInsightReading(vegetation, months, [0.3, 0.4], {
        validFractions: [1, 1],
        sourceImageDimensions: { width: 512, height: 512 },
      }).detail
    ).toContain("100% sampled coverage");

    // Exactly zero stays "0%": there the card reports no value to qualify.
    expect(
      placeInsightReading(vegetation, months, [0.3, null], {
        validFractions: [1, 0],
        sourceImageDimensions: { width: 512, height: 512 },
      }).detail
    ).toContain("0% sampled coverage");
  });

  it("carries the drawn-coverage caveat on a single-month vegetation mean", () => {
    const vegetation = PLACE_METRICS.find(
      (metric) => metric.id === "vegetation"
    )!;
    // No previous value, so the card reports the current mean on its own; the
    // bias in that mean is the same one.
    const detail = placeInsightReading(
      vegetation,
      [
        { year: 2026, month: 1 },
        { year: 2026, month: 2 },
      ],
      [null, 0.4],
      {
        validFractions: [null as unknown as number, 0.42],
        sourceImageDimensions: { width: 512, height: 512 },
      }
    ).detail;

    expect(detail).toContain("Feb 2026 regional mean");
    expect(detail).toContain("not a whole-boundary mean");
  });

  it("keeps the drawn-coverage caveat off non-vegetation cards", () => {
    // Only NDVI's ramp leaves its lowest band undrawn; the other metrics'
    // coverage shortfalls are described by their own copy.
    const months: [YearMonth, YearMonth] = [
      { year: 2026, month: 1 },
      { year: 2026, month: 2 },
    ];
    for (const metric of PLACE_METRICS.filter(
      (candidate) => candidate.id !== "vegetation"
    )) {
      const detail = placeInsightReading(metric, months, [10, 12], {
        validFractions: [1, 0.6],
        sourceImageDimensions: { width: 512, height: 512 },
      }).detail;
      expect(detail).not.toContain("not a whole-boundary mean");
    }
  });

  it("does not present a single boundary point as a whole-boundary mean", () => {
    const vegetation = PLACE_METRICS.find(
      (metric) => metric.id === "vegetation"
    )!;
    const detail = placeInsightReading(
      vegetation,
      [
        { year: 2026, month: 1 },
        { year: 2026, month: 2 },
      ],
      [0.3, 0.4],
      {
        validFractions: [1, 0.6],
        sourceImageDimensions: { width: 512, height: 512 },
        geometrySamplingStrategy: "boundary-point",
      }
    ).detail;

    // The suffix already refuses the regional-mean framing; a caveat about a
    // whole-boundary mean would contradict it.
    expect(detail).toContain(
      "single boundary point estimate, not a regional mean"
    );
    expect(detail).not.toContain("not a whole-boundary mean");
  });
});
