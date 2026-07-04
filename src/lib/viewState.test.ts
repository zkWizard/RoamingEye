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
      probe: { lat: 8.0, lon: 40.0 },
      pin: { year: 2020, month: 1 },
    };
    expect(decodeViewState(encodeViewState(state))).toEqual(state);
  });

  it("encodes probe coordinates compactly", () => {
    expect(encodeViewState({ probe: { lat: -3.46534, lon: -62.21591 } })).toBe(
      "probe=-3.4653%2C-62.2159"
    );
    expect(encodeViewState({ pin: { year: 2019, month: 7 } })).toBe(
      "pin=2019-07"
    );
  });

  it("drops malformed probe and pin values", () => {
    expect(decodeViewState("#probe=999,0").probe).toBeUndefined();
    expect(decodeViewState("#probe=banana").probe).toBeUndefined();
    expect(decodeViewState("#probe=1,2,3").probe).toBeUndefined();
    expect(decodeViewState("#pin=2024-13").pin).toBeUndefined();
    expect(decodeViewState("#pin=notamonth").pin).toBeUndefined();
  });
});
