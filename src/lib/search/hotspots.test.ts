import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hotspotSubtitle, hotspotsFromJson } from "./hotspots";

describe("hotspotsFromJson", () => {
  it("drops a bad row and will not show a number that was not checked", () => {
    const hotspots = hotspotsFromJson({
      hotspots: [
        {
          id: "sahel",
          title: "Sahel",
          layerId: "ndvi",
          lat: 13,
          lon: 0,
          sinceYear: 2005,
          headline: "NDVI +12%",
          verified: false,
          rank: 2,
        },
        {
          id: "checked",
          title: "Checked",
          layerId: "ndvi",
          lat: 1,
          lon: 2,
          sinceYear: 2005,
          headline: "NDVI +1%",
          verified: true,
          rank: 1,
        },
        { id: "bad", title: "Bad", layerId: "nope", lat: 0, lon: 0, rank: 0 },
      ],
    });
    expect(hotspots.map((hotspot) => hotspot.id)).toEqual(["checked", "sahel"]);
    expect(hotspots[1].headline).toBeNull();
    expect(hotspots[1].verified).toBe(false);
    expect(hotspotSubtitle(hotspots[1])).toBe("Vegetation (NDVI)");
    expect(hotspotSubtitle(hotspots[0])).toBe(
      "Vegetation (NDVI) NDVI +1% since 2005"
    );
  });

  it("publishes no measured change in the shipped file", () => {
    const file = JSON.parse(
      readFileSync("public/data/change-hotspots.json", "utf8")
    ) as unknown;
    const hotspots = hotspotsFromJson(file);
    expect(hotspots.length).toBeGreaterThan(0);
    for (const hotspot of hotspots) {
      expect(hotspot.verified).toBe(false);
      expect(hotspot.headline).toBeNull();
      expect(hotspotSubtitle(hotspot)).not.toContain("%");
    }
  });
});
