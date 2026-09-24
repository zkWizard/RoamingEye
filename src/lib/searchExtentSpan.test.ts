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

  it("reports a bare-node box as below the printed precision, not as zero", () => {
    // Nominatim returns a fixed 0.0001-degree square for an OSM object mapped as
    // a node with no extent. Measured against the live API, this is the box for
    // "Old Faithful" — 0.0111 km north–south and 0.0079 km east–west, both under
    // the 0.05 km that one decimal can render. One decimal alone printed
    // "0.0 km" for each, stating the box had no extent in the sentence whose
    // whole job is to give the counts beside it a scale.
    expect(
      searchExtentSpanPhrase(
        [44.4604141, 44.4605141, -110.8281964, -110.8280964],
        false
      )
    ).toBe(
      "about <0.1 km north–south and <0.1 km east–west at its mid-latitude"
    );
  });

  it("still prints 0.0 for a box whose edges genuinely coincide", () => {
    // An exact zero is not a rounding artefact: a degenerate box really has no
    // span, so the stronger claim is the true one and stands.
    expect(searchExtentSpanPhrase([12, 12, 34, 34], false)).toBe(
      "about 0.0 km north–south and 0.0 km east–west at its mid-latitude"
    );
  });

  it("keeps one decimal for a span the precision can carry", () => {
    // The guard must not swallow spans at or above 0.05 km, which round to 0.1
    // and are reported honestly.
    const phrase = searchExtentSpanPhrase([0, 0.00054, 0, 0.00054], false);
    expect(phrase).toContain("0.1 km north–south");
    expect(phrase).not.toContain("<0.1 km north–south");
  });

  it("returns null when no usable bounding box was supplied", () => {
    expect(searchExtentSpanPhrase(null, false)).toBeNull();
    expect(searchExtentSpanPhrase([95, 100, 0, 1], false)).toBeNull();
  });
});
