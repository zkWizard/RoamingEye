import { describe, it, expect } from "vitest";
import { backoffDelay, isAbortError } from "./net";

describe("backoffDelay", () => {
  it("grows exponentially from the base", () => {
    expect(backoffDelay(0, 400)).toBe(400);
    expect(backoffDelay(1, 400)).toBe(800);
    expect(backoffDelay(2, 400)).toBe(1600);
  });
});

describe("isAbortError", () => {
  it("recognises an AbortError DOMException", () => {
    expect(isAbortError(new DOMException("aborted", "AbortError"))).toBe(true);
  });

  it("ignores other errors", () => {
    expect(isAbortError(new Error("nope"))).toBe(false);
    expect(isAbortError("nope")).toBe(false);
  });
});
