import { describe, expect, it } from "vitest";
import { decodeWindBinary, encodeWindField, sampleWind } from "./field";
import { loadWindField, openMeteoCurrentUrl } from "./loader";

describe("wind loader", () => {
  it("builds an Open-Meteo current URL for a batch of coordinates", () => {
    const url = openMeteoCurrentUrl([
      { lat: 51.5, lon: -0.12 },
      { lat: 40, lon: 10 },
    ]);
    expect(url).toContain("latitude=51.5,40");
    expect(url).toContain("longitude=-0.12,10");
    expect(url).toContain("wind_speed_unit=ms");
    expect(url).toContain("wind_speed_10m");
  });

  it("decodes a prebuilt file and does not call Open-Meteo", async () => {
    const grid = {
      lat0: 0,
      lon0: 0,
      dLat: 1,
      dLon: 1,
      nLat: 2,
      nLon: 2,
    };
    const encoded = encodeWindField(
      { ...grid, time: "2026-11-22T06:00:00Z", source: "open-meteo" },
      Float32Array.from([1, 0, 0, 0]),
      Float32Array.from([0, 0, 0, 0]),
      Float32Array.from([11, 12, 13, 14])
    );
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith("latest.json")) return jsonResponse(encoded.header);
      if (url.endsWith("latest.bin")) return new Response(encoded.buffer);
      throw new Error(`unexpected ${url}`);
    };
    const field = await loadWindField({
      fetch: fetchImpl,
      baseUrl: "/base/",
      cache: false,
    });
    expect(calls).toEqual([
      "/base/data/wind/latest.json",
      "/base/data/wind/latest.bin",
    ]);
    expect(sampleWind(field, 0, 0)?.u).toBeCloseTo(1, 2);
    expect(field.header.time).toBe("2026-11-22T06:00:00Z");
  });

  it("falls back to a coarse Open-Meteo grid when the file is missing", async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("/data/wind/")) {
        return new Response("missing", { status: 404 });
      }
      const lats = new URL(url).searchParams.get("latitude")?.split(",") ?? [];
      const body = lats.map(() => ({
        current: {
          time: "2026-11-22T05:45",
          temperature_2m: 8,
          wind_speed_10m: 6,
          wind_direction_10m: 180,
        },
      }));
      return jsonResponse(body);
    };
    const field = await loadWindField({
      fetch: fetchImpl,
      baseUrl: "/",
      cache: false,
    });
    expect(field.header.source).toBe("open-meteo-fallback");
    expect(field.header.nLat).toBe(19);
    expect(field.header.nLon).toBe(36);
    const sample = sampleWind(field, 10, 20);
    expect(sample?.speed).toBeCloseTo(6, 1);
    expect(sample?.directionDeg).toBeCloseTo(180, 0);
    expect(calls.some((url) => openMeteoHost(url))).toBe(true);
    const encoded = encodeWindField(field.header, field.u, field.v, field.t);
    const round = decodeWindBinary(encoded.buffer, field.header);
    expect(sampleWind(round, 10, 20)?.speed).toBeCloseTo(6, 1);
  });
});

function openMeteoHost(url: string): boolean {
  try {
    return new URL(url).hostname === "api.open-meteo.com";
  } catch {
    return false;
  }
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });
}
