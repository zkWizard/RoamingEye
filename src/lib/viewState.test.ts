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
      probe: { lat: 8.0, lon: 40.0, mode: "point" as const },
      pin: { year: 2020, month: 1 },
    };
    expect(decodeViewState(encodeViewState(state))).toEqual(state);
  });

  it("encodes probe coordinates compactly", () => {
    expect(
      encodeViewState({
        probe: { lat: -3.46534, lon: -62.21591, mode: "point" },
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
    const area = { lat: 8.0, lon: 40.0, mode: "area" as const };
    expect(encodeViewState({ probe: area })).toBe(
      "probe=8.0000%2C40.0000%2Carea"
    );
    expect(decodeViewState("#probe=8,40,area").probe).toEqual(area);
    expect(decodeViewState("#probe=8,40,point").probe?.mode).toBe("point");
  });

  // Links shared before the mode existed are still in bookmarks and in
  // published CSV headers. They carry no evidence of their mode, so they
  // resolve to the app default rather than inventing an area mean.
  it("reads a legacy two-component probe as a point probe", () => {
    expect(decodeViewState("#probe=8,40").probe).toEqual({
      lat: 8,
      lon: 40,
      mode: "point",
    });
  });

  it("drops malformed probe and pin values", () => {
    expect(decodeViewState("#probe=999,0").probe).toBeUndefined();
    expect(decodeViewState("#probe=banana").probe).toBeUndefined();
    // Three components is now a coordinate pair plus a mode — but only a mode
    // the sampler actually implements. `region` is deliberately not one: a
    // drawn region has bounds a hash never carried.
    expect(decodeViewState("#probe=1,2,3").probe).toBeUndefined();
    expect(decodeViewState("#probe=1,2,region").probe).toBeUndefined();
    expect(decodeViewState("#probe=1,2,area,5").probe).toBeUndefined();
    expect(decodeViewState("#pin=2024-13").pin).toBeUndefined();
    expect(decodeViewState("#pin=notamonth").pin).toBeUndefined();
  });
});
