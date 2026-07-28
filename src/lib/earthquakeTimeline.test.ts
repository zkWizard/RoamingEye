import { describe, expect, it } from "vitest";
import { parseEarthquakeFeed, type Earthquake } from "./earthquakes";
import {
  EARTHQUAKE_TIMELINE_SOURCE,
  EARTHQUAKE_TIMELINE_UNITS,
  earthquakeDailyTimeline,
} from "./earthquakeTimeline";

const earthquake = (time: number): Earthquake => ({
  lat: 0,
  lon: 0,
  depthKm: 10,
  magnitude: 5,
  time,
  place: "Test event",
});

describe("earthquakeDailyTimeline", () => {
  it("groups supplied event times into chronological UTC days with source provenance", () => {
    const timeline = earthquakeDailyTimeline([
      earthquake(Date.parse("2026-07-02T23:59:59.000Z")),
      earthquake(Date.parse("2026-07-01T12:00:00.000Z")),
      earthquake(Date.parse("2026-07-02T00:00:00.000Z")),
    ]);

    expect(timeline).toMatchObject({
      kind: "usgs-earthquake-utc-daily-timeline",
      status: "available",
      suppliedEventCount: 3,
      usableEventCount: 3,
      unavailableEventTimeCount: 0,
      observedEventTime: {
        min: Date.parse("2026-07-01T12:00:00.000Z"),
        max: Date.parse("2026-07-02T23:59:59.000Z"),
      },
      provenance: EARTHQUAKE_TIMELINE_SOURCE,
      units: EARTHQUAKE_TIMELINE_UNITS,
    });
    expect(timeline.days).toEqual([
      {
        day: "2026-07-01",
        eventCount: 1,
        eventTime: {
          min: Date.parse("2026-07-01T12:00:00.000Z"),
          max: Date.parse("2026-07-01T12:00:00.000Z"),
        },
      },
      {
        day: "2026-07-02",
        eventCount: 2,
        eventTime: {
          min: Date.parse("2026-07-02T00:00:00.000Z"),
          max: Date.parse("2026-07-02T23:59:59.000Z"),
        },
      },
    ]);
  });

  it("preserves malformed event-time coverage without assigning a false date", () => {
    const timeline = earthquakeDailyTimeline([
      earthquake(Number.NaN),
      earthquake(Number.POSITIVE_INFINITY),
      earthquake(Date.parse("2026-07-03T01:00:00.000Z")),
    ]);

    expect(timeline).toMatchObject({
      status: "available",
      suppliedEventCount: 3,
      usableEventCount: 1,
      unavailableEventTimeCount: 2,
      days: [{ day: "2026-07-03", eventCount: 1 }],
    });
  });

  it("distinguishes an empty input from supplied records with no usable times", () => {
    expect(earthquakeDailyTimeline([])).toMatchObject({
      status: "no-events",
      suppliedEventCount: 0,
      usableEventCount: 0,
      observedEventTime: { min: null, max: null },
      days: [],
    });
    expect(earthquakeDailyTimeline([earthquake(Number.NaN)])).toMatchObject({
      status: "no-usable-event-times",
      suppliedEventCount: 1,
      usableEventCount: 0,
      unavailableEventTimeCount: 1,
      observedEventTime: { min: null, max: null },
      days: [],
    });
  });

  it("accepts the existing USGS GeoJSON parser output without changing native timestamps", () => {
    const parsed = parseEarthquakeFeed({
      features: [
        {
          geometry: { coordinates: [-122.4, 37.8, 8.2] },
          properties: {
            mag: 4.7,
            time: 1_783_036_800_000,
            place: "Test location",
          },
        },
      ],
    });

    const timeline = earthquakeDailyTimeline(parsed);

    expect(timeline.days).toEqual([
      {
        day: "2026-07-03",
        eventCount: 1,
        eventTime: { min: 1_783_036_800_000, max: 1_783_036_800_000 },
      },
    ]);
    expect(timeline.provenance).toMatchObject({
      feedWindow: "rolling past 30 days at source retrieval time",
      minimumMagnitude: 4.5,
    });
    expect(timeline.limitations.join(" ")).toContain("fixed calendar month");
  });
});
