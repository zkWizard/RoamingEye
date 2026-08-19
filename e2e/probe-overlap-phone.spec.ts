import { test, expect } from "@playwright/test";
import { awaitAppInteractive } from "./boot";

/**
 * On a phone held upright the probe dialog and the bottom HUD want the same
 * space, and the probe wins on z-index — so opening a probe used to take two of
 * the panel's controls away with it.
 *
 * Measured on main at 390x844: the panel stands 373px from y=347, the probe is
 * a 346px dialog ending at y=620, and the two overlap over 273px. `#hud-collapse`
 * sits at (20,350,44,44) and the layer selector at (121,360,157,44) — both
 * inside that band. A hit test on the button returned `DIV#probe-panel`, and on
 * the selector the probe's own chart canvas, so a reader who probed a point
 * could no longer change the layer, nor fold the panel that was covering the
 * globe. The probe's own controls stayed reachable, which is why this never
 * surfaced as a dead panel — only as two controls that stopped answering.
 *
 * The panel yields instead, using the fold it already has: folded it sits at
 * y=625, clear of the probe's 620px bottom, and both controls answer again.
 * The fold keeps the layer selector and the provenance line, so the product ID
 * and the month are still rendered — the same invariant hud-collapse.spec.ts
 * pins for the manual gesture.
 *
 * Scoped to `max-width: 540px`, where the probe is bottom-centred and the panel
 * has no room to keep its rows. Wider than that the probe is anchored left at
 * `top: 50%` — which does still reach the panel on a short window, but there the
 * answer is to move the probe rather than fold a panel that has the room
 * (probe-overlap-short-window.spec.ts). The last test here holds a window roomy
 * enough for neither remedy to apply.
 */

const PHONE = { width: 390, height: 844 };

/** Reachable = some point in some line box of the element hits the element. */
async function reach(page: import("@playwright/test").Page, selector: string) {
  return page.evaluate((sel) => {
    const el = document.querySelector<HTMLElement>(sel);
    if (!el) return { rendered: false, reachable: false, blockedBy: "missing" };
    const rects = Array.from(el.getClientRects()).filter(
      (r) => r.width > 0 && r.height > 0
    );
    if (!rects.length)
      return { rendered: false, reachable: false, blockedBy: "not rendered" };
    let blockedBy: string | null = null;
    for (const r of rects) {
      const top = document.elementFromPoint(
        r.x + r.width / 2,
        r.y + r.height / 2
      );
      if (top && (top === el || el.contains(top)))
        return { rendered: true, reachable: true, blockedBy: null };
      if (!blockedBy)
        blockedBy = top
          ? `${top.tagName}${top.id ? "#" + top.id : ""}`
          : "null";
    }
    return { rendered: true, reachable: false, blockedBy };
  }, selector);
}

async function probeAPoint(page: import("@playwright/test").Page) {
  // Aim at the upper middle of the globe rather than a fixed pixel: the same
  // point has to land on the sphere at 390x844 and at 1280x900, and anywhere
  // lower it lands on the panel instead of the globe.
  const size = page.viewportSize()!;
  await page.locator("#globe").click({
    position: {
      x: Math.round(size.width / 2),
      y: Math.round(size.height * 0.3),
    },
  });
  await expect(page.locator(".probe")).toHaveClass(/is-open/, {
    timeout: 20_000,
  });
}

test.describe("probe and panel on a phone held upright", () => {
  test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

  test("opening a probe leaves the fold and the layer selector reachable", async ({
    page,
  }) => {
    await page.goto("/");
    await awaitAppInteractive(page);

    // The panel opens expanded here — nothing folds on its own at this height.
    await expect(page.locator("#controls")).not.toHaveClass(/is-collapsed/);

    await probeAPoint(page);

    // The panel has yielded, and the two controls the probe used to cover answer.
    await expect(page.locator("#controls")).toHaveClass(/is-collapsed/);
    expect(await reach(page, "#hud-collapse")).toMatchObject({
      reachable: true,
    });
    expect(await reach(page, ".layer-selector__trigger")).toMatchObject({
      reachable: true,
    });

    // The panel is clear of the probe rather than merely on top of it.
    const clearance = await page.evaluate(() => {
      const c = document.querySelector("#controls")!.getBoundingClientRect();
      const p = document.querySelector(".probe")!.getBoundingClientRect();
      return Math.round(c.top - p.bottom);
    });
    expect(clearance).toBeGreaterThanOrEqual(0);

    // What the fold keeps: the citation and the date survive it.
    await expect(page.locator("#provenance")).toBeVisible();
    await expect(page.locator(".layer-selector__trigger")).toBeVisible();
  });

  test("the reader's own expansion is not undone by re-probing", async ({
    page,
  }) => {
    await page.goto("/");
    await awaitAppInteractive(page);
    await probeAPoint(page);
    await expect(page.locator("#controls")).toHaveClass(/is-collapsed/);

    // Unfold deliberately, then switch probe mode — which re-opens the panel
    // for the same visit. Folding on the way IN only means this leaves it alone.
    await page.locator("#hud-collapse").click();
    await expect(page.locator("#controls")).not.toHaveClass(/is-collapsed/);

    const mode = page.locator(".probe__segment-btn", { hasText: "Area" });
    if (await mode.count()) {
      await mode.first().click();
      await page.waitForTimeout(600);
      await expect(page.locator("#controls")).not.toHaveClass(/is-collapsed/);
    }
  });
});

test.describe("a roomy window is untouched", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("the panel does not fold when a probe opens", async ({ page }) => {
    await page.goto("/");
    await awaitAppInteractive(page);
    await probeAPoint(page);
    // 1280x900 clears both arms of the fold's query, so no fold control is
    // rendered and nothing may fold on its own — folding here would strand the
    // reader with no way to bring the rows back.
    await expect(page.locator("#controls")).not.toHaveClass(/is-collapsed/);
  });
});
