import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
import { bibtexDataset, cslDataset, risDataset, textDataset } from "./citation";
import { dataAvailabilityClause } from "./dataAvailability";
import { DOI_RESOLVER, doiResolverUrl } from "./doiLink";
import type { DatasetRef } from "./timeline";

/**
 * Drift guard for DOI resolver-link construction.
 *
 * A DOI name is an opaque string whose suffix may legally carry characters a URL
 * parser would otherwise swallow — a bare "#" starts a fragment, "?" a query, an
 * unescaped "%" an invalid escape (Crossref DOI display guidance). `doiResolverUrl`
 * (lib/doiLink.ts) percent-encodes those while preserving the DOI's structural "/"
 * separators, and is the one place a resolver link is built from a runtime DOI.
 *
 * That invariant was documented but unenforced, and eight call sites had drifted
 * off it: the CSL-JSON export, the data-availability statement, the probe CSV's
 * `# data_doi` header, the layer legend and providers-page source links, and the
 * land-cover, snow-cover, and standardized-anomaly narrative credits each rebuilt
 * `https://doi.org/` + doi by hand (the DAS carried its own second copy of the
 * resolver prefix, so the base itself was declared twice).
 *
 * Every citation audit that does exist checks the *inputs* — `auditDatasetCitation`
 * the ref's fields and DOI shape, `auditCitationConsistency` cross-ref agreement,
 * `auditCitationCffConsistency` the tool metadata — so none of them can see a
 * defect in the *emitted* link, which is the last mile between validated
 * provenance and what a reader clicks or pastes into a manuscript.
 *
 * This is a source-text guard in the spirit of `citing-docs.test.ts`: a hand-built
 * link cannot be caught by type-checking or by exercising today's catalog (every
 * NASA DOI we currently cite happens to be URL-safe, so a bypass is silent until
 * a re-point introduces one). Metadata integrity only — nothing here dereferences
 * a DOI over the network (that stays the weekly citation contract's job) or makes
 * any claim about the values a source reports.
 */

const SRC = fileURLToPath(new URL("..", import.meta.url));

/** Every non-test TypeScript source file the app ships, repo-relative. */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts"))
      out.push(full);
  }
  return out;
}

/**
 * Strip block and line comments before scanning. The prose in doiLink.ts
 * necessarily *names* the pattern it forbids; only real code should be judged.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const FILES = sourceFiles(SRC);

describe("DOI resolver links are built in one place", () => {
  it("finds the sources to scan", () => {
    // A broken walk would make every check below vacuously pass.
    expect(FILES.length).toBeGreaterThan(100);
  });

  it("never interpolates a runtime DOI into a resolver URL by hand", () => {
    const offenders = FILES.filter((file) =>
      /https:\/\/doi\.org\/\$\{/.test(stripComments(readFileSync(file, "utf8")))
    ).map((file) => relative(SRC, file).replace(/\\/g, "/"));

    expect(
      offenders,
      `build the link with doiResolverUrl(doi) from lib/doiLink.ts instead: ${offenders.join(", ")}`
    ).toEqual([]);
  });

  it("declares the resolver base exactly once", () => {
    // A second copy of the prefix is how a call site starts building its own
    // link; it also lets the two definitions drift if the proxy ever moves.
    const declaring = FILES.filter((file) =>
      stripComments(readFileSync(file, "utf8")).includes('"https://doi.org/"')
    ).map((file) => relative(SRC, file).replace(/\\/g, "/"));

    expect(declaring).toEqual(["lib/doiLink.ts"]);
  });
});

/**
 * A DOI whose suffix carries characters that are legal in a DOI name but unsafe
 * in a URL. Not a real DOI — it is the shape the encoder exists to survive.
 */
const HOSTILE: DatasetRef = {
  title: "Hostile Suffix Test Product",
  shortName: "HOSTILE",
  version: "1",
  doi: "10.5067/A#B C%D",
};

describe("every emitted citation link survives an unsafe DOI suffix", () => {
  const expected = doiResolverUrl(HOSTILE.doi);

  it("percent-encodes the unsafe characters and keeps the separator", () => {
    expect(expected).toBe(`${DOI_RESOLVER}10.5067/A%23B%20C%25D`);
  });

  it.each([
    ["BibTeX", () => bibtexDataset(HOSTILE)],
    ["RIS", () => risDataset(HOSTILE)],
    ["formatted text", () => textDataset(HOSTILE)],
    ["data availability statement", () => dataAvailabilityClause(HOSTILE)],
  ])("%s carries the encoded link", (_format, emit) => {
    expect(emit()).toContain(expected);
  });

  it("CSL-JSON pairs the encoded URL with the bare DOI variable", () => {
    const item = cslDataset(HOSTILE);
    // CSL specifies `DOI` as the bare DOI name, so only `URL` is encoded —
    // a consumer that rebuilds the link from `DOI` must do its own encoding.
    expect(item.URL).toBe(expected);
    expect(item.DOI).toBe(HOSTILE.doi);
  });
});
