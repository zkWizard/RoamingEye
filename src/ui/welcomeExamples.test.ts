import { describe, expect, it } from "vitest";
import { storyById } from "../lib/stories";
import { LAYERS, monthRangeForLayer } from "../lib/timeline";
import { parsePlaceCompare, resolveCompareMonths } from "../lib/thenNow";
import { WELCOME_EXAMPLES } from "./welcomeExamples";

describe("welcome examples", () => {
  it("reads Houston vs Austin as rainfall", () => {
    const example = WELCOME_EXAMPLES["houston-austin"];
    const parsed = parsePlaceCompare(example.query, "ndvi");
    expect(parsed).toMatchObject({
      placeA: "Houston",
      placeB: "Austin",
      layer: "precip",
    });
  });

  it("points at the Arctic ice story", () => {
    const example = WELCOME_EXAMPLES["arctic-ice"];
    expect(storyById(example.storyId)?.layer).toBe("snow");
  });

  it("frames a fast-growing city inside the land-cover record", () => {
    const pick = WELCOME_EXAMPLES["growing-city"].pick;
    expect(pick.fit).toBe("tight");
    const months = monthRangeForLayer(LAYERS.landcover);
    const pair = resolveCompareMonths(months, {
      place: pick.place,
      layer: "landcover",
      earlier: { year: pick.earlierYear, month: pick.earlierMonth },
      later: { year: pick.laterYear, month: pick.laterMonth },
    });
    expect(pair).toEqual({
      earlier: { year: 2001, month: 1 },
      later: { year: 2023, month: 1 },
    });
  });
});
