import { describe, it, expect } from "vitest";
import { encodeViewState, decodeViewState } from "./viewState";

describe("encodeViewState", () => {
  it("encodes the full state", () => {
    const encoded = encodeViewState({
      layer: "lst",
      month: { year: 2024, month: 8 },
      camera: { lat: -21.2, lon: 55.7, alt: 1.8 },
    });
    expect(encoded).toBe("layer=lst&t=2024-08&lat=-21.20&lon=55.70&alt=1.80");
  });

  it("omits missing fields", () => {
    expect(encodeViewState({})).toBe("");
    expect(encodeViewState({ layer: "snow" })).toBe("layer=snow");
  });

  it("zero-pads single-digit months", () => {
    expect(encodeViewState({ month: { year: 2021, month: 3 } })).toBe(
      "t=2021-03"
    );
  });
});

describe("decodeViewState", () => {
  it("round-trips what encode produces", () => {
    const state = {
      layer: "aerosol" as const,
      month: { year: 2019, month: 11 },
      camera: { lat: 37.75, lon: 15.0, alt: 0.5 },
    };
    expect(decodeViewState(encodeViewState(state))).toEqual(state);
  });

  it("accepts a leading #", () => {
    expect(decodeViewState("#layer=snow")).toEqual({ layer: "snow" });
  });

  it("returns empty state for garbage", () => {
    expect(decodeViewState("")).toEqual({});
    expect(decodeViewState("#not&even&params")).toEqual({});
    expect(decodeViewState("#layer=plutonium")).toEqual({});
  });

  it("drops malformed fields but keeps valid ones", () => {
    const state = decodeViewState("#layer=ndvi&t=banana&lat=91&lon=0&alt=1");
    expect(state.layer).toBe("ndvi");
    expect(state.month).toBeUndefined(); // bad month format
    expect(state.camera).toBeUndefined(); // lat out of range
  });

  it("requires the full camera triple", () => {
    expect(decodeViewState("#lat=10&lon=20").camera).toBeUndefined();
    expect(decodeViewState("#lat=10&lon=20&alt=2").camera).toEqual({
      lat: 10,
      lon: 20,
      alt: 2,
    });
  });

  it("rejects out-of-range months and altitudes", () => {
    expect(decodeViewState("#t=2024-13").month).toBeUndefined();
    expect(decodeViewState("#t=0000-05").month).toBeUndefined();
    expect(decodeViewState("#lat=0&lon=0&alt=-1").camera).toBeUndefined();
    expect(decodeViewState("#lat=0&lon=0&alt=999").camera).toBeUndefined();
  });
});

describe("analysis deep links (probe + pin)", () => {
  it("round-trips an open probe and a comparison pin", () => {
    const state = {
      layer: "soil" as const,
      month: { year: 2024, month: 1 },
      probe: {
        kind: "point" as const,
        lat: 8.0,
        lon: 40.0,
        mode: "point" as const,
      },
      pin: { year: 2020, month: 1 },
    };
    expect(decodeViewState(encodeViewState(state))).toEqual(state);
  });

  it("encodes probe coordinates compactly", () => {
    expect(
      encodeViewState({
        probe: { kind: "point", lat: -3.46534, lon: -62.21591, mode: "point" },
      })
    ).toBe("probe=-3.4653%2C-62.2159%2Cpoint");
    expect(encodeViewState({ pin: { year: 2019, month: 7 } })).toBe(
      "pin=2019-07"
    );
  });

  // The two modes reduce the same imagery to different statistics — a 3×3
  // median against a cos(latitude)-weighted 1° mean — so a link that carried
  // only the coordinates reopened every shared area mean as a point median,
  // silently and with an area caption nowhere in sight. That link is also the
  // `view_url` stamped inside the area mean's own CSV export.
  it("carries the sampling mode, so an area probe does not reopen as a point", () => {
    const area = {
      kind: "point" as const,
      lat: 8.0,
      lon: 40.0,
      mode: "area" as const,
    };
    expect(encodeViewState({ probe: area })).toBe(
      "probe=8.0000%2C40.0000%2Carea"
    );
    expect(decodeViewState("#probe=8,40,area").probe).toEqual(area);
    expect(decodeViewState("#probe=8,40,point").probe).toMatchObject({
      mode: "point",
    });
  });

  // Links shared before the mode existed are still in bookmarks and in
  // published CSV headers. They carry no evidence of their mode, so they
  // resolve to the app default rather than inventing an area mean.
  it("reads a legacy two-component probe as a point probe", () => {
    expect(decodeViewState("#probe=8,40").probe).toEqual({
      kind: "point",
      lat: 8,
      lon: 40,
      mode: "point",
    });
  });

  // A drawn region's chart is a mean over a box, and the box is the only
  // thing that says which one. The link used to drop it entirely — while the
  // CSV that same view exports declares the bounds in a `# region:` header and
  // then stamps this link as the way to reproduce them.
  it("round-trips a drawn region, in the CSV's S W N E order", () => {
    const region = {
      kind: "region" as const,
      bounds: { south: -4.5, west: -63.25, north: -3, east: -62 },
    };
    expect(encodeViewState({ probe: region })).toBe(
      "probe=-4.5000%2C-63.2500%2C-3.0000%2C-62.0000%2Cregion"
    );
    expect(decodeViewState("#probe=-4.5,-63.25,-3,-62,region").probe).toEqual(
      region
    );
  });

  // dragBounds expresses a box across the antimeridian in continuous
  // longitudes (east > 180) so the span stays the short arc the user swept.
  // A link has to survive that convention rather than wrapping it back.
  it("round-trips a region that crosses the antimeridian", () => {
    const seam = {
      kind: "region" as const,
      bounds: { south: -18, west: 178, north: -14, east: 182 },
    };
    expect(decodeViewState(encodeViewState({ probe: seam })).probe).toEqual(
      seam
    );
  });

  it("drops malformed probe and pin values", () => {
    expect(decodeViewState("#probe=999,0").probe).toBeUndefined();
    expect(decodeViewState("#probe=banana").probe).toBeUndefined();
    // Three components is a coordinate pair plus a mode — but only a mode the
    // sampler actually implements. `region` is not one of them: a drawn region
    // is a different kind of target and carries four bounds, not a point.
    expect(decodeViewState("#probe=1,2,3").probe).toBeUndefined();
    expect(decodeViewState("#probe=1,2,region").probe).toBeUndefined();
    expect(decodeViewState("#probe=1,2,area,5").probe).toBeUndefined();
    expect(decodeViewState("#pin=2024-13").pin).toBeUndefined();
    expect(decodeViewState("#pin=notamonth").pin).toBeUndefined();
  });

  // A hash is untrusted input, and a region the drawer could never have
  // produced would reopen as a chart of nothing — or of the whole planet.
  it("drops a region link the drawer could not have produced", () => {
    // Five components but not a region marker.
    expect(decodeViewState("#probe=1,2,3,4,5").probe).toBeUndefined();
    // Inverted, and a stray-click sliver: below the 0.2° usable floor.
    expect(decodeViewState("#probe=3,-63,-3,-62,region").probe).toBeUndefined();
    expect(
      decodeViewState("#probe=-3,-62,-2.99,-61.99,region").probe
    ).toBeUndefined();
    // Wider than the short arc dragBounds can yield, and beyond the ±85°
    // latitude clamp.
    expect(
      decodeViewState("#probe=-4,-100,-3,100,region").probe
    ).toBeUndefined();
    expect(
      decodeViewState("#probe=-89,-63,-3,-62,region").probe
    ).toBeUndefined();
    expect(decodeViewState("#probe=a,b,c,d,region").probe).toBeUndefined();
  });
});
