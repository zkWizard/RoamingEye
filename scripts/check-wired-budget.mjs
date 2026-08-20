#!/usr/bin/env node
/**
 * Staged-module ratchet — the "wire it, don't shelve it" gate.
 *
 * RoamingEye accreted a large shelf of unit-tested but unreachable src/lib
 * modules: real, reviewed, passing code that nothing in the app imports, so no
 * user ever sees it (see ARCHITECTURE.md, "Wired vs. staged modules"). This
 * gate holds the number of staged modules at or below a committed ceiling, so
 * new logic has to earn a call site instead of adding to the shelf. Wiring a
 * staged module into the UI lowers the count; the ceiling ratchets down with
 * it (drop maxStagedModules in fleet/wired-budget.json).
 *
 * Same philosophy as scripts/check-bundle-size.mjs: you may raise the ceiling,
 * but only deliberately, in the PR that justifies it.
 *
 * Usage:
 *   node scripts/check-wired-budget.mjs             build with sourcemaps, then check
 *   node scripts/check-wired-budget.mjs --no-build  reuse an existing dist/
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { computeReachability } from "./walk-wired.mjs";

const budgetPath = join(process.cwd(), "fleet", "wired-budget.json");
const budget = JSON.parse(readFileSync(budgetPath, "utf8"));
const ceiling = budget.maxStagedModules;

if (!Number.isInteger(ceiling) || ceiling < 0) {
  console.error(
    `check-wired-budget: fleet/wired-budget.json "maxStagedModules" must be a non-negative integer (got ${JSON.stringify(ceiling)}).`
  );
  process.exit(1);
}

const build = !process.argv.includes("--no-build");
const { all, wired, staged } = computeReachability({ build });

console.log(
  `src/lib reachability: ${wired.length} wired, ${staged.length} staged (ceiling ${ceiling}) of ${all.length} modules`
);

if (staged.length > ceiling) {
  const over = staged.length - ceiling;
  console.error(
    `check-wired-budget: FAIL — ${staged.length} staged modules exceeds the ceiling of ${ceiling} by ${over}.\n` +
      `A staged module is unit-tested logic the app never imports, so wiring it in is what turns it into a feature.\n` +
      `Fix by wiring a staged module into the UI (see ARCHITECTURE.md "Wired vs. staged modules"),\n` +
      `or raise "maxStagedModules" in fleet/wired-budget.json deliberately, in the PR that justifies it.\n` +
      `Inspect the shelf: node scripts/walk-wired.mjs --list staged`
  );
  process.exit(1);
}

if (staged.length < ceiling) {
  console.log(
    `check-wired-budget: ok — ${ceiling - staged.length} module(s) below the ceiling. ` +
      `Lock in the win: lower "maxStagedModules" to ${staged.length} in fleet/wired-budget.json.`
  );
} else {
  console.log(
    "check-wired-budget: ok — at the ceiling (no net-new staged modules)."
  );
}
