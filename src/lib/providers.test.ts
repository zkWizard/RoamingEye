import { describe, it, expect } from "vitest";
import { PROVIDERS, PROVIDER_GROUPS } from "./providers";

describe("PROVIDERS catalogue", () => {
  it("has well-formed entries", () => {
    expect(PROVIDERS.length).toBeGreaterThan(20);
    for (const p of PROVIDERS) {
      expect(p.name).toBeTruthy();
      expect(p.description.length).toBeGreaterThan(10);
      expect(p.url).toMatch(/^https?:\/\//);
      expect(PROVIDER_GROUPS).toContain(p.group);
      expect(["core", "underlying", "ecosystem"]).toContain(p.use);
    }
  });

  it("credits the sources we actually rely on as core", () => {
    const core = PROVIDERS.filter((p) => p.use === "core").map((p) => p.name);
    expect(core.some((n) => n.includes("GIBS"))).toBe(true);
    expect(core.some((n) => n.includes("OpenStreetMap"))).toBe(true);
    expect(core.some((n) => n.includes("Natural Earth"))).toBe(true);
  });
});
