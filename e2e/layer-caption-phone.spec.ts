import { test, expect } from "@playwright/test";
import { awaitAppInteractive } from "./boot";

/**
 * A phone must be able to reach the layer's caption.
 *
 * `LAYERS[id].description` is the layer's instrument and its qualifier —
 * "clear-sky max-value composite, not a monthly mean", "0-10 cm (GLDAS Noah)
 * — not root zone". `.legend__caption` hides it below 541px wide because the
 * HUD has no room (see the rule's comment in style.css for the arithmetic),
 * and its only other copy was the option's `title`, which needs a hover a
 * touch screen cannot make. So the caveat was unreachable on the widths where
 * a reader is least likely to check twice — the one class of text this app
 * should never drop.
 *
 * It now renders as the second line of each option in the layer dropdown,
 * which is out of flow and scrolls itself, so the HUD keeps its height. These
 * assert the two halves that matter: the caveat is READABLE on a phone, and
 * the panel did NOT grow to pay for it.
 */

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("the layer caption is readable without a hover", async ({ page }) => {
    await page.goto("/");
    await awaitAppInteractive(page);

    // Precondition: the legend really does drop it at this width, or this
    // test is asserting a redundancy rather than the fix.
    await expect(page.locator(".legend__caption")).toBeHidden();

    const panelTopBefore = await page.evaluate(
      () =>
        (
          document.querySelector(".controls") as HTMLElement
        ).getBoundingClientRect().top
    );

    await page.locator(".layer-selector__trigger").click();
    const desc = page
      .locator(
        '.layer-selector__option[aria-selected="true"] .layer-selector__option-desc'
      )
      .first();
    await expect(desc).toBeVisible();
    // The caveat itself, not merely some text: this is the half of the
    // sentence that stops a reader treating the composite as a monthly mean.
    await expect(desc).toContainText("not a monthly mean");
    // And it is the caption verbatim rather than a paraphrase — `title` holds
    // the same LAYERS[id].description, so comparing the two pins the visible
    // line to the source string without copying it into this file.
    const selected = page
      .locator('.layer-selector__option[aria-selected="true"]')
      .first();
    expect((await desc.textContent())?.trim()).toBe(
      await selected.getAttribute("title")
    );

    // Every layer carries one — the caveat is not just on the default.
    const options = page.locator(".layer-selector__option");
    const count = await options.count();
    expect(count).toBeGreaterThan(5);
    for (let i = 0; i < count; i += 1) {
      const text = await options
        .nth(i)
        .locator(".layer-selector__option-desc")
        .textContent();
      expect((text ?? "").length).toBeGreaterThan(20);
    }

    // The HUD paid nothing for it: the dropdown is out of flow, so the panel
    // that sits over the globe is exactly where it was. This is the assertion
    // that fails if someone "simplifies" this back into the legend.
    const panelTopAfter = await page.evaluate(
      () =>
        (
          document.querySelector(".controls") as HTMLElement
        ).getBoundingClientRect().top
    );
    expect(panelTopAfter).toBe(panelTopBefore);
  });

  test("the option still answers to its own name", async ({ page }) => {
    await page.goto("/");
    await awaitAppInteractive(page);
    await page.locator(".layer-selector__trigger").click();
    // Selecting by label must stay unambiguous now that a second line of text
    // lives inside the button.
    const terrain = page.locator(".layer-selector__option", {
      hasText: "Terrain",
    });
    await expect(terrain).toHaveCount(1);
    await terrain.click();
    // The trigger shows the full label, parenthetical and all
    // ("Terrain (shaded relief)"), so this is a containment check by design.
    await expect(page.locator(".layer-selector__current")).toContainText(
      "Terrain"
    );
  });
});

test.describe("desktop", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("the desktop dropdown does not repeat the legend caption", async ({
    page,
  }) => {
    await page.goto("/");
    await awaitAppInteractive(page);
    // Above 540px the legend shows the caption itself, so a copy in the
    // dropdown would be the same sentence twice on one screen.
    await expect(page.locator(".legend__caption")).toBeVisible();
    await page.locator(".layer-selector__trigger").click();
    await expect(
      page.locator(".layer-selector__option-desc").first()
    ).toBeHidden();
  });
});
