import { describe, expect, it } from "vitest";
import { searchExtentSpanPhrase } from "./searchExtentSpan";

describe("searchExtentSpanPhrase", () => {
  it("reports both dimensions of a supplied bounding box", () => {
    // 1° of latitude is ~111.2 km on a 6371 km sphere; at 45° the same span of
    // longitude is that times cos(45°) ~ 78.6 km.
    expect(searchExtentSpanPhrase([44.5, 45.5, 0, 1], false)).toBe(
      "about 111 km north–south and 78.6 km east–west at its mid-latitude"
    );
  });

  it("keeps a sub-kilometre extent legible rather than rounding it away", () => {
    // A monument-sized geocoder box: the whole point of the phrase is that this
    // renders visibly differently from a country-sized one, so it must not
    // collapse to "0 km".
    const phrase = searchExtentSpanPhrase(
      [48.858, 48.8595, 2.294, 2.2955],
      false
    );
    expect(phrase).toBe(
      "about 0.2 km north–south and 0.1 km east–west at its mid-latitude"
    );
  });

  it("rounds a country-sized extent to whole kilometres", () => {
    expect(searchExtentSpanPhrase([-56, -17.5, -76, -66], false)).toBe(
      "about 4281 km north–south and 891 km east–west at its mid-latitude"
    );
  });

  it("measures an antimeridian-spanning box across the seam", () => {
    // west > east marks the crossing: the width is 20° across the seam, not the
    // 340° the raw subtraction would give.
    const across = searchExtentSpanPhrase([-10, 10, 170, -170], true);
    const equivalent = searchExtentSpanPhrase([-10, 10, -10, 10], false);
    expect(across).toBe(equivalent);
  });

  it("returns null when no usable bounding box was supplied", () => {
    expect(searchExtentSpanPhrase(null, false)).toBeNull();
    expect(searchExtentSpanPhrase([95, 100, 0, 1], false)).toBeNull();
  });
});
