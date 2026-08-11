import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";

/**
 * Drift guard for the reviewability of the source itself.
 *
 * A single raw U+0000 byte had been committed into a template literal in
 * environmentBrief.ts, where the neighbouring line spells the same separator
 * as the `\0` escape. The two forms build an identical string, so nothing
 * misbehaved at runtime and no test could see it — but grep and ripgrep
 * classify any file containing a NUL as binary and print "Binary file ...
 * matches" INSTEAD OF the matching line. The project's central provenance
 * module was therefore silently invisible to every content search over src/,
 * which is how the byte survived so long.
 *
 * This is a provenance concern, not merely a style one: source that cannot be
 * searched or reviewed is source whose citations and uncertainty handling
 * cannot be audited. The guard asserts only the two properties that actually
 * cause that harm — decodable UTF-8, and no stray C0 control characters — so
 * it stays cheap and carries no opinion about formatting (Prettier owns that).
 */

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** Reviewed source trees. Build output and dependencies are not ours to police. */
const SCANNED_DIRS = ["src", "contract"];

const SOURCE_EXTENSIONS = [".ts", ".mjs", ".js"];

/**
 * The C0 controls that legitimately appear in source: tab, line feed, and
 * carriage return. Every other control character is either invisible in a
 * diff or actively breaks text tooling.
 */
const ALLOWED_CONTROLS = new Set([0x09, 0x0a, 0x0d]);

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      found.push(...sourceFiles(path));
    } else if (SOURCE_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
      found.push(path);
    }
  }
  return found;
}

const FILES = SCANNED_DIRS.flatMap(sourceFiles);

describe("committed source stays readable to text tooling", () => {
  it("scans a non-empty set of source files", () => {
    // Guards the guard: a broken walk would otherwise pass by finding nothing.
    expect(FILES.length).toBeGreaterThan(100);
  });

  it("carries no NUL or other stray control character", () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      const bytes = readFileSync(join(ROOT, file));
      for (let i = 0; i < bytes.length; i++) {
        const byte = bytes[i];
        if (byte < 0x20 && !ALLOWED_CONTROLS.has(byte)) {
          offenders.push(
            `${relative(".", file)} byte ${i}: 0x${byte.toString(16).padStart(2, "0")}`
          );
          break;
        }
      }
    }
    expect(
      offenders,
      `control characters make grep treat these files as binary and suppress their contents; write the escape (e.g. \\0) instead of the raw byte:\n${offenders.join("\n")}`
    ).toEqual([]);
  });

  it("decodes as valid UTF-8", () => {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    const offenders: string[] = [];
    for (const file of FILES) {
      try {
        decoder.decode(readFileSync(join(ROOT, file)));
      } catch {
        offenders.push(relative(".", file));
      }
    }
    expect(
      offenders,
      `these files are not valid UTF-8 (a mojibaked rewrite is the usual cause):\n${offenders.join("\n")}`
    ).toEqual([]);
  });
});
