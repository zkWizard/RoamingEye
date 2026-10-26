import { describe, it, expect } from "vitest";
import { serializeSession, parseSession } from "./sessionState";

describe("session round-trip", () => {
  it("preserves layer, month, and overlays", () => {
    const state = {
      layer: "evi" as const,
      month: { year: 2019, month: 6 },
      overlays: ["graticule", "cities"],
    };
    expect(parseSession(serializeSession(state))).toEqual(state);
  });

  it("keeps an explicit empty overlay list (defaults stay off)", () => {
    expect(parseSession(serializeSession({ overlays: [] })).overlays).toEqual(
      []
    );
  });
});

describe("parseSession tolerance", () => {
  it("returns {} for garbage", () => {
    expect(parseSession(null)).toEqual({});
    expect(parseSession("")).toEqual({});
    expect(parseSession("not json{")).toEqual({});
    expect(parseSession('"a string"')).toEqual({});
    expect(parseSession("[1,2]")).toEqual({});
  });

  it("drops malformed fields but keeps the rest", () => {
    const parsed = parseSession(
      JSON.stringify({
        layer: "not-a-layer",
        month: { year: 2019, month: 13 },
        overlays: ["cities", 42, null],
        junk: true,
      })
    );
    expect(parsed.layer).toBeUndefined();
    expect(parsed.month).toBeUndefined();
    expect(parsed.overlays).toEqual(["cities"]);
  });

  it("bounds the month to sane values", () => {
    expect(
      parseSession(JSON.stringify({ month: { year: 1899, month: 1 } })).month
    ).toBeUndefined();
    expect(
      parseSession(JSON.stringify({ month: { year: 2020, month: 0 } })).month
    ).toBeUndefined();
    expect(
      parseSession(JSON.stringify({ month: { year: 2020, month: 12 } })).month
    ).toEqual({ year: 2020, month: 12 });
  });

  it("keeps a chosen search and drops a broken one", () => {
    const parsed = parseSession(
      JSON.stringify({
        recent: [
          {
            title: "Quito",
            subtitle: "Ecuador",
            action: {
              type: "place",
              name: "Quito",
              subtitle: "Ecuador",
              lat: -0.213,
              lon: -78.502,
              boundingBox: [-0.6, 0.2, -78.9, -78.1],
              geometry: { type: "Polygon", coordinates: [] },
            },
          },
          { title: "Nope", action: { type: "layer", layerId: "not-a-layer" } },
          { title: "", action: { type: "story", storyId: "x" } },
        ],
      })
    );
    expect(parsed.recent).toHaveLength(1);
    expect(parsed.recent?.[0].title).toBe("Quito");
    expect(parsed.recent?.[0].action).toMatchObject({
      type: "place",
      geometry: null,
    });
  });
});
