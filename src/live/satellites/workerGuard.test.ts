import { describe, expect, it } from "vitest";
import {
  acceptsWorkerOrigin,
  isAllowedGroup,
  samplesFromGroups,
} from "./workerGuard";

describe("acceptsWorkerOrigin", () => {
  const own = "https://roamingeye.org";

  it("accepts a dedicated worker's empty origin and the page origin", () => {
    expect(acceptsWorkerOrigin("", own)).toBe(true);
    expect(acceptsWorkerOrigin(own, own)).toBe(true);
  });

  it("rejects every other origin", () => {
    expect(acceptsWorkerOrigin("https://evil.example", own)).toBe(false);
    expect(acceptsWorkerOrigin("null", own)).toBe(false);
  });
});

describe("samplesFromGroups", () => {
  const buffer = new ArrayBuffer(8);

  it("keeps an allowed group and drops prototype keys", () => {
    const samples = samplesFromGroups(
      ["__proto__", "constructor", "prototype", "stations", "not-a-group"],
      () => buffer
    );
    expect(Object.getPrototypeOf(samples)).toBe(null);
    expect(Object.keys(samples)).toEqual(["stations"]);
    expect(samples.stations).toBe(buffer);
    expect(isAllowedGroup("__proto__")).toBe(false);
    expect(isAllowedGroup("constructor")).toBe(false);
    expect(isAllowedGroup("prototype")).toBe(false);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });
});
