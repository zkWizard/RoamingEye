/**
 * Canonical URLs and the search copy for https://roamingeye.org.
 *
 * The shipped app is one page. When a story gets its own indexable URL, add
 * an entry to INDEXABLE_PAGES (and serve a real 200 at that path). Example:
 *
 *   { path: "/houston-vs-austin-rainfall", changefreq: "monthly", priority: "0.6" }
 *
 * scripts/write-sitemap.mjs rewrites public/sitemap.xml from this list.
 * index.html and public/manifest.json repeat the title and description by
 * hand; scripts/seo.test.mjs fails if they drift.
 */

export const SITE_ORIGIN = "https://roamingeye.org";

export const SEO = {
  title: "RoamingEye: scrub decades of NASA data on a 3D globe",
  description:
    "Scrub decades of NASA satellite data on a 3D globe. Click anywhere to see that place's history. Free, and no account needed.",
  name: "RoamingEye",
  shortName: "RoamingEye",
  themeColor: "#05070d",
  backgroundColor: "#05070d",
};

const CHANGE_FREQ = new Set([
  "always",
  "hourly",
  "daily",
  "weekly",
  "monthly",
  "yearly",
  "never",
]);

/** @type {{ path: string, changefreq: string, priority: string }[]} */
export const INDEXABLE_PAGES = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
];

function xmlEscape(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/**
 * @param {{ path: string, changefreq: string, priority: string }[]} pages
 * @returns {string}
 */
export function renderSitemap(pages) {
  if (!pages.length) throw new Error("Sitemap needs at least one page");
  const seen = new Set();
  const urls = pages.map((page) => {
    if (typeof page.path !== "string" || !page.path.startsWith("/")) {
      throw new Error(`Sitemap path must start with /: ${String(page.path)}`);
    }
    if (page.path !== "/" && page.path.endsWith("/")) {
      throw new Error(
        `Sitemap path must not have a trailing slash: ${page.path}`
      );
    }
    if (/[?#\s]/.test(page.path)) {
      throw new Error(`Sitemap path must be a bare path: ${page.path}`);
    }
    if (!CHANGE_FREQ.has(page.changefreq)) {
      throw new Error(`Bad changefreq for ${page.path}: ${page.changefreq}`);
    }
    if (!/^(?:0\.[0-9]|1\.0)$/.test(page.priority)) {
      throw new Error(`Bad priority for ${page.path}: ${page.priority}`);
    }
    if (seen.has(page.path)) {
      throw new Error(`Duplicate sitemap path: ${page.path}`);
    }
    seen.add(page.path);
    const loc = xmlEscape(`${SITE_ORIGIN}${page.path}`);
    return `  <url>
    <loc>${loc}</loc>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>
`;
}
