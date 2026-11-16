import type { AnalyticsProvider } from "./parse";

/** A script tag inserted by the runtime. Attributes are set with setAttribute. */
export interface ScriptTag {
  readonly src: string;
  readonly attrs: Readonly<Record<string, string>>;
}

export type Outbound =
  | { readonly kind: "drop" }
  | { readonly kind: "beacon" }
  | {
      readonly kind: "goatcounter";
      readonly vars: {
        readonly path: string;
        readonly title?: string;
        readonly event?: boolean;
      };
    }
  | {
      readonly kind: "plausible";
      readonly name: string;
      readonly options: {
        readonly u: string;
        readonly props?: Record<string, string>;
      };
    };

const EVENT_NAME = /^[a-z][a-z0-9_]{0,40}$/;
const PROP_KEY = /^[a-z][a-z0-9_]{0,31}$/;
const PROP_VALUE = /^[A-Za-z0-9_.:-]{1,64}$/;

export const CLOUDFLARE_BEACON_SRC =
  "https://static.cloudflareinsights.com/beacon.min.js";
export const GOATCOUNTER_SRC = "https://gc.zgo.at/count.js";
export const PLAUSIBLE_SRC = "https://plausible.io/js/script.manual.js";

/** Event names we are willing to send. Anything else is dropped. */
export function safeEventName(name: string): string | null {
  return EVENT_NAME.test(name) ? name : null;
}

/**
 * Keep short token props. Values with spaces, addresses, or coordinates are
 * dropped. Call sites for the built-in events send no props.
 */
export function sanitizeProps(
  props: Readonly<Record<string, string>> | undefined
): Record<string, string> | undefined {
  if (!props) return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(props)) {
    if (typeof value !== "string") continue;
    if (!PROP_KEY.test(key) || !PROP_VALUE.test(value)) continue;
    out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Path only. The hash holds coordinates and place names and is never sent. */
export function pagePath(pathname: string): string {
  if (!pathname.startsWith("/")) return "/";
  return pathname;
}

export function cloudflareBeacon(token: string): ScriptTag {
  return {
    src: CLOUDFLARE_BEACON_SRC,
    attrs: { "data-cf-beacon": JSON.stringify({ token }) },
  };
}

export function goatcounterEndpoint(site: string): string {
  if (site.startsWith("https://")) return site;
  return `https://${site}.goatcounter.com/count`;
}

export function goatcounterScript(
  site: string,
  allowLocal: boolean
): ScriptTag {
  return {
    src: GOATCOUNTER_SRC,
    attrs: {
      "data-goatcounter": goatcounterEndpoint(site),
      "data-goatcounter-settings": JSON.stringify({
        no_onload: true,
        no_events: true,
        allow_local: allowLocal,
      }),
    },
  };
}

export function plausibleScript(domain: string): ScriptTag {
  return {
    src: PLAUSIBLE_SRC,
    attrs: { "data-domain": domain },
  };
}

/**
 * What to send for one event.
 *
 * Cloudflare accepts a pageview only; every other event is a drop.
 * GoatCounter records the event name and ignores props.
 * Plausible receives the event name, safe props, and a path with no hash.
 */
export function outbound(
  provider: "off" | AnalyticsProvider,
  event: string,
  pathname: string,
  origin: string,
  props?: Record<string, string>
): Outbound {
  const name = safeEventName(event);
  if (provider === "off" || name === null) return { kind: "drop" };
  if (provider === "cloudflare") {
    return name === "pageview" ? { kind: "beacon" } : { kind: "drop" };
  }
  if (provider === "goatcounter") {
    if (name === "pageview") {
      return { kind: "goatcounter", vars: { path: pagePath(pathname) } };
    }
    return {
      kind: "goatcounter",
      vars: { path: name, title: name, event: true },
    };
  }
  const options: { u: string; props?: Record<string, string> } = {
    u: origin + pagePath(pathname),
  };
  const safe = name === "pageview" ? undefined : sanitizeProps(props);
  if (safe) options.props = safe;
  return { kind: "plausible", name, options };
}
