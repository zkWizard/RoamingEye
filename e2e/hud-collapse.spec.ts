import { test, expect } from "@playwright/test";
import { awaitAppInteractive } from "./boot";

/**
 * The bottom dock can be folded out of the way on phones.
 *
 * The fold was added when the HUD was a 301px column that climbed over the aim
 * on any window shorter than ~720px. The dock that replaced it is ~73px on a
 * desktop, so a short desktop window no longer needs a fold at all (the first
 * tests below say so); the fold is offered where the dock still competes with
 * the middle of the view: phones, upright and in landscape.
 *
 * What the fold KEEPS is the substance of the decision and the reason these
 * assertions name it: the layer selector still says what is on the globe and
 * the provenance line still carries the product ID and the month, so no
 * citation and no date is lost to a gesture meant to buy screen space.
 *
 * The button and the collapsed state are declared inside one media query, which
 * is what makes the state safe to leave behind — see the last test.
 */

// A short desktop window: where the old panel needed the fold.
const SHORT = { width: 1280, height: 620 };
// A mouse window narrow enough for the phone layout, where the fold renders
// and the dock opens expanded.
const NARROW = { width: 480, height: 800 };
const LANDSCAPE_PHONE = { width: 844, height: 390 };
const PORTRAIT_PHONE = { width: 390, height: 844 };
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

test("a short desktop window keeps the aim on the globe with no fold", async ({
  page,
}) => {
  await page.setViewportSize(SHORT);
  await page.goto("/");
  await awaitAppInteractive(page);

  // The fold existed for this size; the dock made it unnecessary. Asserting
  // both halves: nothing to fold, and nothing over the aim that would need it.
  await expect(page.locator("#hud-collapse")).toBeHidden();
  expect(await centreId(page)).toBe("globe");
});

test("folding the panel keeps the layer, the product ID and the month", async ({
  page,
}) => {
  await page.setViewportSize(NARROW);
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

test("a phone in landscape opens with the middle of the view on the globe", async ({
  page,
}) => {
  await page.setViewportSize(LANDSCAPE_PHONE);
  await page.goto("/");
  await awaitAppInteractive(page);

  // This test used to state the defect as a measurement — at this size the
  // panel was most of the screen and the aim point was inside it — and then
  // fold it away by hand. The fold is now the default here rather than the
  // remedy: expanded, the panel's own top is off the screen at the shorter
  // landscape sizes, which takes the control that would fold it, so a default
  // that cannot be reversed is not an offer. See landscape-overlays.spec.ts,
  // which owns the layout that decision belongs to.
  expect(await centreId(page)).toBe("globe");

  // What is asserted here is the round trip: the reader can still have every
  // row, and can still put them away again.
  await page.locator("#hud-collapse").click();
  await expect
    .poll(() => centreId(page), {
      message: "unfolding in landscape did not bring the panel back",
    })
    .not.toBe("globe");

  await page.locator("#hud-collapse").click();
  await expect
    .poll(() => centreId(page), {
      message: "the folded panel still covers the aim point in landscape",
    })
    .toBe("globe");
});

// The landscape phone is both the case this control exists for and a coarse
// pointer, so it takes the 44px the rest of the chrome takes. The guarantee is
// pinned here rather than in a11y.spec.ts's TOUCH_TARGETS list because the
// reasoning for the size lives with the control — and it is asserted at both
// orientations, since the two reach the rule through different arms of the
// query and only a size that holds either way is worth calling a guarantee.
test.describe("on a phone in landscape", () => {
  test.use({ hasTouch: true, viewport: LANDSCAPE_PHONE });

  test("the fold control meets the 44px touch target the chrome uses", async ({
    page,
  }) => {
    await page.goto("/");
    await awaitAppInteractive(page);

    expect(
      await page.evaluate(() => matchMedia("(pointer: coarse)").matches),
      "emulation must actually select the coarse-pointer rules"
    ).toBe(true);

    const geometry = await page.evaluate(() => {
      const button = document
        .querySelector("#hud-collapse")!
        .getBoundingClientRect();
      const pill = document
        .querySelector(".layer-selector__trigger")!
        .getBoundingClientRect();
      // The 44px box overhangs its slot, so it must not overhang the layer
      // selector, the one control the fold always keeps. Folded in landscape
      // it sits at the far end of the pill's row.
      const overlaps =
        button.left < pill.right &&
        pill.left < button.right &&
        button.top < pill.bottom &&
        pill.top < button.bottom;
      return {
        width: Math.round(button.width),
        height: Math.round(button.height),
        overlapsPill: overlaps,
      };
    });

    expect(geometry.width).toBeGreaterThanOrEqual(44);
    expect(geometry.height).toBeGreaterThanOrEqual(44);
    expect(geometry.overlapsPill).toBe(false);
  });
});

/**
 * A phone held UPRIGHT is 844-932px tall, so it clears the 720px height
 * threshold the fold was originally scoped to and reads as a roomy viewport.
 * The panel is a fixed 373px regardless, which is 40.7% of a 412x915 Pixel and
 * 46.6% of a 360x800 Android, and at 390x844 the centre of the view hit-tests
 * the legend rather than the globe — so the form factor with the worst ratio
 * was the only one that could not reach the control that fixes it.
 *
 * These tests are about REACHABILITY, not about a new default: the panel still
 * opens expanded at exactly the height it always did, and the first assertion
 * below says so. What changed is that the gesture a short window already had
 * now exists here too.
 */
test.describe("on a phone held upright", () => {
  test.use({ hasTouch: true, viewport: PORTRAIT_PHONE });

  test("the fold is reachable, and folding gives the aim back", async ({
    page,
  }) => {
    await page.goto("/");
    await awaitAppInteractive(page);

    const button = page.locator("#hud-collapse");
    await expect(button).toBeVisible();
    // The default is unchanged: nothing folds on its own here, which is what
    // separates this from the landscape case above.
    await expect(button).toHaveAttribute("aria-expanded", "true");

    // The citation and the date are read before the fold so the assertion
    // after is that they SURVIVED it.
    const provenance = page.locator("#provenance");
    const cited = (await provenance.textContent())?.trim() ?? "";
    expect(cited).not.toBe("");

    await button.click();

    await expect(page.locator("#legend")).toBeHidden();
    await expect(page.locator("#timeline")).toBeHidden();
    await expect(page.locator("#layer-selector")).toBeVisible();
    await expect(provenance).toBeVisible();
    await expect(provenance).toHaveText(cited);

    // The point of the whole exercise: the middle of the screen is the globe.
    await expect
      .poll(() => centreId(page), {
        message: "folding in portrait did not clear the aim point",
      })
      .toBe("globe");

    // And it is a fold, not a one-way door.
    await button.click();
    await expect(page.locator("#legend")).toBeVisible();
    await expect(page.locator("#timeline")).toBeVisible();
  });

  test("the control meets the 44px touch target here too", async ({ page }) => {
    await page.goto("/");
    await awaitAppInteractive(page);

    expect(
      await page.evaluate(() => matchMedia("(pointer: coarse)").matches),
      "emulation must actually select the coarse-pointer rules"
    ).toBe(true);

    const box = await page.locator("#hud-collapse").boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });

  test("widening past the query takes the control and the fold together", async ({
    page,
  }) => {
    await page.goto("/");
    await awaitAppInteractive(page);

    // The invariant the stylesheet promises, now reached through the width arm
    // rather than the height one: a reader who folds the panel on a phone and
    // then lands on a desktop-width viewport must not be left with rows hidden
    // and no visible control to bring them back.
    await page.locator("#hud-collapse").click();
    await expect(page.locator("#legend")).toBeHidden();

    await page.setViewportSize(ROOMY);
    await expect(page.locator("#hud-collapse")).toBeHidden();
    await expect(page.locator("#legend")).toBeVisible();
    await expect(page.locator("#timeline")).toBeVisible();
  });
});

test("the fold costs the expanded panel no height, and cannot strand a row", async ({
  page,
}) => {
  await page.setViewportSize(NARROW);
  await page.goto("/");
  await awaitAppInteractive(page);

  const panelHeight = () =>
    page.evaluate(() =>
      Math.round(
        document.querySelector("#controls")!.getBoundingClientRect().height
      )
    );

  // The button is laid out one text line tall in a line of text, so an
  // expanded panel measures exactly what it would without the affordance.
  // This is the assertion that stops the control from pushing the panel back
  // over the aim it was added to uncover.
  // Growing the window past the threshold takes the button away with it, so the
  // collapsed state must not outlive the control that undoes it — otherwise a
  // reader who folds the panel and then maximises is left with rows hidden and
  // nothing on screen to bring them back.
  await page.locator("#hud-collapse").click();
  await expect(page.locator("#legend")).toBeHidden();

  await page.setViewportSize(ROOMY);
  await expect(page.locator("#hud-collapse")).toBeHidden();
  await expect(page.locator("#legend")).toBeVisible();
  await expect(page.locator("#timeline")).toBeVisible();

  // Height neutrality goes last: it injects a stylesheet that cannot be taken
  // back, and an earlier draft paid for that with a second boot to undo it —
  // which is the one thing in this spec that ever flaked.
  // Back to a narrow window, where the class is live again — and it IS still
  // set, since the roomy layout overrode it rather than clearing it. Unfold
  // before measuring, or this would compare a folded panel against itself.
  await page.setViewportSize(NARROW);
  await expect(page.locator("#hud-collapse")).toHaveAttribute(
    "aria-expanded",
    "false"
  );
  await page.locator("#hud-collapse").click();
  await expect(page.locator("#legend")).toBeVisible();

  const withButton = await panelHeight();
  await page.addStyleTag({
    content: `.controls__collapse{display:none !important}#layer-selector{padding:0 !important}`,
  });
  expect(await panelHeight()).toBe(withButton);
});
