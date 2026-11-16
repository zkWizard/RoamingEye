export type AnalyticsProvider = "cloudflare" | "goatcounter" | "plausible";

export type AnalyticsConfig =
  | { readonly provider: "off" }
  | { readonly provider: AnalyticsProvider; readonly site: string };

const OFF: AnalyticsConfig = { provider: "off" };

const BEACON_TOKEN = /^[A-Za-z0-9_-]{16,200}$/;
const GOATCOUNTER_CODE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
const PLAUSIBLE_DOMAIN =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

/** Turn the config string into a provider, or off when it is incomplete. */
export function parseAnalytics(raw: string): AnalyticsConfig {
  const value = raw.trim();
  const split = value.indexOf(":");
  if (split <= 0) return OFF;
  const name = value.slice(0, split);
  const site = value.slice(split + 1).trim();
  if (site === "") return OFF;
  if (name === "cloudflare" && BEACON_TOKEN.test(site)) {
    return { provider: "cloudflare", site };
  }
  if (name === "goatcounter" && isGoatcounterSite(site)) {
    return { provider: "goatcounter", site };
  }
  if (name === "plausible" && PLAUSIBLE_DOMAIN.test(site)) {
    return { provider: "plausible", site };
  }
  return OFF;
}

function isGoatcounterSite(site: string): boolean {
  if (GOATCOUNTER_CODE.test(site)) return true;
  if (!site.startsWith("https://")) return false;
  try {
    const url = new URL(site);
    if (url.username !== "" || url.password !== "") return false;
    if (url.hash !== "") return false;
    return url.pathname.includes("/count");
  } catch {
    return false;
  }
}
