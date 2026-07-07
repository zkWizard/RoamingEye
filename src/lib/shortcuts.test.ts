import { describe, it, expect } from "vitest";
import { SHORTCUT_GROUPS } from "./shortcuts";

describe("SHORTCUT_GROUPS", () => {
  it("has titled groups with non-empty entries", () => {
    expect(SHORTCUT_GROUPS.length).toBeGreaterThanOrEqual(2);
    for (const group of SHORTCUT_GROUPS) {
      expect(group.title.length).toBeGreaterThan(0);
      expect(group.items.length).toBeGreaterThan(0);
      for (const item of group.items) {
        expect(item.keys.length).toBeGreaterThan(0);
        for (const key of item.keys) expect(key.length).toBeGreaterThan(0);
        expect(item.does.length).toBeGreaterThan(0);
      }
    }
  });

  it("documents the timeline bindings that ui/TimeSlider.ts implements", () => {
    const all = SHORTCUT_GROUPS.flatMap((g) => g.items.flatMap((i) => i.keys));
    for (const key of ["←", "→", "PgUp", "PgDn", "Home", "End"]) {
      expect(all, `missing "${key}"`).toContain(key);
    }
  });

  it("documents how to open and close the overlay itself", () => {
    const all = SHORTCUT_GROUPS.flatMap((g) => g.items.flatMap((i) => i.keys));
    expect(all).toContain("?");
    expect(all).toContain("Esc");
  });
});
