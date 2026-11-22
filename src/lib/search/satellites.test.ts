import { describe, expect, it } from "vitest";
import { issSearchHit } from "./satellites";

describe("issSearchHit", () => {
  it("matches the ISS phrases", () => {
    for (const query of [
      "ISS",
      "where is the ISS",
      "space station",
      "Where's the ISS?",
    ]) {
      const hit = issSearchHit(query);
      expect(hit?.data).toEqual({
        type: "satellite",
        noradId: 25544,
        name: "ISS",
      });
    }
  });

  it("does not match a place that merely contains the letters", () => {
    expect(issSearchHit("Mississippi")).toBeNull();
    expect(issSearchHit("Paris")).toBeNull();
    expect(issSearchHit("")).toBeNull();
  });
});
