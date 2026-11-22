import type { ComparisonHost, ThenNowPick } from "../lib/openComparisons";
import { openPlaceCompare, openThenNow } from "../lib/openComparisons";
import { parsePlaceCompare } from "../lib/thenNow";

/**
 * The three one-tap searches on the first-visit card. Each id is a short
 * token safe to send as an analytics prop. The labels live in index.html.
 */
export const WELCOME_EXAMPLES = {
  "houston-austin": {
    kind: "place-compare",
    query: "Houston vs Austin rainfall",
  },
  "arctic-ice": {
    kind: "story",
    storyId: "arctic-ice",
  },
  "growing-city": {
    kind: "then-now",
    pick: {
      place: "Las Vegas",
      layerId: "landcover",
      earlierYear: 2001,
      earlierMonth: 1,
      laterYear: 2023,
      laterMonth: 1,
      fit: "tight",
      // Wide enough that this coarse yearly map still reads as a region.
      minDistance: 1.2,
      overlays: ["borders"],
    } satisfies ThenNowPick,
  },
} as const;

export type WelcomeExampleId = keyof typeof WELCOME_EXAMPLES;

export interface ExampleHost extends ComparisonHost {
  playStory(id: string): void;
}

export function isWelcomeExample(id: string): id is WelcomeExampleId {
  return Object.prototype.hasOwnProperty.call(WELCOME_EXAMPLES, id);
}

/** Open the view a welcome chip names. Unknown ids do nothing. */
export function runWelcomeExample(id: string, host: ExampleHost): void {
  if (!isWelcomeExample(id)) return;
  const example = WELCOME_EXAMPLES[id];
  if (example.kind === "story") {
    host.playStory(example.storyId);
    return;
  }
  if (example.kind === "place-compare") {
    const parsed = parsePlaceCompare(example.query, "precip");
    if (!parsed) return;
    void openPlaceCompare(
      {
        placeA: parsed.placeA,
        placeB: parsed.placeB,
        layerId: parsed.layer,
        year: parsed.requested.year,
        month: parsed.requested.month,
        defaultMonth: parsed.defaultMonth,
        query: example.query,
      },
      host
    );
    return;
  }
  void openThenNow(example.pick, host);
}
