import { describe, expect, it } from "vitest";
import { latLngToVector3, vector3ToLatLng } from "./geo";
import {
  equationOfTimeMinutes,
  illuminationInstants,
  monthlyLayerInstant,
  solarDeclination,
  subsolarPoint,
  sunDirection,
} from "./solar";

/**
 * Values printed by NOAA's published solar calculator
 * (gml.noaa.gov/grad/solcalc/main.js) for these instants: declination,
 * equation of time in minutes, and the subsolar longitude derived from them
 * (`(720 - utcMinutes - eot) / 4`). At each of these points NOAA's own
 * azimuth/elevation routine reports elevation 90, so the sun is overhead.
 */
const NOAA = [
  {
    iso: "2024-03-20T03:06:00Z",
    label: "March equinox",
    dec: 0.00047,
    eot: -7.40073,
    lon: 135.35018,
  },
  {
    iso: "2024-06-20T20:51:00Z",
    label: "June solstice",
    dec: 23.43862,
    eot: -1.78767,
    lon: -132.30308,
  },
  {
    iso: "2024-09-22T12:44:00Z",
    label: "September equinox",
    dec: -0.00182,
    eot: 7.44362,
    lon: -12.8609,
  },
  {
    iso: "2024-12-21T09:21:00Z",
    label: "December solstice",
    dec: -23.4386,
    eot: 1.73277,
    lon: 39.31681,
  },
  {
    iso: "2003-10-17T12:30:30Z",
    label: "NOAA sample afternoon",
    dec: -9.20913,
    eot: 14.58629,
    lon: -11.27157,
  },
  {
    iso: "2026-07-15T12:00:00Z",
    label: "monthly layer noon",
    dec: 21.47217,
    eot: -6.01582,
    lon: 1.50396,
  },
] as const;

describe("NOAA solar calculator", () => {
  it.each(NOAA)(
    "$label matches declination, equation of time, and subsolar point",
    (row) => {
      const date = new Date(row.iso);
      expect(solarDeclination(date)).toBeCloseTo(row.dec, 4);
      expect(equationOfTimeMinutes(date)).toBeCloseTo(row.eot, 4);
      const point = subsolarPoint(date);
      expect(point.lat).toBeCloseTo(row.dec, 4);
      expect(point.lon).toBeCloseTo(row.lon, 4);
    }
  );

  it("puts the June solstice sun in the northern tropics and the December sun in the southern", () => {
    expect(solarDeclination(new Date("2024-06-20T20:51:00Z"))).toBeGreaterThan(
      23.4
    );
    expect(solarDeclination(new Date("2024-06-20T20:51:00Z"))).toBeLessThan(
      23.5
    );
    expect(solarDeclination(new Date("2024-12-21T09:21:00Z"))).toBeLessThan(
      -23.4
    );
    expect(
      Math.abs(solarDeclination(new Date("2024-03-20T03:06:00Z")))
    ).toBeLessThan(0.01);
    expect(
      Math.abs(solarDeclination(new Date("2024-09-22T12:44:00Z")))
    ).toBeLessThan(0.01);
  });
});

describe("sunDirection", () => {
  it("lands on the subsolar point of the unit globe", () => {
    const date = new Date("2026-07-15T12:00:00Z");
    const dir = sunDirection(date);
    const back = vector3ToLatLng(
      latLngToVector3(0, 0).set(dir.x, dir.y, dir.z)
    );
    const point = subsolarPoint(date);
    expect(back.lat).toBeCloseTo(point.lat, 4);
    expect(back.lon).toBeCloseTo(point.lon, 4);
    expect(Math.hypot(dir.x, dir.y, dir.z)).toBeCloseTo(1, 6);
  });
});

describe("illuminationInstants", () => {
  it("uses now for the satellite map and that hour on the 15th for a monthly layer", () => {
    const now = new Date("2026-11-22T05:48:00Z");
    const instants = illuminationInstants({
      now,
      month: { year: 2026, month: 7 },
      monthlyLayerVisible: true,
    });
    expect(instants.satellite).toBe(now);
    expect(instants.monthly?.toISOString()).toBe("2026-07-15T05:48:00.000Z");
  });

  it("drops the monthly instant when the month is not what is on screen", () => {
    const now = new Date("2026-11-22T05:48:00Z");
    const instants = illuminationInstants({
      now,
      month: { year: 2026, month: 7 },
      monthlyLayerVisible: false,
    });
    expect(instants.monthly).toBeNull();
  });

  it("builds the monthly instant on the 15th at 12:00 UTC", () => {
    const instant = monthlyLayerInstant({ year: 2024, month: 1 });
    expect(instant.toISOString()).toBe("2024-01-15T12:00:00.000Z");
  });

  it("keeps the month and takes the hour from the clock", () => {
    const instant = monthlyLayerInstant(
      { year: 2024, month: 1 },
      new Date("2026-11-22T18:30:00Z")
    );
    expect(instant.toISOString()).toBe("2024-01-15T18:30:00.000Z");
  });
});
