/**
 * Console-error triage for the e2e suites that assert "the app logs nothing".
 *
 * A browser logs a console error for every failed resource load — and the app
 * loads its imagery from third parties (NASA GIBS tiles and base texture, the
 * geocoder). Those loads can fail for reasons entirely outside the app: GIBS's
 * WMTS endpoint intermittently omits the Access-Control-Allow-Origin header
 * under load ("blocked by CORS policy"), tiles time out, the storm aborts an
 * in-flight fetch. The app is *designed* to degrade gracefully on tile-load
 * failure, so these must not fail a test — but a genuine app exception must.
 *
 * `appConsoleErrors` keeps only messages that aren't third-party
 * resource/network failures. Page errors (uncaught app exceptions) are tracked
 * separately by each test and are never filtered.
 */

/** True for a console message caused by a failed third-party resource load. */
export function isThirdPartyResourceError(message: string): boolean {
  return (
    message.includes("blocked by CORS policy") ||
    message.includes("net::ERR_FAILED") ||
    message.includes("Failed to load resource") ||
    message.includes("ERR_ABORTED")
  );
}

/** The subset of console errors that indicate an actual app fault. */
export function appConsoleErrors(messages: string[]): string[] {
  return messages.filter((m) => !isThirdPartyResourceError(m));
}
