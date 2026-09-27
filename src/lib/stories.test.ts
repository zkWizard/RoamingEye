import { describe, expect, it } from "vitest";
import { STORIES, storyById } from "./stories";
import { LAYERS, compareYm, monthRangeForLayer } from "./timeline";

// Overlay ids the toolbar knows (src/overlays/*: `readonly id = ...`). A story
// naming anything else would switch nothing on.
const OVERLAY_IDS = new Set([
  "atmosphere",
  "borders",
  "cities",
  "quakes",
  "graticule",
  "plates",
  "hd",
  "volcanoes",
]);

describe("STORIES", () => {
  it("have unique, link-safe ids", () => {
    const ids = STORIES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  for (const story of STORIES) {
    describe(story.id, () => {
      it("plays forward inside its layer's published record", () => {
        const months = monthRangeForLayer(LAYERS[story.layer]);
        expect(compareYm(story.from, story.to)).toBeLessThan(0);
        // Both ends are real months of the record, so the playback starts
        // and stops where the caption says it does rather than clamping.
        expect(compareYm(months[0], story.from)).toBeLessThanOrEqual(0);
        expect(
          compareYm(story.to, months[months.length - 1])
        ).toBeLessThanOrEqual(0);
      });

      it("is a monthly layer, so every step is a month", () => {
        expect(LAYERS[story.layer].cadence).not.toBe("annual");
      });

      it("points the camera somewhere a shared link could", () => {
        const { lat, lon, alt } = story.camera;
        expect(Math.abs(lat)).toBeLessThanOrEqual(90);
        expect(Math.abs(lon)).toBeLessThanOrEqual(180);
        expect(alt).toBeGreaterThan(0);
        expect(alt).toBeLessThanOrEqual(20);
      });

      it("switches on only overlays that exist", () => {
        for (const id of story.overlays ?? []) {
          expect(OVERLAY_IDS.has(id), id).toBe(true);
        }
      });

      it("says what to watch for in a sentence or two", () => {
        expect(story.title.length).toBeGreaterThan(0);
        expect(story.title.length).toBeLessThanOrEqual(40);
        expect(story.blurb.length).toBeGreaterThan(40);
        expect(story.blurb.length).toBeLessThanOrEqual(180);
      });
    });
  }
});

describe("storyById", () => {
  it("finds a story and rejects anything else", () => {
    expect(storyById(STORIES[0].id)).toBe(STORIES[0]);
    expect(storyById("nope")).toBeUndefined();
    // Untrusted link input: prototype keys are not stories.
    expect(storyById("toString")).toBeUndefined();
    expect(storyById("__proto__")).toBeUndefined();
  });
});
