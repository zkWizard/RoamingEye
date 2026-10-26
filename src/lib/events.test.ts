import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  EVENT_LAYER,
  eventDetail,
  layerForEventCategory,
  parseEventIndex,
  searchEvents,
  type EarthEvent,
  type EventCategory,
} from "./events";
import { STORIES } from "./stories";

function event(
  partial: Partial<EarthEvent> & Pick<EarthEvent, "id" | "name">
): EarthEvent {
  const category = partial.category ?? "storm";
  return {
    aliases: [],
    category,
    lat: 0,
    lon: 0,
    from: { year: 2020, month: 1 },
    to: { year: 2020, month: 1 },
    month: { year: 2020, month: 1 },
    layer: EVENT_LAYER[category],
    ...partial,
  };
}

const INDEX: EarthEvent[] = [
  event({
    id: "ian",
    name: "Hurricane Ian (2022)",
    aliases: ["hurricane ian", "hurricane ian 2022", "ian", "ian 2022"],
    category: "storm",
    lat: 26.5,
    lon: -82.5,
    from: { year: 2022, month: 9 },
    to: { year: 2022, month: 10 },
    month: { year: 2022, month: 9 },
  }),
  event({
    id: "australian",
    name: "Australian dust",
    aliases: ["australian dust"],
    category: "dust",
  }),
  event({
    id: "kilauea",
    name: "Kilauea (2018)",
    aliases: ["kilauea", "kilauea 2018"],
    category: "volcano",
    month: { year: 2018, month: 5 },
    from: { year: 2018, month: 5 },
    to: { year: 2018, month: 8 },
  }),
  event({
    id: "camp",
    name: "Camp Fire, California (2018)",
    aliases: ["camp fire", "camp fire california"],
    category: "wildfire",
    month: { year: 2018, month: 11 },
    from: { year: 2018, month: 11 },
    to: { year: 2018, month: 11 },
  }),
  event({
    id: "black",
    name: "Australia's Black Summer",
    aliases: ["black summer", "australias black summer"],
    category: "wildfire",
    storyId: "black-summer-2019",
  }),
];

describe("layerForEventCategory", () => {
  it("pairs each category with the layer that shows it", () => {
    expect(layerForEventCategory("wildfire")).toBe("aerosol");
    expect(layerForEventCategory("storm")).toBe("precip");
    expect(layerForEventCategory("drought")).toBe("ndvi");
    expect(layerForEventCategory("snow")).toBe("snow");
    expect(layerForEventCategory("volcano")).toBe("aerosol");
    expect(layerForEventCategory("earthquake")).toBe("terrain");
    expect(layerForEventCategory("nope")).toBeUndefined();
  });
});

describe("searchEvents", () => {
  it("matches a storm by its name and puts the exact name first", () => {
    const hits = searchEvents(INDEX, "Hurricane Ian");
    expect(hits[0]?.id).toBe("ian");
    expect(hits.every((hit) => hit.id !== "australian")).toBe(true);
  });

  it("does not let a short token match inside a longer word", () => {
    expect(searchEvents(INDEX, "ian").map((hit) => hit.id)).toEqual(["ian"]);
    expect(searchEvents(INDEX, "ian")[0]?.id).not.toBe("australian");
  });

  it("does not match a place inside a longer word", () => {
    const mosquito = event({
      id: "mosquito",
      name: "Mosquito Fire (2022)",
      aliases: ["mosquito fire"],
      category: "wildfire",
    });
    expect(searchEvents([...INDEX, mosquito], "Quito")).toEqual([]);
    expect(searchEvents([...INDEX, mosquito], "Mosquito")[0]?.id).toBe(
      "mosquito"
    );
  });

  it("puts a later event ahead of an earlier one with the same name", () => {
    const earlier = event({
      id: "ian-2003",
      name: "Hurricane Ian (2003)",
      aliases: ["hurricane ian", "ian"],
      month: { year: 2003, month: 9 },
      from: { year: 2003, month: 9 },
      to: { year: 2003, month: 9 },
    });
    const later = event({
      id: "ian-2022",
      name: "Hurricane Ian (2022)",
      aliases: ["hurricane ian", "ian"],
      month: { year: 2022, month: 9 },
      from: { year: 2022, month: 9 },
      to: { year: 2022, month: 10 },
    });
    expect(searchEvents([earlier, later], "Hurricane Ian")[0]?.id).toBe(
      "ian-2022"
    );
  });

  it("requires every word", () => {
    expect(searchEvents(INDEX, "Kilauea 2018").map((hit) => hit.id)).toEqual([
      "kilauea",
    ]);
    expect(searchEvents(INDEX, "Kilauea 1999")).toEqual([]);
  });

  it("finds a fire and a story by the words a person would type", () => {
    expect(searchEvents(INDEX, "Camp Fire")[0]?.id).toBe("camp");
    expect(searchEvents(INDEX, "Black Summer")[0]?.storyId).toBe(
      "black-summer-2019"
    );
  });

  it("ignores a query that is too short to be a search", () => {
    expect(searchEvents(INDEX, "a")).toEqual([]);
    expect(searchEvents(INDEX, "  ")).toEqual([]);
  });

  it("caps the list", () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      event({ id: `s${i}`, name: `Storm ${i}`, aliases: ["storm"] })
    );
    expect(searchEvents(many, "storm", 3)).toHaveLength(3);
  });
});

describe("eventDetail", () => {
  it("names the category and the span, or the single month", () => {
    expect(eventDetail(INDEX[0])).toBe("Storm · Sep 2022 – Oct 2022");
    expect(eventDetail(INDEX[3])).toBe("Wildfire · Nov 2018");
  });
});

describe("parseEventIndex", () => {
  it("drops a record whose layer disagrees with its category", () => {
    const parsed = parseEventIndex({
      events: [
        event({ id: "ok", name: "Ok" }),
        { ...event({ id: "bad", name: "Bad" }), layer: "snow" },
        { name: "no id" },
      ],
    });
    expect(parsed.map((item) => item.id)).toEqual(["ok"]);
  });

  it("never throws on garbage", () => {
    expect(parseEventIndex(null)).toEqual([]);
    expect(parseEventIndex("events")).toEqual([]);
    expect(parseEventIndex({ events: "nope" })).toEqual([]);
  });
});

describe("bundled events index", () => {
  const file = JSON.parse(
    readFileSync(
      new URL("../../public/data/events.json", import.meta.url),
      "utf8"
    )
  ) as { version: number; events: unknown[] };
  const events = parseEventIndex(file);

  it("is a versioned file and every record survives the parser", () => {
    expect(file.version).toBe(1);
    expect(events).toHaveLength(file.events.length);
    expect(new Set(events.map((item) => item.id)).size).toBe(events.length);
  });

  it("includes every curated story", () => {
    for (const story of STORIES) {
      expect(events.some((item) => item.storyId === story.id)).toBe(true);
    }
  });

  it("has the events the pairings are checked against", () => {
    const fold = (value: string): string =>
      value
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "");
    const ian = events.find(
      (item) =>
        item.category === "storm" &&
        fold(item.name).includes("hurricane ian") &&
        item.from.year === 2022
    );
    expect(ian?.layer).toBe("precip");
    expect(ian?.month.year).toBe(2022);
    expect(ian?.month.month).toBeGreaterThanOrEqual(9);
    expect(ian?.month.month).toBeLessThanOrEqual(10);

    const camp = events.find(
      (item) =>
        item.category === "wildfire" && fold(item.name).startsWith("camp fire")
    );
    expect(camp?.layer).toBe("aerosol");
    expect(camp?.from).toEqual({ year: 2018, month: 11 });

    const kilauea = events.find(
      (item) =>
        item.category === "volcano" &&
        fold(item.name).includes("kilauea") &&
        item.from.year === 2018
    );
    expect(kilauea?.layer).toBe("aerosol");

    const drought = events.find((item) => item.category === "drought");
    expect(drought?.layer).toBe("ndvi");

    const snow = events.find((item) => item.category === "snow");
    expect(snow?.layer).toBe("snow");

    const quake = events.find((item) => item.name.includes("Tohoku"));
    expect(quake?.category).toBe("earthquake");
    expect(quake?.layer).toBe("terrain");
  });

  it("leaves the place-search fixture query to Nominatim", () => {
    expect(searchEvents(events, "Qui")).toEqual([]);
    // "quito" sits inside Mosquito Fire and Chiquitos; it is not its own event.
    expect(searchEvents(events, "Quito")).toEqual([]);
  });

  it("covers every category the layer map names", () => {
    const present = new Set(events.map((item) => item.category));
    for (const category of Object.keys(EVENT_LAYER) as EventCategory[]) {
      expect(present.has(category)).toBe(true);
    }
  });
});
