import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { decodeViewState, encodeViewState, type ViewState } from "./viewState";
import { parseSession, serializeSession } from "./sessionState";
import { parseLatestFromDomains } from "./freshness";
import { extractServiceException } from "./net";
import { parseEarthquakeFeed } from "./earthquakes";
import { parseVolcanoList } from "./volcanoes";
import { parseCityList } from "./cities";
import { LAYERS, type LayerId } from "./timeline";

/**
 * Property-based fuzzing for every boundary parser — the inputs these
 * functions face are attacker-controllable (URL hashes in shared links),
 * corruptible (localStorage), or third-party (GIBS XML, USGS/GVP/Natural
 * Earth feeds). Example-based tests cover the malformed inputs we thought
 * of; these properties cover the ones we didn't:
 *
 *  - total: parsers NEVER throw, for arbitrary input;
 *  - in-domain: whatever they accept satisfies their own invariants;
 *  - roundtrip: encode → decode is the identity on valid states.
 *
 * On failure fast-check prints the shrunken counterexample and a seed;
 * re-run deterministically with `fc.assert(prop, { seed: <printed> })`.
 */

const LAYER_IDS = Object.keys(LAYERS) as LayerId[];

// Hash-shaped strings reach the decoder alongside truly arbitrary ones, so
// the "almost valid" neighborhood gets dense coverage, not just random noise.
const hashish = fc.oneof(
  fc.string(),
  fc.string({ unit: "binary" }),
  fc
    .array(
      fc.tuple(
        fc.constantFrom("layer", "t", "lat", "lon", "alt", "probe", "pin", "x"),
        fc.string()
      ),
      { maxLength: 6 }
    )
    .map((pairs) =>
      pairs.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&")
    )
);

describe("decodeViewState (URL hash — attacker-controllable)", () => {
  it("never throws and always returns an in-domain state", () => {
    fc.assert(
      fc.property(hashish, (hash) => {
        const state = decodeViewState(hash); // must not throw
        if (state.layer !== undefined) {
          expect(LAYER_IDS).toContain(state.layer);
        }
        for (const ym of [state.month, state.pin]) {
          if (ym !== undefined) {
            expect(ym.year).toBeGreaterThanOrEqual(1900);
            expect(ym.year).toBeLessThanOrEqual(2200);
            expect(ym.month).toBeGreaterThanOrEqual(1);
            expect(ym.month).toBeLessThanOrEqual(12);
          }
        }
        if (state.camera !== undefined) {
          expect(Math.abs(state.camera.lat)).toBeLessThanOrEqual(90);
          expect(Math.abs(state.camera.lon)).toBeLessThanOrEqual(180);
          expect(state.camera.alt).toBeGreaterThan(0);
          expect(state.camera.alt).toBeLessThanOrEqual(20);
        }
        if (state.probe !== undefined) {
          expect(Math.abs(state.probe.lat)).toBeLessThanOrEqual(90);
          expect(Math.abs(state.probe.lon)).toBeLessThanOrEqual(180);
        }
      })
    );
  });
});

// Arbitraries that generate values already at the encoder's precision, so
// the roundtrip is exact rather than "close".
const arbYm = fc.record({
  year: fc.integer({ min: 1900, max: 2200 }),
  month: fc.integer({ min: 1, max: 12 }),
});
const deg2 = (maxHundredths: number): fc.Arbitrary<number> =>
  fc.integer({ min: -maxHundredths, max: maxHundredths }).map((n) => n / 100);
const arbViewState: fc.Arbitrary<ViewState> = fc.record(
  {
    layer: fc.constantFrom(...LAYER_IDS),
    month: arbYm,
    camera: fc.record({
      lat: deg2(9000),
      lon: deg2(18000),
      alt: fc.integer({ min: 1, max: 2000 }).map((n) => n / 100),
    }),
    probe: fc.record({
      lat: fc.integer({ min: -900000, max: 900000 }).map((n) => n / 10000),
      lon: fc.integer({ min: -1800000, max: 1800000 }).map((n) => n / 10000),
    }),
    pin: arbYm,
  },
  { requiredKeys: [] }
);

describe("encodeViewState ∘ decodeViewState", () => {
  it("is the identity on every valid state (at encoding precision)", () => {
    fc.assert(
      fc.property(arbViewState, (state) => {
        expect(decodeViewState(encodeViewState(state))).toEqual(state);
      })
    );
  });
});

describe("parseSession (localStorage — corruptible)", () => {
  it("never throws and stays in-domain for arbitrary values", () => {
    fc.assert(
      fc.property(fc.anything(), (raw) => {
        const session = parseSession(raw); // must not throw
        if (session.layer !== undefined) {
          expect(LAYER_IDS).toContain(session.layer);
        }
        if (session.month !== undefined) {
          expect(session.month.month).toBeGreaterThanOrEqual(1);
          expect(session.month.month).toBeLessThanOrEqual(12);
        }
        if (session.overlays !== undefined) {
          expect(session.overlays.length).toBeLessThanOrEqual(32);
          for (const id of session.overlays) {
            expect(typeof id).toBe("string");
          }
        }
      })
    );
  });

  it("roundtrips every valid session through the serializer", () => {
    const arbSession = fc.record(
      {
        layer: fc.constantFrom(...LAYER_IDS),
        month: arbYm,
        overlays: fc.array(fc.string(), { maxLength: 32 }),
      },
      { requiredKeys: [] }
    );
    fc.assert(
      fc.property(arbSession, (session) => {
        expect(parseSession(serializeSession(session))).toEqual(session);
      })
    );
  });
});

describe("XML-ish parsers (GIBS responses)", () => {
  it("parseLatestFromDomains never throws; results are calendar months", () => {
    fc.assert(
      fc.property(fc.string(), (xml) => {
        const latest = parseLatestFromDomains(xml); // must not throw
        if (latest !== null) {
          expect(latest.month).toBeGreaterThanOrEqual(1);
          expect(latest.month).toBeLessThanOrEqual(12);
        }
      })
    );
  });

  it("extractServiceException never throws; results are bounded strings", () => {
    fc.assert(
      fc.property(fc.string(), (xml) => {
        const detail = extractServiceException(xml); // must not throw
        if (detail !== null) {
          expect(detail.length).toBeGreaterThan(0);
          expect(detail.length).toBeLessThanOrEqual(300);
        }
      })
    );
  });
});

describe("feed parsers (USGS / GVP / Natural Earth)", () => {
  const feedParsers = [
    ["parseEarthquakeFeed", parseEarthquakeFeed],
    ["parseVolcanoList", parseVolcanoList],
    ["parseCityList", parseCityList],
  ] as const;

  it.each(feedParsers)(
    "%s never throws and every kept entry has in-range coordinates",
    (_name, parse) => {
      fc.assert(
        fc.property(fc.jsonValue(), (json) => {
          const entries = parse(json); // must not throw
          expect(Array.isArray(entries)).toBe(true);
          for (const e of entries) {
            expect(Number.isFinite(e.lat)).toBe(true);
            expect(Number.isFinite(e.lon)).toBe(true);
            expect(Math.abs(e.lat)).toBeLessThanOrEqual(90);
            expect(Math.abs(e.lon)).toBeLessThanOrEqual(180);
          }
        })
      );
    }
  );

  it("prototype-chain names never pass the layer guard (regression)", () => {
    // Caught by the decodeViewState property (seed 1100653994): `in` walks
    // the prototype chain, so #layer=toString escaped the catalog check.
    for (const name of ["toString", "constructor", "__proto__", "valueOf"]) {
      expect(decodeViewState(`layer=${name}`).layer).toBeUndefined();
      expect(
        parseSession(JSON.stringify({ layer: name })).layer
      ).toBeUndefined();
    }
  });

  it("survives exotic non-JSON values in numeric fields (regression)", () => {
    // Caught by this suite's first CI run (seed 736499456): Number() THROWS
    // on objects with no primitive conversion — the parsers weren't total.
    const exotic = [Object.create(null) as unknown, Symbol("s"), () => 0];
    for (const value of exotic) {
      expect(
        parseEarthquakeFeed({
          features: [
            {
              geometry: { coordinates: [value, value, value] },
              properties: { mag: value, time: value },
            },
          ],
        })
      ).toEqual([]);
      expect(parseCityList([{ name: "X", lat: value, lon: value }])).toEqual(
        []
      );
      expect(parseVolcanoList([{ name: "X", lat: value, lon: value }])).toEqual(
        []
      );
      expect(
        parseSession(JSON.stringify({ month: { year: 2024, month: 5 } }))
      ).toEqual({ month: { year: 2024, month: 5 } });
    }
  });

  it("feeds shaped like the real thing survive field-level corruption", () => {
    // Structure-aware fuzzing: valid USGS envelopes with arbitrary values in
    // the fields — the "almost valid" inputs random JSON almost never hits.
    const arbFeature = fc.record({
      geometry: fc.record({
        coordinates: fc.array(fc.anything(), { maxLength: 4 }),
      }),
      properties: fc.record(
        { mag: fc.anything(), time: fc.anything(), place: fc.anything() },
        { requiredKeys: [] }
      ),
    });
    fc.assert(
      fc.property(fc.array(arbFeature, { maxLength: 10 }), (features) => {
        const out = parseEarthquakeFeed({ features });
        expect(Array.isArray(out)).toBe(true);
      })
    );
  });
});

describe("the suite catches an out-of-domain escape", () => {
  it("a weakened decoder fixture fails the in-domain property", () => {
    // What decodeViewState would look like without its range guard — the
    // property must reject it (sanity check that these tests have teeth).
    const weakDecode = (hash: string): { lat: number } | undefined => {
      const lat = Number(new URLSearchParams(hash).get("lat"));
      return Number.isFinite(lat) ? { lat } : undefined;
    };
    const escapes = fc.check(
      fc.property(fc.integer({ min: -1000, max: 1000 }), (n) => {
        const out = weakDecode(`lat=${n}`);
        return out === undefined || Math.abs(out.lat) <= 90;
      })
    );
    expect(escapes.failed).toBe(true);
  });
});
