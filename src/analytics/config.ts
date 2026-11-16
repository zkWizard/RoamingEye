/**
 * One line selects who receives analytics.
 *
 * Cloudflare Web Analytics is the chosen provider. The beacon token is
 * public, so it can live in this file, and the beacon works on GitHub Pages
 * without moving DNS. Analytics stays off while the token is empty.
 *
 * Enable pageviews by replacing the line below with the token from the
 * Cloudflare snippet (`data-cf-beacon` JSON, the `token` value only):
 *
 *   export const ANALYTICS = "cloudflare:YOUR_BEACON_TOKEN";
 *
 * Cloudflare records pageviews only. To measure activation events, replace
 * that same line with another adapter:
 *
 *   export const ANALYTICS = "goatcounter:YOUR_CODE";
 *   export const ANALYTICS = "plausible:roamingeye.org";
 *
 * `cloudflare:` (empty token) and `off` send nothing.
 */
export const ANALYTICS = "cloudflare:";

/**
 * True when {@link ANALYTICS} names a provider and a site id or token.
 * The entry chunk reads this and skips the analytics chunk while it is false.
 */
export const ANALYTICS_ENABLED =
  ANALYTICS.length > "cloudflare:".length &&
  (ANALYTICS.startsWith("cloudflare:") ||
    ANALYTICS.startsWith("goatcounter:") ||
    ANALYTICS.startsWith("plausible:"));
