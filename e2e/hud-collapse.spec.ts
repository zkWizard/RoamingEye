import { test, expect } from "@playwright/test";
import { awaitAppInteractive } from "./boot";

/**
 * The bottom HUD can be folded out of the way on short windows.
 *
 * #980 bought the aim back from the panel by spending the panel's spacing, and
 * said in its own comment that the spacing was then spent — below about 610px
 * the crosshair lands on the HUD again, and a phone held in landscape is 360 to
 * 430px tall, where the panel occupies three quarters of the display. Three
 * items in docs/BACKLOG.md converge on the same call: the rest of the height can
 * only come out of content, and which content is a decision for the reader
 * rather than a threshold to guess at.
 *
 * So the panel keeps every row it has ever had and gains a way to fold the two
 * tall ones away. What the fold KEEPS is the substance of the decision and the
 * reason these assertions name it: the layer selector still says what is on the
 * globe and the provenance line still carries the product ID and the month, so
 * no citation and no date is lost to a gesture meant to buy screen space.
 *
 * The button and the collapsed state are declared inside one media query, which
 * is what makes the state safe to leave behind — see the last test.
 */

const SHORT = { width: 1280, height: 620 };
const LANDSCAPE_PHONE = { width: 844, height: 390 };
const ROOMY = { width: 1280, height: 900 };

const centreId = (page: import("@playwright/test").Page) =>
  page.evaluate(
    () =>
      document.elementFromPoint(
        Math.round(window.innerWidth / 2),
        Math.round(window.innerHeight / 2)
      )?.id ?? "(none)"
  );

test("a roomy window does not render the control at all", async ({ page }) => {
  await page.setViewportSize(ROOMY);
  await page.goto("/");
  await awaitAppInteractive(page);

  // Not merely invisible: `display: none` keeps it out of the tab ring, so a
  // keyboard user at a height with no crowding never meets a control for a
  // problem they do not have.
  await expect(page.locator("#hud-collapse")).toBeHidden();
});

test("folding the panel keeps the layer, the product ID and the month", async ({
  page,
}) => {
  await page.setViewportSize(SHORT);
  await page.goto("/");
  await awaitAppInteractive(page);

  const button = page.locator("#hud-collapse");
  await expect(button).toBeVisible();
  await expect(button).toHaveAttribute("aria-expanded", "true");

  // The provenance line is the citation and the date. Read it before folding so
  // the assertion after is that it SURVIVED, not merely that something is there.
  const provenance = page.locator("#provenance");
  const cited = (await provenance.textContent())?.trim() ?? "";
  expect(cited).not.toBe("");

  await button.click();

  await expect(button).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#legend")).toBeHidden();
  await expect(page.locator("#timeline")).toBeHidden();
  // The two that must not go.
  await expect(page.locator("#layer-selector")).toBeVisible();
  await expect(provenance).toBeVisible();
  await expect(provenance).toHaveText(cited);

  // And it is a fold, not a one-way door.
  await button.click();
  await expect(button).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#legend")).toBeVisible();
  await expect(page.locator("#timeline")).toBeVisible();
});

test("a phone in landscape can give the middle of the view back to the globe", async ({
  page,
}) => {
  await page.setViewportSize(LANDSCAPE_PHONE);
  await page.goto("/");
  await awaitAppInteractive(page);

  // The defect, stated as a measurement: at this size the panel is most of the
  // screen and the aim point is inside it.
  expect(await centreId(page)).not.toBe("globe");

  await page.locator("#hud-collapse").click();

  await expect
    .poll(() => centreId(page), {
      message: "the folded panel still covers the aim point in landscape",
    })
    .toBe("globe");
});

test("the fold costs the expanded panel no height, and cannot strand a row", async ({
  page,
}) => {
  await page.setViewportSize(SHORT);
  await page.goto("/");
  await awaitAppInteractive(page);

  const panelHeight = () =>
    page.evaluate(() =>
      Math.round(
        document.querySelector("#controls")!.getBoundingClientRect().height
      )
    );

  // The button is out of flow and the reserved corner is horizontal, so an
  // expanded panel measures exactly what it did before the affordance existed.
  // This is the assertion that stops the control from pushing the panel back
  // over the aim it was added to uncover.
  const withButton = await panelHeight();
  await page.addStyleTag({
    content: `.controls__collapse{display:none !important}#layer-selector{padding:0 !important}`,
  });
  expect(await panelHeight()).toBe(withButton);

  await page.reload();
  await awaitAppInteractive(page);
  await page.locator("#hud-collapse").click();
  await expect(page.locator("#legend")).toBeHidden();

  // Growing the window past the threshold takes the button away with it, so the
  // collapsed state must not outlive the control that undoes it — otherwise a
  // reader who folds the panel and then maximises is left with rows hidden and
  // nothing on screen to bring them back.
  await page.setViewportSize(ROOMY);
  await expect(page.locator("#hud-collapse")).toBeHidden();
  await expect(page.locator("#legend")).toBeVisible();
  await expect(page.locator("#timeline")).toBeVisible();
});
