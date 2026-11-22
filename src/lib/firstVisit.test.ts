import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { storyById } from "./stories";
import {
  shouldOfferWelcome,
  WELCOME_STORY_ID,
  type WelcomeSignals,
} from "./firstVisit";

const fresh: WelcomeSignals = {
  welcomed: false,
  hasSessionLayer: false,
  hash: "",
  search: "",
};

describe("shouldOfferWelcome", () => {
  it("offers the welcome on a bare first visit", () => {
    expect(shouldOfferWelcome(fresh)).toBe(true);
    expect(shouldOfferWelcome({ ...fresh, hash: "#" })).toBe(true);
    expect(shouldOfferWelcome({ ...fresh, search: "?" })).toBe(true);
  });

  it("stays quiet for a returning visitor", () => {
    expect(shouldOfferWelcome({ ...fresh, welcomed: true })).toBe(false);
    expect(shouldOfferWelcome({ ...fresh, hasSessionLayer: true })).toBe(false);
  });

  it("stays quiet when the URL already carries a view or a query", () => {
    expect(
      shouldOfferWelcome({
        ...fresh,
        hash: "#story=saharan-dust-2020",
      })
    ).toBe(false);
    expect(
      shouldOfferWelcome({
        ...fresh,
        hash: "#layer=snow&t=2024-01&lat=70&lon=-40&alt=1.6",
      })
    ).toBe(false);
    expect(shouldOfferWelcome({ ...fresh, search: "?ref=friend" })).toBe(false);
  });
});

describe("welcome story", () => {
  it("names a story the app can play", () => {
    const story = storyById(WELCOME_STORY_ID);
    expect(story?.layer).toBe("ndvi");
    expect(story?.title.length).toBeGreaterThan(0);
  });
});

describe("welcome copy", () => {
  const html = readFileSync(
    new URL("../../index.html", import.meta.url),
    "utf8"
  );
  const start = html.indexOf('id="intro"');
  const end = html.indexOf('id="compare-divider"');
  const block = html.slice(start, end);

  it("uses the plain example lines and the slider hint", () => {
    expect(block).toContain("Houston vs Austin rainfall");
    expect(block).toContain("Watch the Arctic ice");
    expect(block).toContain("Then vs now: a fast-growing city");
    expect(block).toContain("Watch the green spread north");
    expect(block).toContain("Try one of these");
    expect(html).toContain("Drag to travel through time");
  });

  it("has no em dash", () => {
    expect(block).not.toMatch(/\u2014/);
  });
});
