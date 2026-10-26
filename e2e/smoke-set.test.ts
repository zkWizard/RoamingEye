import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

/**
 * The required CI job runs only the tests tagged `@smoke`. This pins that
 * set, so deleting a tag (or adding one without saying so) fails `npm test`
 * instead of quietly shrinking or growing the merge gate.
 *
 * Titles are `file › name`, without the `@smoke` tag and without Playwright's
 * line numbers, which move whenever the file is edited.
 */
test("the @smoke tag matches the pinned critical path", () => {
  const output = execFileSync(
    process.execPath,
    [
      "node_modules/playwright/cli.js",
      "test",
      "--project=chromium",
      "--grep",
      "@smoke",
      "--list",
    ],
    { encoding: "utf8" }
  ).replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g"), "");

  const listed = new Set<string>();
  for (const line of output.split("\n")) {
    const match = line.match(/\[chromium\] › (\S+\.spec\.ts):\d+:\d+ › (.+)$/);
    if (!match) continue;
    const file = match[1].startsWith("e2e/") ? match[1] : `e2e/${match[1]}`;
    const title = match[2].replace(/(?: @\S+)+$/, "").trim();
    listed.add(`${file} › ${title}`);
  }

  const pinned = readFileSync("e2e/smoke-set.txt", "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));

  const missing = pinned.filter((title) => !listed.has(title));
  const extra = [...listed].filter((title) => !pinned.includes(title));
  expect(
    { missing, extra, listed: [...listed].sort() },
    [
      "The required smoke set changed.",
      "Missing tags drop merge-gate coverage; extra tags slow every PR.",
      "Update e2e/smoke-set.txt in the same change, on purpose.",
    ].join(" ")
  ).toEqual({ missing: [], extra: [], listed: [...pinned].sort() });
}, 60_000);
