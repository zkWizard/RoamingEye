/**
 * Rewrite public/sitemap.xml from scripts/site-index.mjs.
 *
 * Usage: node scripts/write-sitemap.mjs
 *
 * The production build runs this before Vite copies public/ into dist/, so
 * the file GitHub Pages serves at /sitemap.xml matches INDEXABLE_PAGES.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { INDEXABLE_PAGES, renderSitemap } from "./site-index.mjs";

const out = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "public",
  "sitemap.xml"
);
const xml = renderSitemap(INDEXABLE_PAGES);
writeFileSync(out, xml);
console.log(`wrote ${out} (${INDEXABLE_PAGES.length} url)`);
