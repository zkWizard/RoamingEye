import { describe, expect, it } from "vitest";
import { isLookId, lookMode, LOOKS } from "./looks";

describe("looks", () => {
  it("names a look a non-technical reader can pick", () => {
    expect(LOOKS.map((look) => look.label)).toEqual([
      "Natural",
      "Night vision",
      "Thermal",
      "Noir",
      "Retro CRT",
      "Blueprint",
    ]);
  });

  it("accepts only the known ids", () => {
    expect(isLookId("night")).toBe(true);
    expect(isLookId("natural")).toBe(true);
    expect(isLookId("plasma")).toBe(false);
    expect(isLookId("toString")).toBe(false);
  });

  it("keeps Natural off the shader branch", () => {
    expect(lookMode("natural")).toBe(0);
    expect(lookMode("thermal")).toBe(2);
    expect(lookMode("blueprint")).toBe(5);
  });
});
