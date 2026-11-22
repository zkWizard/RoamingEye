import { describe, expect, it } from "vitest";
import { trackFromHash } from "./trackHash";

describe("trackFromHash", () => {
  it("reads a NORAD catalog id", () => {
    expect(trackFromHash("#track=25544")).toBe(25544);
    expect(trackFromHash("layer=ndvi&track=25544")).toBe(25544);
  });

  it("drops a catalog id that is not a positive integer", () => {
    expect(trackFromHash("#track=0")).toBeUndefined();
    expect(trackFromHash("#track=nope")).toBeUndefined();
    expect(trackFromHash("#track=1000000")).toBeUndefined();
    expect(trackFromHash("#layer=ndvi")).toBeUndefined();
  });
});
