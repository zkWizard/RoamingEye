import { test, expect, type Page } from "@playwright/test";
import { awaitAppInteractive } from "./boot";

/**
 * Two overlays can be open at once, and Tab has to keep working.
 *
 * `?` raises the shortcuts sheet from anywhere — including over a panel the
 * reader already opened — so two focus traps end up listening on `document`
 * in the capture phase at the same time. Each one saw focus sitting outside
 * its own panel and pulled it back in, so the two cancelled: every Tab landed
 * back on the button it started from and neither panel's content was
 * reachable. Escape was the only way out of a two-element dead end.
 *
 * The trap stack fixes it by letting the topmost overlay own the key. These
 * assertions pin both halves of that: Tab moves, and it moves only inside the
 * sheet on top.
 *
 * Escape answers to the same stack. It used to be handled by every open
 * overlay at once, so dismissing the sheet also threw away the panel the
 * reader had open underneath it; now each press peels off one layer.
 */

/** Where focus is, as a stable string. */
function activeDescriptor(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return "none";
    const cls =
      typeof el.className === "string" && el.className.trim()
        ? `.${el.className.trim().split(/\s+/).join(".")}`
        : "";
    return `${el.tagName}${el.id ? `#${el.id}` : ""}${cls}`;
  });
}

test("the shortcuts sheet owns Tab when it opens over another panel", async ({
  page,
}) => {
  await page.goto("/");
  await awaitAppInteractive(page);

  // Open the providers panel the way a keyboard does.
  await page.locator("#providers-link").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#providers-page.is-open")).toHaveCount(1);

  // Raise the shortcuts sheet over it.
  await page.keyboard.press("?");
  await expect(page.locator("#shortcuts-page.is-open")).toHaveCount(1);
  // Both are open — this is the state the dead end lived in.
  await expect(page.locator("#providers-page.is-open")).toHaveCount(1);

  // Tab four times and record every stop.
  const visited: string[] = [];
  const insideSheet: boolean[] = [];
  for (let index = 0; index < 4; index += 1) {
    await page.keyboard.press("Tab");
    visited.push(await activeDescriptor(page));
    insideSheet.push(
      await page.evaluate(() =>
        Boolean(
          document
            .querySelector("#shortcuts-page")
            ?.contains(document.activeElement)
        )
      )
    );
  }

  // The defect: four presses, one element, no way into either panel.
  expect(
    new Set(visited).size,
    `Tab never moved — focus stayed on ${visited[0]}`
  ).toBeGreaterThan(1);
  // And focus never escapes into the panel underneath.
  expect(insideSheet, `focus left the sheet: ${visited.join(" -> ")}`).toEqual([
    true,
    true,
    true,
    true,
  ]);

  // Escape dismisses the sheet on top and nothing else. Glancing at the
  // shortcuts sheet used to cost the reader the panel underneath: every
  // overlay listens for Escape on `document`, so one press closed all of them.
  await page.keyboard.press("Escape");
  await expect(page.locator("#shortcuts-page.is-open")).toHaveCount(0);
  await expect(page.locator("#providers-page.is-open")).toHaveCount(1);
  // Focus lands back in the panel the reader was already reading.
  expect(
    await page.evaluate(() =>
      Boolean(
        document
          .querySelector("#providers-page")
          ?.contains(document.activeElement)
      )
    ),
    `focus left the providers panel: ${await activeDescriptor(page)}`
  ).toBe(true);

  // A second Escape leaves the panel underneath, restoring the opener.
  await page.keyboard.press("Escape");
  await expect(page.locator("#providers-page.is-open")).toHaveCount(0);
  expect(await activeDescriptor(page)).toBe(
    "BUTTON#providers-link.attribution__link"
  );
});
