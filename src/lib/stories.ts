import type { LayerId, YearMonth } from "./timeline";

/**
 * Curated time-lapses: a layer, a place, a stretch of months, and a sentence
 * on what to watch for. They are the first thing a new visitor can do with
 * RoamingEye that shows what it is for, the Earth changing over time, without
 * first learning the controls.
 *
 * Every story here was chosen by looking at its frames in the app, not from
 * what should be visible in principle: a signal that is real but faint at
 * globe scale (El Niño in raw sea-surface temperature, for one) is left out
 * rather than asked for with words. The captions state what the record shows
 * and name the event; the numbers stay in the probe.
 */
export interface Story {
  /** Deep-link id: `#story=<id>`. */
  id: string;
  title: string;
  /** One or two sentences: what happened, and what to watch for. */
  blurb: string;
  layer: LayerId;
  from: YearMonth;
  to: YearMonth;
  /** Where to look: the same fields a shared link's camera carries. */
  camera: { lat: number; lon: number; alt: number };
  /**
   * Overlays to switch on. The aerosol field covers the whole globe, so the
   * smoke and dust stories draw borders: without coastlines nobody can tell
   * which continent the plume is over.
   */
  overlays?: string[];
}

export const STORIES: readonly Story[] = [
  {
    id: "canada-smoke-2023",
    title: "Canada's smoke summer",
    blurb:
      "2023 was Canada's worst wildfire season on record. Watch the smoke build through June, when it turned New York's sky orange, and linger into autumn.",
    layer: "aerosol",
    from: { year: 2023, month: 4 },
    to: { year: 2023, month: 9 },
    camera: { lat: 55, lon: -95, alt: 1.5 },
    overlays: ["borders"],
  },
  {
    id: "amazon-burning-season-2020",
    title: "The Amazon's burning season",
    blurb:
      "Each dry season, fires set to clear land fill South America's skies with smoke. In 2020, with the Pantanal's record blazes, the haze peaks in September.",
    layer: "aerosol",
    from: { year: 2020, month: 5 },
    to: { year: 2020, month: 12 },
    camera: { lat: -10, lon: -60, alt: 1.5 },
    overlays: ["borders"],
  },
  {
    id: "saharan-dust-2020",
    title: "Saharan dust crosses the Atlantic",
    blurb:
      "Every summer, winds carry Sahara dust west over the ocean. In June 2020 an unusually large plume, nicknamed Godzilla, reached the Caribbean and the US.",
    layer: "aerosol",
    from: { year: 2020, month: 2 },
    to: { year: 2020, month: 10 },
    camera: { lat: 18, lon: -30, alt: 1.6 },
    overlays: ["borders"],
  },
  {
    id: "black-summer-2019",
    title: "Australia's Black Summer",
    blurb:
      "From late 2019, bushfires burned across south-eastern Australia. Their smoke peaks in January 2020 and drifts out over the Pacific.",
    layer: "aerosol",
    from: { year: 2019, month: 9 },
    to: { year: 2020, month: 4 },
    camera: { lat: -30, lon: 150, alt: 1.5 },
    overlays: ["borders"],
  },
  {
    id: "sahel-monsoon-2024",
    title: "The monsoon greens the Sahel",
    blurb:
      "When the West African monsoon arrives each summer, the green band south of the Sahara pushes north, then fades back as the rains end.",
    layer: "ndvi",
    from: { year: 2024, month: 4 },
    to: { year: 2024, month: 11 },
    camera: { lat: 13, lon: 0, alt: 1.4 },
  },
  {
    id: "northern-snow-2023",
    title: "Snow sweeps the north",
    blurb:
      "Each autumn, snow spreads south across North America and Eurasia, then retreats by early summer. One full season, month by month.",
    layer: "snow",
    from: { year: 2023, month: 9 },
    to: { year: 2024, month: 6 },
    camera: { lat: 60, lon: 40, alt: 1.8 },
  },
];

const BY_ID = new Map(STORIES.map((story) => [story.id, story]));

/** A story by deep-link id; anything else (untrusted input) is undefined. */
export function storyById(id: string): Story | undefined {
  return BY_ID.get(id);
}
