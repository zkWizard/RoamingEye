import { describe, expect, it } from "vitest";
import { decodeWindBinary, sampleWind } from "../src/live/wind/field.ts";
import { buildWindField } from "./build-wind-field.mjs";

describe("build-wind-field", () => {
  it("encodes batched Open-Meteo rows into the file the client decodes", async () => {
    const grid = {
      lat0: 10,
      lon0: 20,
      dLat: 2.5,
      dLon: 2.5,
      nLat: 2,
      nLon: 2,
    };
    const fetchImpl = async (url) => {
      const lats =
        new URL(String(url)).searchParams.get("latitude")?.split(",") ?? [];
      const body = lats.map((_, index) => ({
        current: {
          time: "2026-11-22T05:45",
          temperature_2m: 16,
          wind_speed_10m: index === 0 ? 12.5 : 4,
          wind_direction_10m: index === 0 ? 225 : 0,
        },
      }));
      return new globalThis.Response(JSON.stringify(body), {
        headers: { "content-type": "application/json" },
      });
    };
    const encoded = await buildWindField(fetchImpl, grid);
    const field = decodeWindBinary(encoded.buffer, encoded.header);
    const sample = sampleWind(field, 10, 20);
    expect(field.header.source).toBe("open-meteo");
    expect(field.header.time).toBe("2026-11-22T05:45:00Z");
    expect(sample?.speed).toBeCloseTo(12.5, 1);
    expect(sample?.directionDeg).toBeCloseTo(225, 0);
  });
});
