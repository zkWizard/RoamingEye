import { describe, it, expect } from "vitest";
import {
  SNOW_ILLUMINATION_LIMITATIONS,
  SNOW_RETRIEVAL_MIN_NOON_ELEVATION_DEG,
  describeMonthIllumination,
  describeSnowIllumination,
  noonSolarElevationDeg,
  snowIlluminationNote,
  solarDeclinationDeg,
} from "./snowCoverIllumination";
import { SNOW_COVER_DATASET } from "./snowCover";

describe("solarDeclinationDeg", () => {
  // Anchored to the astronomical values, not to our own output: the solstices
  // sit at ±23.44° and the equinoxes at 0°. Spencer's series is quoted to
  // better than 0.04°, so 0.1° is a loose-but-real check.
  it("reproduces the solstices and equinoxes", () => {
    expect(solarDeclinationDeg(172)!).toBeCloseTo(23.44, 1); // ~21 Jun
    expect(solarDeclinationDeg(355)!).toBeCloseTo(-23.44, 1); // ~21 Dec
    expect(Math.abs(solarDeclinationDeg(79)!)).toBeLessThan(0.6); // ~20 Mar
    expect(Math.abs(solarDeclinationDeg(266)!)).toBeLessThan(0.6); // ~23 Sep
  });

  it("never leaves the obliquity band", () => {
    for (let day = 1; day <= 365; day++) {
      expect(Math.abs(solarDeclinationDeg(day)!)).toBeLessThanOrEqual(23.5);
    }
  });

  it("rejects days outside the reference year", () => {
    expect(solarDeclinationDeg(0)).toBeNull();
    expect(solarDeclinationDeg(366)).toBeNull();
    expect(solarDeclinationDeg(12.5)).toBeNull();
    expect(solarDeclinationDeg(Number.NaN)).toBeNull();
  });
});

describe("noonSolarElevationDeg", () => {
  it("puts the sun overhead at the subsolar latitude", () => {
    const declination = solarDeclinationDeg(172)!;
    expect(noonSolarElevationDeg(declination, 172)!).toBeCloseTo(90, 6);
  });

  it("places the equator near 90° at both equinoxes", () => {
    expect(noonSolarElevationDeg(0, 79)!).toBeGreaterThan(89.4);
    expect(noonSolarElevationDeg(0, 266)!).toBeGreaterThan(89.4);
  });

  it("goes negative in polar night and stays up in polar day", () => {
    // North pole: dark at the December solstice, lit at the June one.
    expect(noonSolarElevationDeg(90, 355)!).toBeLessThan(0);
    expect(noonSolarElevationDeg(90, 172)!).toBeGreaterThan(0);
  });

  it("rejects impossible coordinates", () => {
    expect(noonSolarElevationDeg(91, 100)).toBeNull();
    expect(noonSolarElevationDeg(Number.NaN, 100)).toBeNull();
    expect(noonSolarElevationDeg(45, 400)).toBeNull();
  });
});

describe("describeMonthIllumination", () => {
  it("calls a mid-latitude month plainly sunlit", () => {
    const june = describeMonthIllumination(45, 6)!;
    expect(june.class).toBe("sunlit");
    expect(june.polarNightDays).toBe(0);
    expect(june.label).toBe("Jun");
    expect(june.daysInMonth).toBe(30);
    expect(june.maxNoonElevationDeg).toBeGreaterThan(60);
  });

  it("calls a fully dark month polar-night", () => {
    // Ellesmere Island: measured blank in the imagery for this month.
    const december = describeMonthIllumination(80.5, 12)!;
    expect(december.class).toBe("polar-night");
    expect(december.polarNightDays).toBe(december.daysInMonth);
    expect(december.maxNoonElevationDeg).toBeLessThan(0);
  });

  it("separates a barely-lit month from a fully dark one", () => {
    // Svalbard in February: the sun does return mid-month, yet noon never
    // clears the retrieval floor — and the imagery came back blank anyway.
    const february = describeMonthIllumination(78.2, 2)!;
    expect(february.class).toBe("low-sun");
    expect(february.polarNightDays).toBeGreaterThan(0);
    expect(february.polarNightDays).toBeLessThan(february.daysInMonth);
    expect(february.maxNoonElevationDeg).toBeLessThan(
      SNOW_RETRIEVAL_MIN_NOON_ELEVATION_DEG
    );
  });

  it("classifies on the month's best day, not on its dark days", () => {
    // Svalbard in October has a week of polar night but still peaks well
    // above the floor — and the imagery for it is populated, so a partly
    // dark month must not be withheld wholesale.
    const october = describeMonthIllumination(78.2, 10)!;
    expect(october.polarNightDays).toBeGreaterThan(0);
    expect(october.maxNoonElevationDeg).toBeGreaterThan(
      SNOW_RETRIEVAL_MIN_NOON_ELEVATION_DEG
    );
    expect(october.class).toBe("sunlit");
  });

  it("mirrors the hemispheres half a year apart", () => {
    const north = describeMonthIllumination(80, 12)!;
    const south = describeMonthIllumination(-80, 6)!;
    expect(north.class).toBe("polar-night");
    expect(south.class).toBe("polar-night");
    expect(south.maxNoonElevationDeg).toBeCloseTo(north.maxNoonElevationDeg, 0);
  });

  it("rejects impossible latitudes and months", () => {
    expect(describeMonthIllumination(95, 1)).toBeNull();
    expect(describeMonthIllumination(Number.NaN, 1)).toBeNull();
    expect(describeMonthIllumination(70, 0)).toBeNull();
    expect(describeMonthIllumination(70, 13)).toBeNull();
    expect(describeMonthIllumination(70, 1.5)).toBeNull();
  });
});

describe("describeSnowIllumination", () => {
  it("keeps the cited product and refuses to look like a forecast", () => {
    const profile = describeSnowIllumination(75)!;
    expect(profile.kind).toBe("snow-cover-illumination-window");
    expect(profile.isForecast).toBe(false);
    expect(profile.dataset).toEqual(SNOW_COVER_DATASET);
    expect(profile.dataset.shortName).toBe("MOD10CM");
    expect(profile.limitations).toEqual(SNOW_ILLUMINATION_LIMITATIONS);
  });

  it("covers all twelve months in calendar order", () => {
    const profile = describeSnowIllumination(-72)!;
    expect(profile.months).toHaveLength(12);
    expect(profile.months.map((month) => month.month)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
  });

  it("reports the whole year observable across the populated latitudes", () => {
    // The overwhelming majority of land — and every place most users probe —
    // sits equatorward of the first unobservable month.
    for (const latitude of [0, 30, -35, 51.5, 60, 63, -60]) {
      expect(describeSnowIllumination(latitude)!.observableYearRound).toBe(
        true
      );
    }
  });

  it("puts the first unobservable month just poleward of 63.3°", () => {
    expect(describeSnowIllumination(63.3)!.observableYearRound).toBe(true);
    expect(describeSnowIllumination(63.4)!.observableYearRound).toBe(false);
  });

  it("splits dark months from barely-lit ones at the north pole", () => {
    const profile = describeSnowIllumination(90)!;
    expect(profile.polarNightMonths.map((m) => m.label)).toEqual([
      "Jan",
      "Feb",
      "Oct",
      "Nov",
      "Dec",
    ]);
    expect(profile.lowSunMonths.map((m) => m.label)).toEqual(["Mar"]);
    expect(profile.observableYearRound).toBe(false);
    // Every month lands in exactly one bucket.
    const flagged =
      profile.polarNightMonths.length + profile.lowSunMonths.length;
    expect(profile.months.filter((m) => m.class === "sunlit")).toHaveLength(
      12 - flagged
    );
  });

  it("rejects an unusable latitude outright", () => {
    expect(describeSnowIllumination(120)).toBeNull();
    expect(describeSnowIllumination(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("snowIlluminationNote", () => {
  it("says nothing where the whole year can be observed", () => {
    expect(snowIlluminationNote(0)).toBeNull();
    expect(snowIlluminationNote(47.6)).toBeNull();
    expect(snowIlluminationNote(-55)).toBeNull();
    expect(snowIlluminationNote(Number.NaN)).toBeNull();
  });

  it("names both the dark months and the barely-lit ones", () => {
    const note = snowIlluminationNote(78.2)!;
    expect(note).toContain("78.2°N");
    expect(note).toContain("sun never rises");
    expect(note).toContain("noon sun under 5°");
    // Jan, Nov and Dec are dark outright; Feb only fails the floor.
    expect(note).toMatch(/Jan, Nov, Dec \(sun never rises\)/);
    expect(note).toMatch(/Feb \(noon sun under 5°\)/);
  });

  it("omits the clause that does not apply", () => {
    // At 64°N nothing is fully dark — only December misses the floor.
    const note = snowIlluminationNote(64)!;
    expect(note).toContain("Dec (noon sun under 5°)");
    expect(note).not.toContain("sun never rises");
  });

  it("labels the southern hemisphere and its own dark season", () => {
    const note = snowIlluminationNote(-78)!;
    expect(note).toContain("78.0°S");
    expect(note).toContain("Jun");
    expect(note).not.toContain("Dec");
  });

  it("refuses to present a dark-month reading as a measurement", () => {
    // The Antarctic plateau returns a filled 100% value straight through
    // polar night, so the note has to disown the value, not just the gap.
    expect(snowIlluminationNote(-78)!).toContain(
      "not measurements of those months"
    );
  });
});
