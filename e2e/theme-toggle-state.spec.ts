import { test, expect, type Page } from "@playwright/test";
import { awaitAppInteractive } from "./boot";

/**
 * The theme toggle is an ACTION button, not a state toggle, and the two models
 * cannot both be applied to it.
 *
 * Its accessible name names the theme the press will move you TO ("Switch to
 * light theme" while dark), which is also its visible `title` and matches the
 * icon — the button shows the theme you'd switch to. That name carries the
 * current theme implicitly and truthfully: naming light as the destination
 * says you are in dark.
 *
 * On main it ALSO carried `aria-pressed`, keyed to `theme === "light"`, and the
 * two halves pointed opposite ways. In light theme the control announced
 * "Switch to dark theme, toggle button, PRESSED" — asserting that the thing
 * named, switching to dark, is the engaged state, while the app is in light. A
 * screen-reader user arriving at the control fresh is told the dark-theme
 * button is already on; that is a false state report, not merely an odd one.
 * ARIA's own guidance is the same rule: a toggle whose label changes with its
 * state must not also expose `aria-pressed`.
 *
 * Every other toggle in the app takes the opposite branch — a STATIC name plus
 * `aria-pressed` (Toolbar's overlays, RegionButton's "Draw region",
 * CompareControls, ProbePanel's segments). The theme toggle is the one control
 * that cannot: its name IS its visible tooltip, so pinning the name to a state
 * would stop the tooltip saying what the click does, and moving only the
 * `aria-label` would split it from the visible label.
 *
 * What must hold is a PAIR: no `aria-pressed` in either theme, AND the name
 * still tracks the target theme and still equals the visible title. The second
 * half is what stops the defect being "fixed" by freezing the name instead.
 */

const toggle = ".theme-toggle";

// Headless CI reports prefers-color-scheme light, so the boot theme is seeded
// through the app's own localStorage key rather than left to the OS — the same
// override a11y.spec.ts uses, and for the same reason: otherwise which theme
// this test starts in depends on the machine running it.
async function boot(page: Page, theme: "dark" | "light"): Promise<void> {
  await page.addInitScript(
    (t) => localStorage.setItem("roamingeye:theme", t),
    theme
  );
  await page.goto("/");
  await awaitAppInteractive(page);
}

test("the theme toggle names its target and claims no pressed state", async ({
  page,
}) => {
  await boot(page, "dark");

  const button = page.locator(toggle);

  const read = () =>
    button.evaluate((el) => ({
      theme: document.documentElement.getAttribute("data-theme"),
      name: el.getAttribute("aria-label"),
      title: (el as HTMLElement).title,
      // `null` is the point: the attribute must be absent, not "false".
      pressed: el.getAttribute("aria-pressed"),
    }));

  expect(await read()).toEqual({
    theme: "dark",
    name: "Switch to light theme",
    title: "Switch to light theme",
    pressed: null,
  });

  await button.click();
  await expect.poll(async () => (await read()).theme).toBe("light");

  // The state that used to read "pressed" here while the name said "dark".
  expect(await read()).toEqual({
    theme: "light",
    name: "Switch to dark theme",
    title: "Switch to dark theme",
    pressed: null,
  });

  // And back, so the absence is a property of the control rather than of one
  // theme it happened to boot into.
  await button.click();
  await expect.poll(async () => (await read()).theme).toBe("dark");
  expect(await read()).toEqual({
    theme: "dark",
    name: "Switch to light theme",
    title: "Switch to light theme",
    pressed: null,
  });
});
