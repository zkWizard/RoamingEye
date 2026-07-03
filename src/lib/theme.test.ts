import { describe, it, expect } from "vitest";
import { isTheme, resolveInitialTheme, nextTheme, type Theme } from "./theme";

describe("isTheme", () => {
  it("accepts the two valid themes", () => {
    expect(isTheme("light")).toBe(true);
    expect(isTheme("dark")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isTheme("")).toBe(false);
    expect(isTheme("Dark")).toBe(false);
    expect(isTheme(null)).toBe(false);
    expect(isTheme(undefined)).toBe(false);
    expect(isTheme(1)).toBe(false);
  });
});

describe("resolveInitialTheme", () => {
  it("honors a valid stored choice over the OS preference", () => {
    expect(resolveInitialTheme("light", true)).toBe("light");
    expect(resolveInitialTheme("dark", false)).toBe("dark");
  });

  it("falls back to the OS preference when nothing is stored", () => {
    expect(resolveInitialTheme(null, true)).toBe("dark");
    expect(resolveInitialTheme(null, false)).toBe("light");
  });

  it("ignores a garbage stored value and uses the OS preference", () => {
    expect(resolveInitialTheme("purple", true)).toBe("dark");
    expect(resolveInitialTheme("", false)).toBe("light");
  });
});

describe("nextTheme", () => {
  it("flips between the two themes", () => {
    expect(nextTheme("dark")).toBe("light");
    expect(nextTheme("light")).toBe("dark");
  });

  it("is its own inverse (round-trips)", () => {
    const themes: Theme[] = ["light", "dark"];
    for (const t of themes) {
      expect(nextTheme(nextTheme(t))).toBe(t);
    }
  });
});
