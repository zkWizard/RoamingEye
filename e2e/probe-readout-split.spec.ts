import { test, expect } from "@playwright/test";
import { awaitAppInteractive } from "./boot";

/**
 * The settled probe readout is two paragraphs, and only the first is spoken.
 *
 * `.probe__status` is `aria-live="polite"`, and the settled line had grown to
 * 580–700 characters. Measured on main at this point, NDVI: 684 characters, of
 * which the reading the user probed for — the month count and the three
 * extremes — is the first 166. Five lazily-loaded clauses each re-set the WHOLE
 * line as they landed, so that paragraph was announced three times over, with
 * the answer buried at clause 1 of six every time. Sighted, both halves carried
 * identical typographic weight in a 366px column.
 *
 * The reading now stays alone in the live region; everything from the per-value
 * uncertainty onward moved, in the same order and the same words, into
 * `.probe__status-detail`, which is deliberately not a live region. Measured
 * after: 166 announced, 518 on screen and silent.
 *
 * The boundary is the one `ProbePanel.finish()` already documented — "the
 * reading first, then its accuracy, then what the product's caps and observing
 * system do to it" — so this spec pins it by both ends: the reading half must
 * carry the count and the extremes, and must NOT carry the uncertainty clause
 * that opens the other half.
 *
 * The camera is aimed rather than left at the boot default, which sits at
 * 0°N 90°W — open Pacific, where NDVI returns no usable month and takes the
 * domain-note path instead: one standalone sentence with no trailing half and
 * nothing to split. The Amazon basin returns a full 316-of-316 record, so the
 * split is actually exercised. Enter probes the camera's subpoint (see the
 * canvas keydown handler in main.ts), so the hash aims the probe.
 *
 * Reaching a settled readout costs ~30s of sampling, so this raises the test
 * timeout the way probe-csv-copy-announce.spec.ts does for the same wait —
 * the split only exists on a finished record, and there is no shorter route.
 *
 * Taller than the 1280x720 default for the reason probe-progress-announce and
 * probe-keyboard are: at 720 the bottom HUD covers the middle of the view,
 * which is the aim Enter charts.
 */

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(120_000);

/** Dense evergreen canopy: a full record on every sampled month. */
const AMAZON = "/#layer=ndvi&lat=-3.00&lon=-60.00&alt=1.80";

const READING = /^\d+ of \d+ months\b/;

test("the reading is announced alone; its qualifications are not a live region", async ({
  page,
}) => {
  await page.goto(AMAZON);
  await awaitAppInteractive(page);

  const status = page.locator(".probe__status");
  const detail = page.locator(".probe__status-detail");

  // The detail paragraph is in the tree from boot — a region has to exist
  // before the mutation it carries — but holds nothing yet, and while empty it
  // is `hidden`. That is what keeps every non-stats message (the opening
  // "Sampling…", a chunk-load failure, an empty record's domain note) rendering
  // at exactly the height it always did.
  await expect(detail).toBeHidden();

  await page.locator("#globe").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".probe.is-open")).toHaveCount(1);

  // Settled = the status stopped being the opening message or the per-month
  // counter that replaces it.
  await expect
    .poll(
      async () => {
        const text = ((await status.textContent()) ?? "").trim();
        return text === "" || /^Sampling/.test(text) ? "pending" : "settled";
      },
      { message: "the probe never settled", timeout: 90_000 }
    )
    .toBe("settled");

  const settled = ((await status.textContent()) ?? "").trim();

  // The live region holds the reading: the month count and the three extremes.
  expect(settled, `status was: ${settled}`).toMatch(READING);
  expect(settled).toMatch(/\bmin\b/);
  expect(settled).toMatch(/\bmean\b/);
  expect(settled).toMatch(/\bmax\b/);

  // ...and nothing past the boundary. This is the assertion that fails if a
  // future clause is appended to the reading instead of to the detail, which
  // is exactly how the line grew to 684 characters in the first place.
  expect(
    settled,
    "the uncertainty clause opens the trailing half and must not be announced with the reading"
  ).not.toMatch(/per value/);

  // The qualifications are on screen, in the second paragraph, starting with
  // the clause that used to sit sixth-from-the-front of the announcement.
  await expect(detail).toBeVisible();
  await expect(detail).toContainText("per value");

  // Not a live region: a clause landing a moment after the result must not
  // re-interrupt a reader. Same argument the progress counter's `off` makes.
  expect(
    await detail.getAttribute("aria-live"),
    "the trailing half must not announce"
  ).toBeNull();

  // The announced half is the short, scannable one it reads as. 400 sits well
  // above the measured 166 and well below the 684 a re-merge would restore, so
  // this fails on a regression rather than on a layer whose clauses print wide.
  expect(
    settled.length,
    `the announced reading is ${settled.length} chars: ${settled}`
  ).toBeLessThan(400);
});
