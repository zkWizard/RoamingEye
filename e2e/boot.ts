import type { Page } from "@playwright/test";

declare global {
  interface Window {
    __APP_READY__?: boolean;
  }
}

/**
 * Wait until the app is INTERACTIVE, not merely rendering: first render done
 * (`__APP_READY__`) AND the boot curtain lifted — #loader covers the whole
 * viewport at z-index 3 and swallows every pointer event until the first
 * imagery load resolves (`.is-hidden` also sets pointer-events: none).
 *
 * Historically the curtain never raced the tests by accident: textures
 * loaded through <img> elements, whose in-flight loads delay the window
 * `load` event, so page.goto() itself waited out the imagery. The abortable
 * fetch() texture pipeline (#189) doesn't hold the load event back — which
 * is better for users (the page is reachable sooner) but means a test that
 * clicks or hovers must wait for what a real person waits for: the curtain.
 */
export async function awaitAppInteractive(
  page: Page,
  timeout = 30_000
): Promise<void> {
  await page.waitForFunction(
    () =>
      window.__APP_READY__ === true &&
      document.querySelector("#loader")?.classList.contains("is-hidden") ===
        true,
    null,
    { timeout }
  );
}
