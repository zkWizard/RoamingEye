import { describe, expect, it } from "vitest";
import { summarizeLandCoverContext } from "./landCover";
import { describeLandCoverPointReading } from "./landCoverPointReading";

/** A point block: `codes` are decoded IGBP codes, null = no usable colour. */
function block(codes: (number | null)[], dataYear = 2024) {
  return summarizeLandCoverContext(
    codes.map((classCode) => ({ classCode })),
    dataYear
  );
}

describe("describeLandCoverPointReading", () => {
  it("reports the most frequent class with its sampled pixel count", () => {
    const reading = describeLandCoverPointReading(
      block([12, 12, 12, 12, 12, 12, 12, 10, 10])
    );

    expect(reading.status).toBe("classified");
    expect(reading.headline).toBe("Cropland (IGBP class 12)");
    expect(reading.detail).toContain(
      "Most frequent class in 7 of 9 sampled image pixels"
    );
    expect(reading.text).toBe(`${reading.headline} — ${reading.detail}`);
  });

  it("cites the dataset, resolution, and data year", () => {
    const reading = describeLandCoverPointReading(block(Array(9).fill(1)));

    expect(reading.detail).toContain(
      "MCD12Q1 v061, 500 m, 2024 annual IGBP map"
    );
  });

  it("keeps the categorical caveat on every classified reading", () => {
    const reading = describeLandCoverPointReading(block(Array(9).fill(17)));

    expect(reading.headline).toBe("Water (IGBP class 17)");
    expect(reading.detail).toContain("counted, never averaged");
  });

  it("names every tied class instead of promoting one of them", () => {
    // summarizeLandCoverContext withholds dominantClass on a tie; the reading
    // must show the tie rather than silently picking the lower class code.
    const reading = describeLandCoverPointReading(
      block([10, 10, 10, 10, 12, 12, 12, 12, null])
    );

    expect(reading.status).toBe("tied");
    expect(reading.headline).toBe(
      "Tied: Grassland (IGBP class 10), Cropland (IGBP class 12)"
    );
    expect(reading.detail).toContain(
      "Each occurred in 4 of 9 sampled image pixels; no single most frequent class"
    );
  });

  it("does not call a single-class sample a tie", () => {
    const reading = describeLandCoverPointReading(block(Array(9).fill(8)));

    expect(reading.status).toBe("classified");
    expect(reading.detail).toContain("Most frequent class in 9 of 9");
  });

  it("does not treat unclassified pixels as an informative class", () => {
    // Code 255 outnumbers class 12 but carries no land-cover type, so the
    // informative class still wins and 255 never becomes the headline.
    const reading = describeLandCoverPointReading(
      block([255, 255, 255, 255, 255, 12, 12, 12, 12])
    );

    expect(reading.status).toBe("classified");
    expect(reading.headline).toBe("Cropland (IGBP class 12)");
    expect(reading.detail).toContain("Most frequent class in 4 of 9");
  });

  it("withholds a class when only unclassified and unusable pixels were sampled", () => {
    const reading = describeLandCoverPointReading(
      block([255, 255, 255, 255, null, null, null, null, null])
    );

    // Mixed 255 + undecodable: the headline stays scoped to the pixels read,
    // which is true here because every pixel read was source-unclassified or
    // unreadable. It must not assert the ground carries no class.
    expect(reading.status).toBe("unavailable");
    expect(reading.headline).toBe(
      "Source-unclassified in every land-cover pixel read here"
    );
    expect(reading.headline).not.toContain("No IGBP land-cover class");
    expect(reading.detail).toContain("4 pixels source-unclassified");
    expect(reading.detail).toContain("5 pixels with no usable colour");
    expect(reading.detail).toContain("counted, never averaged");
  });

  it("blames the unreadable render, not the ground, when nothing decoded", () => {
    // A point clicked where the rendered map is transparent decodes no pixel
    // at all, so MCD12Q1 was never consulted about this location.
    const reading = describeLandCoverPointReading(block(Array(9).fill(null)));

    expect(reading.status).toBe("unavailable");
    expect(reading.headline).toBe(
      "No sampled pixel carried a readable land-cover colour"
    );
    expect(reading.detail).toContain("9 pixels with no usable colour");
  });

  it("calls an all-255 point source-unclassified rather than class-free", () => {
    // Class 255 is MCD12Q1 declining to assign a class — the product's own
    // answer, and not a statement that the ground carries no land cover.
    const reading = describeLandCoverPointReading(block(Array(9).fill(255)));

    expect(reading.status).toBe("unavailable");
    expect(reading.headline).toBe(
      "Source-unclassified in every land-cover pixel read here"
    );
    expect(reading.detail).toContain("9 pixels source-unclassified");
  });

  it("singularizes a lone unusable pixel", () => {
    const reading = describeLandCoverPointReading(block([255, null]));

    expect(reading.detail).toContain("1 pixel source-unclassified");
    expect(reading.detail).toContain("1 pixel with no usable colour");
  });

  it("reports out-of-range years as unpublished instead of inventing a class", () => {
    const reading = describeLandCoverPointReading(
      block(Array(9).fill(12), 2030)
    );

    expect(reading.status).toBe("unavailable");
    expect(reading.headline).toBe("No land-cover map published for 2030");
    expect(reading.detail).toContain(
      "annual MCD12Q1 series does not cover this year"
    );
  });

  it("reports a non-integer year as invalid", () => {
    const reading = describeLandCoverPointReading(block([12], 2024.5));

    expect(reading.status).toBe("unavailable");
    expect(reading.detail).toContain("not a whole calendar year");
  });

  it("handles an empty sample without claiming coverage", () => {
    const reading = describeLandCoverPointReading(block([]));

    expect(reading.status).toBe("unavailable");
    expect(reading.headline).toBe("No land-cover pixels sampled");
  });

  it("never presents itself as an interpretation or a forecast", () => {
    const summary = block([12]);

    expect(summary.isForecast).toBe(false);
    expect(describeLandCoverPointReading(summary).isInterpretation).toBe(false);
  });

  it("says how much of a classified sample carried no IGBP class", () => {
    // 4 cropland, 3 grassland, 2 source-unclassified: the class is named from
    // 7 classified pixels, not from all 9, and the reading must say so.
    const reading = describeLandCoverPointReading(
      block([12, 12, 12, 12, 10, 10, 10, 255, 255])
    );

    expect(reading.status).toBe("classified");
    expect(reading.detail).toContain(
      "Most frequent class in 4 of 9 sampled image pixels."
    );
    expect(reading.detail).toContain(
      "Of those, 7 pixels carried an IGBP class; the other 2 pixels source-unclassified."
    );
  });

  it("keeps the source's own unclassified answer apart from an unreadable pixel", () => {
    // Same shortfall, different observations: only the undecoded pixels are a
    // reason to distrust the label above them.
    const reading = describeLandCoverPointReading(
      block([12, 12, 12, 12, 12, 255, 255, null, null])
    );

    expect(reading.detail).toContain(
      "Of those, 5 pixels carried an IGBP class; the other 4 pixels: 2 source-unclassified, 2 with no usable colour."
    );
  });

  it("discloses the shortfall on a tie as well as on a single class", () => {
    const reading = describeLandCoverPointReading(
      block([10, 10, 10, 12, 12, 12, null, null, null])
    );

    expect(reading.status).toBe("tied");
    expect(reading.detail).toContain(
      "Of those, 6 pixels carried an IGBP class; the other 3 pixels with no usable colour."
    );
  });

  it("stays silent when every sampled pixel carried an informative class", () => {
    const reading = describeLandCoverPointReading(
      block([12, 12, 12, 12, 12, 12, 12, 10, 10])
    );

    expect(reading.detail).not.toContain("Of those,");
    expect(reading.detail).toBe(
      "Most frequent class in 7 of 9 sampled image pixels. MCD12Q1 v061, 500 m, 2024 annual IGBP map. Class labels are categorical — counted, never averaged."
    );
  });

  it("never lets the shortfall clause disagree with the sample it describes", () => {
    // The printed classified count plus the printed remainder must be the whole
    // sample — a clause that rounded or reused the wrong denominator would not.
    const reading = describeLandCoverPointReading(
      block([1, 1, 1, 2, 2, 255, null, null, 99])
    );

    expect(reading.detail).toContain(
      "Of those, 5 pixels carried an IGBP class"
    );
    expect(reading.detail).toContain(
      "the other 4 pixels: 1 source-unclassified, 2 with no usable colour, 1 outside the IGBP class contract"
    );
  });
});
