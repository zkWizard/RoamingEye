import { test, expect } from "@playwright/test";
import { awaitAppInteractive } from "./boot";

/**
 * A long probe must not read its own progress bar out loud.
 *
 * `.probe__status` is one element carrying two kinds of message: the settled
 * result, with its provenance and uncertainty clauses, and — while the record
 * streams in — a per-month counter. The sampler's `onProgress` fires once per
 * month, and the element was marked `aria-live="polite"` for all of it, so a
 * 316-month record queued 316 announcements. Polite messages QUEUE rather than
 * replace, so a screen reader read the whole count out and delivered the answer
 * the reader had actually asked for at the back of it.
 *
 * The counter now writes with `aria-live="off"`; every other message keeps
 * `polite`. Asserted from a MutationObserver rather than by sampling the DOM,
 * because a poll that reads the text and the attribute in two steps can catch
 * one write's text next to a later write's politeness and prove nothing.
 *
 * Taller than the 1280x720 default for the reason probe-keyboard.spec.ts is:
 * at 720 the bottom HUD covers the middle of the view, which is the aim Enter
 * charts.
 */

test.use({ viewport: { width: 1280, height: 900 } });

const COUNTER = /^Sampling \d+\/\d+ months…$/;

type Write = { text: string; live: string | null };

test("the per-month counter is written silently, the result is announced", async ({
  page,
}) => {
  await page.goto("/");
  await awaitAppInteractive(page);

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
        )?.closest?.(".probe__status");
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

  await page.locator("#globe").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".probe.is-open")).toHaveCount(1);

  // Twenty ticks is well past the point the flood was audible and arrives in
  // a few seconds, where waiting out the whole record would take ~40s — too
  // slow for the blocking gate, and it would assert nothing the first twenty
  // do not. Poll the recording rather than the DOM: a poll that reads the text
  // and the attribute in two steps can pair one write's text with a later
  // write's politeness and prove nothing.
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (
              window as unknown as { __statusWrites__: Write[] }
            ).__statusWrites__.filter((w) =>
              /^Sampling \d+\/\d+ months…$/.test(w.text.trim())
            ).length
        ),
      {
        message: "the probe never streamed a per-month counter",
        timeout: 20_000,
      }
    )
    .toBeGreaterThan(20);

  const writes = await page.evaluate(
    () => (window as unknown as { __statusWrites__: Write[] }).__statusWrites__
  );

  const counters = writes.filter((w) => COUNTER.test(w.text.trim()));
  const announced = counters.filter((w) => w.live !== "off");
  expect(
    announced.map((w) => w.text.trim()).slice(0, 5),
    `${announced.length} of ${counters.length} counter writes would be announced`
  ).toEqual([]);

  // And the restore, which is what keeps the message a reader is waiting for
  // audible. "Sampling…" opens every run and is not a counter, so it travels
  // the same default path the settled result does — asserting it here costs
  // none of the record's streaming time.
  const opening = writes.find((w) => !COUNTER.test(w.text.trim()));
  expect(opening?.text.trim(), "the run opened with no spoken message").toBe(
    "Sampling…"
  );
  expect(opening?.live, "a non-counter message is left silent").toBe("polite");

  // The same state read off the DOM rather than out of the recording: the
  // record is still streaming here, so the live element itself is the one the
  // counter last wrote, and it is silent.
  await expect(page.locator(".probe__status")).toHaveAttribute(
    "aria-live",
    "off"
  );
});
