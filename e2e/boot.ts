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
    () => {
      const loader = document.querySelector("#loader");
      // Computed visibility, not the class: `.is-hidden` starts a 0.6s fade,
      // and until it finishes the curtain is still painted over the app and
      // still in the accessibility tree. Tests that acted on the class raced
      // the fade — clicks landed on a curtain that was merely going away, and
      // an axe scan measured the fading "Loading Earth…" against the globe
      // showing through it. Visibility flips only when the fade is done, so
      // this waits for what a real person waits for.
      return (
        window.__APP_READY__ === true &&
        !!loader &&
        getComputedStyle(loader).visibility === "hidden"
      );
    },
    null,
    { timeout }
  );
}
