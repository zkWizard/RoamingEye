import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GLOBAL_WIND_GRID,
  advect,
  componentsFromSpeedDirection,
  decodeWindBinary,
  encodeWindField,
  fillWindArrays,
  gridCoordinates,
  normalizeOpenMeteoTime,
  parseOpenMeteoCurrentBody,
  sampleWind,
  speedAndDirection,
  windFromOpenMeteo,
  type WindGridSpec,
} from "./field";

const TINY: WindGridSpec = {
  lat0: -90,
  lon0: -180,
  dLat: 90,
  dLon: 90,
  nLat: 3,
  nLon: 4,
};

function filled(value: number, n: number): Float32Array {
  return Float32Array.from({ length: n }, () => value);
}

describe("wind components", () => {
  it("turns a meteorological direction into eastward u and northward v", () => {
    const fromNorth = componentsFromSpeedDirection(10, 0);
    expect(fromNorth.u).toBeCloseTo(0, 6);
    expect(fromNorth.v).toBeCloseTo(-10, 6);

    const fromWest = componentsFromSpeedDirection(10, 270);
    expect(fromWest.u).toBeCloseTo(10, 6);
    expect(fromWest.v).toBeCloseTo(0, 6);

    const back = speedAndDirection(fromWest.u, fromWest.v);
    expect(back.speed).toBeCloseTo(10, 6);
    expect(back.directionDeg).toBeCloseTo(270, 6);
  });

  it("keeps a calm wind at direction 0", () => {
    expect(speedAndDirection(0, 0)).toEqual({ speed: 0, directionDeg: 0 });
  });
});

describe("wind field codec", () => {
  it("round-trips u, v, and temperature within the 0.01 step", () => {
    const n = TINY.nLat * TINY.nLon;
    const u = filled(0, n);
    const v = filled(0, n);
    const t = filled(0, n);
    u[0] = 12.345;
    v[0] = -4.321;
    t[0] = 21.25;
    u[n - 1] = Number.NaN;
    const encoded = encodeWindField(
      { ...TINY, time: "2026-11-22T06:00:00Z", source: "test" },
      u,
      v,
      t
    );
    const field = decodeWindBinary(encoded.buffer, encoded.header);
    expect(field.u[0]).toBeCloseTo(12.35, 2);
    expect(field.v[0]).toBeCloseTo(-4.32, 2);
    expect(field.t[0]).toBeCloseTo(21.25, 2);
    expect(field.u[n - 1]).toBeNaN();
    expect(encoded.header.order).toEqual(["u", "v", "t"]);
  });

  it("rejects a buffer whose length does not match the header", () => {
    const encoded = encodeWindField(
      { ...TINY, time: "2026-11-22T06:00:00Z", source: "test" },
      filled(1, 12),
      filled(0, 12),
      filled(0, 12)
    );
    expect(() =>
      decodeWindBinary(encoded.buffer.slice(0, 8), encoded.header)
    ).toThrow(/bytes/);
  });
});

describe("bilinear wind sample", () => {
  it("matches the Open-Meteo point stored on a grid node", () => {
    const speed = 12.5;
    const direction = 225;
    const { u, v } = componentsFromSpeedDirection(speed, direction);
    const n = TINY.nLat * TINY.nLon;
    const us = filled(0, n);
    const vs = filled(0, n);
    const ts = filled(15, n);
    const index = 1 * TINY.nLon + 2;
    us[index] = u;
    vs[index] = v;
    ts[index] = 18.2;
    const encoded = encodeWindField(
      { ...TINY, time: "2026-11-22T05:45:00Z", source: "open-meteo" },
      us,
      vs,
      ts
    );
    const field = decodeWindBinary(encoded.buffer, encoded.header);
    const lat = TINY.lat0 + 1 * TINY.dLat;
    const lon = TINY.lon0 + 2 * TINY.dLon;
    const sample = sampleWind(field, lat, lon);
    expect(sample).not.toBeNull();
    expect(sample?.speed).toBeCloseTo(speed, 1);
    expect(sample?.directionDeg).toBeCloseTo(direction, 0);
    expect(sample?.t).toBeCloseTo(18.2, 1);
  });

  it("blends the vector between nodes, including across the date line", () => {
    const n = TINY.nLon;
    const u = filled(0, TINY.nLat * n);
    const v = filled(0, TINY.nLat * n);
    const t = filled(0, TINY.nLat * n);
    u[0] = 0;
    u[n - 1] = 10;
    v[0] = 4;
    v[n - 1] = 4;
    const field = decodeWindBinary(
      encodeWindField(
        { ...TINY, time: "2026-11-22T06:00:00Z", source: "test" },
        u,
        v,
        t
      ).buffer,
      encodeWindField(
        { ...TINY, time: "2026-11-22T06:00:00Z", source: "test" },
        u,
        v,
        t
      ).header
    );
    const midLon = TINY.lon0 + (n - 0.5) * TINY.dLon;
    const sample = sampleWind(
      field,
      TINY.lat0,
      midLon > 180 ? midLon - 360 : midLon
    );
    expect(sample).not.toBeNull();
    expect(sample?.u).toBeCloseTo(5, 5);
    expect(sample?.v).toBeCloseTo(4, 5);
  });

  it("drops a missing corner and still returns the neighbours", () => {
    const n = TINY.nLat * TINY.nLon;
    const u = filled(2, n);
    const v = filled(0, n);
    const t = filled(10, n);
    u[0] = Number.NaN;
    v[0] = Number.NaN;
    const encoded = encodeWindField(
      { ...TINY, time: "2026-11-22T06:00:00Z", source: "test" },
      u,
      v,
      t
    );
    const field = decodeWindBinary(encoded.buffer, encoded.header);
    const sample = sampleWind(
      field,
      TINY.lat0 + TINY.dLat / 2,
      TINY.lon0 + TINY.dLon / 2
    );
    expect(sample).not.toBeNull();
    expect(sample?.u).toBeCloseTo(2, 5);
  });
});

describe("advection step", () => {
  it("moves a point north by the distance a northward wind covers", () => {
    const next = advect(0, 10, 0, 10, 1);
    expect(next.lat).toBeCloseTo((10 * 3600) / 111_320, 6);
    expect(next.lon).toBeCloseTo(10, 6);
  });

  it("stretches longitude where the parallel is shorter", () => {
    const equator = advect(0, 0, 10, 0, 1);
    const sixty = advect(60, 0, 10, 0, 1);
    expect(sixty.lon).toBeCloseTo(
      equator.lon / Math.cos((60 * Math.PI) / 180),
      5
    );
  });
});

describe("Open-Meteo rows", () => {
  it("parses a multi-coordinate current response and a single object", () => {
    const body = [
      {
        current: {
          time: "2026-11-22T05:45",
          temperature_2m: 4.1,
          wind_speed_10m: 3.89,
          wind_direction_10m: 288,
        },
      },
    ];
    const [place] = parseOpenMeteoCurrentBody(body);
    expect(place.wind_speed_10m).toBe(3.89);
    expect(normalizeOpenMeteoTime(place.time)).toBe("2026-11-22T05:45:00Z");
    expect(parseOpenMeteoCurrentBody(body[0])).toHaveLength(1);
  });

  it("fills a grid in request order and reports the common hour", () => {
    const grid: WindGridSpec = {
      lat0: 0,
      lon0: 0,
      dLat: 1,
      dLon: 1,
      nLat: 1,
      nLon: 2,
    };
    const filled = fillWindArrays(grid, [
      {
        time: "2026-11-22T05:45",
        temperature_2m: 10,
        wind_speed_10m: 5,
        wind_direction_10m: 90,
      },
      {
        time: "2026-11-22T05:45",
        temperature_2m: null,
        wind_speed_10m: null,
        wind_direction_10m: null,
      },
    ]);
    const fromEast = windFromOpenMeteo(5, 90, 10);
    expect(filled.u[0]).toBeCloseTo(fromEast.u, 5);
    expect(filled.v[0]).toBeCloseTo(fromEast.v, 5);
    expect(filled.missing).toBe(1);
    expect(filled.time).toBe("2026-11-22T05:45:00Z");
  });
});

describe("global wind grid", () => {
  it("is the 2.5 degree field the nightly job requests", () => {
    expect(GLOBAL_WIND_GRID.nLat * GLOBAL_WIND_GRID.nLon).toBe(73 * 144);
    const coords = gridCoordinates(GLOBAL_WIND_GRID);
    expect(coords[0]).toEqual({ lat: -90, lon: -180 });
    expect(coords[coords.length - 1]).toEqual({ lat: 90, lon: 177.5 });
  });
});

describe("bundled wind field", () => {
  it("decodes the committed file and stays inside a physical range", () => {
    const dir = join(__dirname, "..", "..", "..", "public", "data", "wind");
    const header = JSON.parse(readFileSync(join(dir, "latest.json"), "utf8"));
    const buffer = readFileSync(join(dir, "latest.bin")).buffer;
    const field = decodeWindBinary(buffer.slice(0), header);
    expect(field.header.nLat).toBe(73);
    expect(field.header.nLon).toBe(144);
    expect(field.header.source).toBe("open-meteo");
    let finite = 0;
    let speedSum = 0;
    for (let i = 0; i < field.u.length; i++) {
      if (!Number.isFinite(field.u[i]) || !Number.isFinite(field.v[i]))
        continue;
      finite += 1;
      const speed = Math.hypot(field.u[i], field.v[i]);
      expect(speed).toBeLessThan(90);
      speedSum += speed;
    }
    expect(finite / field.u.length).toBeGreaterThan(0.95);
    expect(speedSum / finite).toBeGreaterThan(0.5);
    expect(speedSum / finite).toBeLessThan(30);
    const sample = sampleWind(field, 51.5, -0.1);
    expect(sample).not.toBeNull();
    expect(sample?.speed).toBeGreaterThanOrEqual(0);
    expect(sample?.speed).toBeLessThan(60);
  });
});
