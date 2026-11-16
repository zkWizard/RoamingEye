import { describe, expect, it } from "vitest";
import { ANALYTICS, ANALYTICS_ENABLED } from "./config";
import { parseAnalytics } from "./parse";
import { trackingOptOut } from "./privacy";
import {
  applyAction,
  emptySession,
  formatSession,
  parseSession,
} from "./session";
import {
  cloudflareBeacon,
  goatcounterEndpoint,
  goatcounterScript,
  outbound,
  pagePath,
  plausibleScript,
  sanitizeProps,
} from "./providers";

const TOKEN = "0123456789abcdef";

describe("shipped analytics config", () => {
  it("keeps the entry gate off while the token or site id is empty", () => {
    const filled = /^(?:cloudflare|goatcounter|plausible):.+$/.test(ANALYTICS);
    expect(ANALYTICS_ENABLED).toBe(filled);
    expect(parseAnalytics(ANALYTICS).provider === "off").toBe(!filled);
  });

  it("enables each provider from one config string", () => {
    expect(parseAnalytics(`cloudflare:${TOKEN}`)).toEqual({
      provider: "cloudflare",
      site: TOKEN,
    });
    expect(parseAnalytics("goatcounter:roamingeye")).toEqual({
      provider: "goatcounter",
      site: "roamingeye",
    });
    expect(parseAnalytics("plausible:roamingeye.org")).toEqual({
      provider: "plausible",
      site: "roamingeye.org",
    });
  });

  it("treats off, empty, and malformed values as disabled", () => {
    for (const raw of [
      "off",
      "",
      "cloudflare:",
      "cloudflare:short",
      "goatcounter:",
      "plausible:",
      "plausible:not a domain",
      "goatcounter:http://example.com/count",
      "mystery:0123456789abcdef",
    ]) {
      expect(parseAnalytics(raw)).toEqual({ provider: "off" });
    }
  });

  it("accepts a self-hosted GoatCounter count URL", () => {
    expect(
      parseAnalytics("goatcounter:https://stats.example.com/count")
    ).toEqual({
      provider: "goatcounter",
      site: "https://stats.example.com/count",
    });
  });
});

describe("privacy opt-out", () => {
  it("respects Do Not Track and Global Privacy Control", () => {
    expect(
      trackingOptOut({ doNotTrack: "1", globalPrivacyControl: false })
    ).toBe(true);
    expect(
      trackingOptOut({ doNotTrack: "yes", globalPrivacyControl: false })
    ).toBe(true);
    expect(
      trackingOptOut({ doNotTrack: null, globalPrivacyControl: true })
    ).toBe(true);
    expect(
      trackingOptOut({ doNotTrack: "0", globalPrivacyControl: false })
    ).toBe(false);
    expect(
      trackingOptOut({ doNotTrack: null, globalPrivacyControl: false })
    ).toBe(false);
  });
});

describe("activation session", () => {
  it("emits first_search once and does not activate on a single action", () => {
    const first = applyAction(emptySession(), "search");
    expect(first.events).toEqual(["first_search"]);
    const again = applyAction(first.state, "search");
    expect(again.events).toEqual(["activated"]);
  });

  it("activates on a search or scrub plus one more action", () => {
    const search = applyAction(emptySession(), "search");
    const probe = applyAction(search.state, "probe");
    expect(probe.events).toEqual(["first_probe", "activated"]);

    const scrub = applyAction(emptySession(), "scrub");
    const share = applyAction(scrub.state, "share");
    expect(share.events).toEqual(["share", "activated"]);
  });

  it("does not activate without a search or a scrub", () => {
    const probe = applyAction(emptySession(), "probe");
    const share = applyAction(probe.state, "share");
    expect(share.events).toEqual(["share"]);
    expect(share.events).not.toContain("activated");
  });

  it("fires first_scrub once and compare on every use", () => {
    const first = applyAction(emptySession(), "scrub");
    expect(first.events).toEqual(["first_scrub"]);
    const second = applyAction(first.state, "scrub");
    expect(second.events).toEqual(["activated"]);
    const compare = applyAction(second.state, "compare");
    const again = applyAction(compare.state, "compare");
    expect(compare.events).toEqual(["compare"]);
    expect(again.events).toEqual(["compare"]);
  });

  it("keeps first_* and activated once across a stored session", () => {
    const search = applyAction(emptySession(), "search");
    const restored = parseSession(formatSession(search.state));
    expect(applyAction(restored, "search").events).toEqual(["activated"]);
    const done = applyAction(restored, "probe");
    const later = parseSession(formatSession(done.state));
    expect(applyAction(later, "probe").events).toEqual([]);
    expect(applyAction(later, "share").events).toEqual(["share"]);
  });

  it("ignores unknown actions and corrupt session flags", () => {
    expect(applyAction(emptySession(), "zoom").events).toEqual([]);
    expect(parseSession("nope")).toEqual(emptySession());
    expect(parseSession(null)).toEqual(emptySession());
  });
});

describe("provider payloads", () => {
  it("sends Cloudflare a pageview beacon and drops custom events", () => {
    expect(
      outbound("cloudflare", "pageview", "/app/", "https://roamingeye.org")
    ).toEqual({
      kind: "beacon",
    });
    for (const event of ["first_search", "activated", "compare", "share"]) {
      expect(
        outbound("cloudflare", event, "/app/", "https://roamingeye.org")
      ).toEqual({ kind: "drop" });
    }
    expect(cloudflareBeacon(TOKEN).src).toBe(
      "https://static.cloudflareinsights.com/beacon.min.js"
    );
    expect(cloudflareBeacon(TOKEN).attrs["data-cf-beacon"]).toBe(
      JSON.stringify({ token: TOKEN })
    );
  });

  it("sends GoatCounter a pathname and an event name, never the hash", () => {
    expect(pagePath("/")).toBe("/");
    expect(
      outbound("goatcounter", "pageview", "/", "https://roamingeye.org")
    ).toEqual({ kind: "goatcounter", vars: { path: "/" } });
    expect(
      outbound(
        "goatcounter",
        "first_search",
        "/roamingeye/",
        "https://roamingeye.org"
      )
    ).toEqual({
      kind: "goatcounter",
      vars: { path: "first_search", title: "first_search", event: true },
    });
    expect(goatcounterEndpoint("roamingeye")).toBe(
      "https://roamingeye.goatcounter.com/count"
    );
    const tag = goatcounterScript("roamingeye", false);
    expect(tag.attrs["data-goatcounter"]).toBe(
      "https://roamingeye.goatcounter.com/count"
    );
    expect(JSON.parse(tag.attrs["data-goatcounter-settings"])).toMatchObject({
      no_onload: true,
      no_events: true,
      allow_local: false,
    });
  });

  it("sends Plausible a hash-free URL and keeps safe props", () => {
    expect(
      outbound("plausible", "pageview", "/", "https://roamingeye.org")
    ).toEqual({
      kind: "plausible",
      name: "pageview",
      options: { u: "https://roamingeye.org/" },
    });
    expect(
      outbound("plausible", "compare", "/", "https://roamingeye.org", {
        surface: "button",
        place: "Quito, Ecuador",
      })
    ).toEqual({
      kind: "plausible",
      name: "compare",
      options: {
        u: "https://roamingeye.org/",
        props: { surface: "button" },
      },
    });
    expect(plausibleScript("roamingeye.org").attrs["data-domain"]).toBe(
      "roamingeye.org"
    );
    expect(sanitizeProps({ place: "Quito, Ecuador", ok: "yes" })).toEqual({
      ok: "yes",
    });
  });

  it("is a no-op for the off provider", () => {
    expect(outbound("off", "pageview", "/", "https://roamingeye.org")).toEqual({
      kind: "drop",
    });
  });
});
