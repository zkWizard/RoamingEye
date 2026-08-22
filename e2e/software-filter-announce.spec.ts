import { test, expect } from "@playwright/test";
import { awaitAppInteractive } from "./boot";

/**
 * The software finder must not read its own filter out loud, keystroke by
 * keystroke.
 *
 * `.software__status` carries the answer the panel exists to give — how many
 * reviewed projects match the current filters. `render()` runs on every `input`
 * event and every write was `aria-live="polite"`, so typing "geopandas" queued
 * NINE announcements: four counts already stale by the time they were read,
 * then the answer repeated five times. Polite messages QUEUE rather than
 * replace, which is the same trap `probe-progress-announce.spec.ts` pins for
 * the per-month counter, on a surface that never got the treatment.
 *
 * Intermediate writes now carry `aria-live="off"` and only the settled count is
 * spoken. Asserted from a MutationObserver rather than by sampling the DOM,
 * because a poll that reads the text and the attribute in two steps can catch
 * one write's text next to a later write's politeness and prove nothing.
 */

type Write = { text: string; live: string | null };

const COUNT = /^\d+ verified projects?$/;

test.use({ viewport: { width: 1280, height: 900 } });

test("only the settled filter count is announced", async ({ page }) => {
  await page.goto("/");
  await awaitAppInteractive(page);
  await page.locator("#software-link").click();
  await expect(page.locator(".software.is-open")).toHaveCount(1, {
    timeout: 20_000,
  });

  const status = page.locator(".software__status");
  await expect(status).toContainText(COUNT, { timeout: 20_000 });
  // Let the count the panel opens with settle and be spoken, so what the
  // recording below holds is the typing and nothing else.
  await page.waitForTimeout(800);
  const idleBox = await status.boundingBox();

  // Record every write to the status line, with the politeness in force AT the
  // mutation — the pairing is the whole assertion.
  await page.evaluate(() => {
    const w = window as unknown as { __statusWrites__?: Write[] };
    w.__statusWrites__ = [];
    new MutationObserver((records) => {
      for (const record of records) {
        const el = (
          record.target.nodeType === Node.TEXT_NODE
            ? record.target.parentElement
            : (record.target as Element)
        )?.closest?.(".software__status");
        if (!el) continue;
        w.__statusWrites__!.push({
          text: el.textContent ?? "",
          live: el.getAttribute("aria-live"),
        });
      }
    }).observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["aria-live"],
    });
  });

  // A query that narrows the catalog several times on the way down, so a
  // keystroke-by-keystroke reading is made of counts that are WRONG by the time
  // they are read, not merely repetitive.
  const QUERY = "geopandas";
  await page.locator(".software__query").click();
  await page.locator(".software__query").pressSequentially(QUERY, {
    delay: 60,
  });
  const typingBox = await status.boundingBox();
  // Past the settle delay, so the one announcement that should exist has landed.
  await page.waitForTimeout(1200);

  const writes = await page.evaluate(
    () => (window as unknown as { __statusWrites__: Write[] }).__statusWrites__
  );

  // Premise: the typing really did rewrite the line many times over. Without
  // this the assertion below passes on a panel that simply stopped working.
  expect(
    writes.filter((w) => COUNT.test(w.text.trim())).length,
    "the filter never rewrote its count while typing"
  ).toBeGreaterThanOrEqual(QUERY.length);

  const settled = (await status.textContent())?.trim() ?? "";
  expect(settled, "the filter settled on something other than a count").toMatch(
    COUNT
  );

  // The assertion. Every write a screen reader would speak carries the answer
  // the reader is actually waiting for; not one of the counts the typing passed
  // through on the way there is spoken.
  const spoken = writes.filter((w) => w.live !== "off");
  const stale = spoken.filter((w) => w.text.trim() !== settled);
  expect(
    stale.map((w) => w.text.trim()),
    `${stale.length} of ${spoken.length} spoken writes carried a stale count`
  ).toEqual([]);

  // And the reader is not left in silence instead: the settled count IS spoken.
  // One logical write is recorded twice — once for the politeness restore and
  // once for the text — so this is "at least one", not "exactly one".
  expect(
    spoken.length,
    "the settled count was never announced at all"
  ).toBeGreaterThan(0);
  await expect(status).toHaveAttribute("aria-live", "polite");

  // The cue is invisible, so it cannot move the panel — and this panel sits
  // above the bottom HUD that has broken fixed-point specs three times. The
  // line occupies the same box before, during, and after.
  expect(typingBox, "the status line moved while typing").toEqual(idleBox);
  expect(await status.boundingBox(), "the status line moved on settle").toEqual(
    idleBox
  );
});
