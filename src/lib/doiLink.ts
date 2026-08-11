/**
 * The one place a `https://doi.org/…` resolver link is built from a DOI name.
 *
 * This lives apart from citation.ts on purpose. Resolver links are emitted from
 * all over the app — the citation and data-availability exports, the probe CSV
 * header, the layer legend and providers-page source links, several narrative
 * source credits — and citation.ts pulls in the whole provider catalog to build
 * its bundles. A leaf module with no imports lets every one of those call sites
 * share this encoder without dragging the catalog into their chunk.
 *
 * citation.ts re-exports both symbols, so existing citation-side callers are
 * unaffected.
 */

/** The DOI proxy every resolvable citation link is built on. */
export const DOI_RESOLVER = "https://doi.org/";

/**
 * Characters that must be percent-encoded when a DOI name is placed in a URL,
 * per Crossref's DOI display guidance. A DOI name is an opaque string that may
 * legally contain characters a URL parser would otherwise swallow — a bare "#"
 * starts a fragment, "?" a query, an unescaped "%" an invalid escape — so a
 * copied resolver link built by naive interpolation could silently point
 * somewhere other than the dataset. The DOI's own "/" separators are structural
 * and are deliberately left intact; only these unsafe characters are escaped.
 *
 * "%" maps first in the table (and is listed first in the character class) so an
 * existing percent sign becomes "%25" rather than being read as the prefix of an
 * escape we just introduced.
 */
const DOI_URL_ESCAPES: Record<string, string> = {
  "%": "%25",
  '"': "%22",
  "#": "%23",
  "?": "%3F",
  " ": "%20",
  "<": "%3C",
  ">": "%3E",
  "{": "%7B",
  "}": "%7D",
  "^": "%5E",
  "`": "%60",
  "|": "%7C",
  "\\": "%5C",
};

/**
 * Build the resolvable `https://doi.org/<doi>` link for a DOI name, percent-
 * encoding the URL-unsafe characters the DOI suffix may carry while preserving
 * its structural "/" separators. Every emitted resolver link routes through
 * here — the citation formats (BibTeX, RIS, text, CSL-JSON), the data-
 * availability statement, the probe CSV's `# data_doi` header, the legend and
 * providers-page source links, and every narrative source credit — so each
 * emits a link that resolves rather than one that breaks on a "#" or a stray
 * space. `doiLinkConstruction.test.ts` holds that line: it re-scans the source
 * for any resolver link rebuilt by hand from a runtime DOI, which is how those
 * eight call sites each drifted off this encoder before.
 *
 * It performs no network dereference and asserts nothing about the DOI's
 * resolvability — only that the string is safe to embed in a URL. The DOI is
 * trimmed first; a caller holding a possibly-absent DOI should guard emptiness
 * before calling (an empty input yields the bare resolver base).
 */
export function doiResolverUrl(doi: string): string {
  const encoded = doi
    .trim()
    .replace(/[%"#?<>{}^`|\\ ]/g, (char) => DOI_URL_ESCAPES[char]);
  return `${DOI_RESOLVER}${encoded}`;
}
