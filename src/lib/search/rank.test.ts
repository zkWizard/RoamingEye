import { describe, expect, it } from "vitest";
import { fold, matchScore } from "./rank";

describe("matchScore", () => {
  it("folds accents so Sao matches São", () => {
    expect(fold("São Paulo")).toBe("sao paulo");
    expect(matchScore("Sao", "São Paulo")).toBe(800);
  });

  it("ranks exact above prefix, prefix above a word, a word above a substring", () => {
    expect(matchScore("spain", "Spain")).toBe(1000);
    expect(matchScore("sp", "Spain")).toBe(800);
    expect(matchScore("york", "New York")).toBe(600);
    expect(matchScore("pai", "Spain")).toBe(400);
  });

  it("rejects a query shorter than two characters, and a miss", () => {
    expect(matchScore("s", "Spain")).toBeNull();
    expect(matchScore("quito", "Spain")).toBeNull();
  });
});
