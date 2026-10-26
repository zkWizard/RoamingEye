import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { catalogFromJson, matchPlaces } from "./catalog";

describe("catalogFromJson", () => {
  const countries = JSON.parse(
    readFileSync("public/data/countries.geojson", "utf8")
  ) as unknown;

  const catalog = catalogFromJson({
    cities: [
      {
        name: "Quito",
        lat: -0.213,
        lon: -78.502,
        country: "Ecuador",
        pop: 1800000,
      },
    ],
    countries,
    states: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { name: "Pichincha", admin: "Ecuador" },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [-79, -1],
                [-78, -1],
                [-78, 0],
                [-79, 0],
                [-79, -1],
              ],
            ],
          },
        },
      ],
    },
    volcanoes: {
      records: [
        {
          name: "Cotopaxi",
          lat: -0.68,
          lon: -78.44,
          type: "Stratovolcano",
          country: "Ecuador",
        },
      ],
    },
  });

  it("frames Fiji on the islands, not the whole Pacific", () => {
    const fiji = matchPlaces(catalog.countries, "Fiji", "Countries");
    expect(fiji).toHaveLength(1);
    const box = fiji[0].data.type === "place" ? fiji[0].data.boundingBox : null;
    expect(box).not.toBeNull();
    const [, , west, east] = box!;
    const span = east >= west ? east - west : east + 360 - west;
    expect(span).toBeGreaterThan(1);
    expect(span).toBeLessThan(30);
    expect(fiji[0].data.type === "place" && fiji[0].data.lon).toBeGreaterThan(
      170
    );
  });

  it("frames Spain and still treats Russia as a wide country", () => {
    const spain = matchPlaces(catalog.countries, "Spain", "Countries")[0];
    const spainBox =
      spain.data.type === "place" ? spain.data.boundingBox : null;
    expect(spainBox).not.toBeNull();
    const spainSpan =
      spainBox![3] >= spainBox![2]
        ? spainBox![3] - spainBox![2]
        : spainBox![3] + 360 - spainBox![2];
    expect(spainSpan).toBeGreaterThan(5);
    expect(spainSpan).toBeLessThan(25);

    const russia = matchPlaces(catalog.countries, "Russia", "Countries")[0];
    const russiaBox =
      russia.data.type === "place" ? russia.data.boundingBox : null;
    expect(russiaBox).not.toBeNull();
    const russiaSpan =
      russiaBox![3] >= russiaBox![2]
        ? russiaBox![3] - russiaBox![2]
        : russiaBox![3] + 360 - russiaBox![2];
    expect(russiaSpan).toBeGreaterThan(100);
  });

  it("indexes a city, a state, and a volcano from the files the site ships", () => {
    const quito = matchPlaces(catalog.cities, "Quito", "Cities")[0];
    expect(quito.subtitle).toBe("Ecuador");
    expect(quito.data.type === "place" && quito.data.geometry).toBeNull();

    const state = matchPlaces(catalog.states, "Pichincha", "States")[0];
    expect(state.subtitle).toBe("Ecuador");

    const volcano = matchPlaces(catalog.volcanoes, "Cotopaxi", "Volcanoes")[0];
    expect(volcano.subtitle).toContain("Ecuador");
  });
});
