/**
 * After `vite build`, confirm the search files landed at the root of dist/.
 *
 * GitHub Pages serves dist/ at https://roamingeye.org/ (Vite base defaults to
 * "/"; see vite.config.ts and scripts/deploy.mjs). Crawlers request
 * /robots.txt and /sitemap.xml on that host, and the manifest link is
 * /manifest.json, so those files have to be dist/robots.txt and friends,
 * not nested under a subpath.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  INDEXABLE_PAGES,
  SEO,
  SITE_ORIGIN,
  renderSitemap,
} from "./site-index.mjs";

const dist = join(process.cwd(), "dist");
const base = process.env.DEPLOY_BASE || "/";
let failed = false;

function fail(message) {
  console.error(`check-seo-output: ${message}`);
  failed = true;
}

if (base !== "/") {
  fail(
    `DEPLOY_BASE is ${base}. This site is served at the domain root, so the build base must be /.`
  );
}

const required = [
  "robots.txt",
  "sitemap.xml",
  "manifest.json",
  "apple-touch-icon.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "favicon.svg",
  "index.html",
];

for (const rel of required) {
  if (!existsSync(join(dist, rel))) fail(`missing dist/${rel}`);
}

const robots = existsSync(join(dist, "robots.txt"))
  ? readFileSync(join(dist, "robots.txt"), "utf8")
  : "";
if (!robots.includes("Allow: /")) fail("dist/robots.txt does not allow all");
if (!robots.includes(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`)) {
  fail("dist/robots.txt does not point at the sitemap");
}

const sitemap = existsSync(join(dist, "sitemap.xml"))
  ? readFileSync(join(dist, "sitemap.xml"), "utf8")
  : "";
if (sitemap !== renderSitemap(INDEXABLE_PAGES)) {
  fail("dist/sitemap.xml does not match INDEXABLE_PAGES");
}

const html = existsSync(join(dist, "index.html"))
  ? readFileSync(join(dist, "index.html"), "utf8")
  : "";

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasLink(rel, href) {
  const tag = /<link\b[^>]*>/g;
  const relRe = new RegExp(`\\brel=["']${escapeRegExp(rel)}["']`);
  const hrefRe = new RegExp(`\\bhref=["']${escapeRegExp(href)}["']`);
  return [...html.matchAll(tag)].some(
    (match) => relRe.test(match[0]) && hrefRe.test(match[0])
  );
}

if (!html.includes(`<title>${SEO.title}</title>`)) {
  fail("dist/index.html title does not match the search title");
}
if (!html.includes(SEO.description)) {
  fail("dist/index.html is missing the search description");
}
if (!hasLink("canonical", `${SITE_ORIGIN}/`)) {
  fail("dist/index.html is missing the canonical link");
}
if (!hasLink("manifest", "/manifest.json")) {
  fail("dist/index.html manifest link is not /manifest.json");
}
if (!hasLink("apple-touch-icon", "/apple-touch-icon.png")) {
  fail("dist/index.html is missing the apple touch icon");
}
if (!html.includes('type="application/ld+json"')) {
  fail("dist/index.html is missing JSON-LD");
}

if (existsSync(join(dist, "manifest.json"))) {
  const manifest = JSON.parse(
    readFileSync(join(dist, "manifest.json"), "utf8")
  );
  if (manifest.start_url !== "/" || manifest.display !== "standalone") {
    fail("dist/manifest.json start_url or display is wrong");
  }
  if (
    manifest.theme_color !== SEO.themeColor ||
    manifest.background_color !== SEO.backgroundColor
  ) {
    fail("dist/manifest.json colors do not match the site background");
  }
}

if (failed) process.exit(1);
console.log(
  "ok  dist root serves robots.txt, sitemap.xml, and manifest.json (base /)"
);
