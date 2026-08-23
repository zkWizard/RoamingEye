#!/usr/bin/env node
// Which src/lib modules are reachable from the shipped app?
//
// Oracle: vite's sourcemaps (dist/assets/*.js.map "sources"), which see
// static imports, dynamic import() chunks, and tree-shaking exactly as the
// bundle does. Regex import walks both over-count (`import type` edges are
// erased at build) and under-count (dynamic-import subtrees), so this script
// replaces them — and replaces the hand-maintained wired.txt, which rotted.
//
// Caveat: reachable ≠ exercised. A single constant import keeps a 400-line
// module in the bundle while every function in it tree-shakes away — grep
// what the importer actually uses before believing a module is integrated.
//
// The reachability walk is exported as computeReachability() so the
// staged-module budget gate (scripts/check-wired-budget.mjs) measures the
// bundle exactly the way this report does.
//
// Usage:
//   node scripts/walk-wired.mjs               build with sourcemaps, then report counts
//   node scripts/walk-wired.mjs --no-build    reuse the existing dist/
//   node scripts/walk-wired.mjs --list staged print unreachable module names, one per line
//   node scripts/walk-wired.mjs --list wired  print reachable module names
import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = process.cwd();

/**
 * Build (unless reusing an existing dist) and read which src/lib modules the
 * shipped bundle reaches, via vite's sourcemaps.
 *
 * @param {{ build?: boolean }} [options]
 * @returns {{ all: string[], wired: string[], staged: string[] }}
 */
export function computeReachability({ build = true } = {}) {
  if (build) {
    execSync("npx vite build --sourcemap", { stdio: "inherit" });
  }

  const dist = path.join(root, "dist", "assets");
  if (!existsSync(dist)) {
    throw new Error(
      "dist/assets not found — build first (run without --no-build)"
    );
  }

  const inBundle = new Set();
  for (const file of readdirSync(dist)) {
    if (!file.endsWith(".js.map")) continue;
    const map = JSON.parse(readFileSync(path.join(dist, file), "utf8"));
    for (const source of map.sources ?? []) {
      const normalized = source.split("\\").join("/");
      const at = normalized.indexOf("src/lib/");
      if (at >= 0) inBundle.add(normalized.slice(at + "src/lib/".length));
    }
  }

  const all = readdirSync(path.join(root, "src", "lib"))
    .filter((f) => f.endsWith(".ts") && !f.includes(".test."))
    .sort();
  const wired = all.filter((f) => inBundle.has(f));
  const staged = all.filter((f) => !inBundle.has(f));
  return { all, wired, staged };
}

function main() {
  const args = process.argv.slice(2);
  const { all, wired, staged } = computeReachability({
    build: !args.includes("--no-build"),
  });

  const listAt = args.indexOf("--list");
  if (listAt >= 0) {
    const which = args[listAt + 1] === "wired" ? wired : staged;
    for (const f of which) console.log(f);
  } else {
    console.log(
      `src/lib: ${all.length} modules — ${wired.length} wired into the bundle, ${staged.length} unreachable`
    );
  }
}

// Run the CLI only when invoked directly, not when imported by the budget gate.
if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  main();
}
