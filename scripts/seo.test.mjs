import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import {
  INDEXABLE_PAGES,
  SEO,
  SITE_ORIGIN,
  renderSitemap,
} from "./site-index.mjs";

const EM_DASH = "\u2014";

function metaContents(html, attr, value) {
  const re = new RegExp(`<meta\\b[^>]*\\b${attr}=["']${value}["'][^>]*>`, "g");
  return [...html.matchAll(re)].map((match) => {
    const content = match[0].match(/\bcontent="([^"]*)"/);
    if (!content) throw new Error(`meta ${attr}=${value} has no content`);
    return content[1];
  });
}

function linkHrefs(html, rel) {
  const re = new RegExp(`<link\\b[^>]*\\brel=["']${rel}["'][^>]*>`, "g");
  return [...html.matchAll(re)].map((match) => {
    const href = match[0].match(/\bhref=["']([^"']*)["']/);
    if (!href) throw new Error(`link rel=${rel} has no href`);
    return href[1];
  });
}

function pngSize(buf) {
  expect(buf.toString("ascii", 12, 16)).toBe("IHDR");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

test("the search title is a plain sentence of about 50 to 60 characters", () => {
  expect(SEO.title.length).toBeGreaterThanOrEqual(50);
  expect(SEO.title.length).toBeLessThanOrEqual(60);
  expect(SEO.title).not.toContain(EM_DASH);
  expect(SEO.description).not.toContain(EM_DASH);
  expect(SEO.description.length).toBeGreaterThan(80);
  expect(SEO.description).toMatch(/NASA satellite data/);
  expect(SEO.description).toMatch(/3D globe/);
  expect(SEO.description).toMatch(/history/);
  expect(SEO.description).toMatch(/no account/);
  expect(SEO.description).toMatch(/Free/);
});

test("index.html head carries the title, description, canonical, and cards", () => {
  const html = readFileSync("index.html", "utf8");
  const title = html.match(/<title>([^<]*)<\/title>/)?.[1];
  expect(title).toBe(SEO.title);

  expect(metaContents(html, "name", "description")).toEqual([SEO.description]);
  expect(metaContents(html, "property", "og:title")).toEqual([SEO.title]);
  expect(metaContents(html, "property", "og:description")).toEqual([
    SEO.description,
  ]);
  expect(metaContents(html, "name", "twitter:title")).toEqual([SEO.title]);
  expect(metaContents(html, "name", "twitter:description")).toEqual([
    SEO.description,
  ]);
  expect(metaContents(html, "property", "og:image")).toEqual([
    `${SITE_ORIGIN}/social-card.jpg`,
  ]);
  expect(metaContents(html, "name", "twitter:image")).toEqual([
    `${SITE_ORIGIN}/social-card.jpg`,
  ]);
  expect(metaContents(html, "property", "og:url")).toEqual([`${SITE_ORIGIN}/`]);
  expect(metaContents(html, "name", "twitter:url")).toEqual([
    `${SITE_ORIGIN}/`,
  ]);
  expect(metaContents(html, "property", "og:type")).toEqual(["website"]);
  expect(metaContents(html, "name", "twitter:card")).toEqual([
    "summary_large_image",
  ]);

  expect(linkHrefs(html, "canonical")).toEqual([`${SITE_ORIGIN}/`]);
  expect(linkHrefs(html, "manifest")).toEqual(["/manifest.json"]);
  expect(linkHrefs(html, "apple-touch-icon")).toEqual([
    "/apple-touch-icon.png",
  ]);
  expect(linkHrefs(html, "icon")).toEqual(["/favicon.svg"]);

  // First-paint chrome color stays media-keyed. ThemeToggle collapses the
  // pair once the app knows the real theme.
  expect(html).toContain('name="theme-color"');
  expect(html).toContain(`content="${SEO.themeColor}"`);
  expect(html).toContain('content="#eaf0f8"');
  expect(html).toContain('media="(prefers-color-scheme: dark)"');
  expect(html).toContain('media="(prefers-color-scheme: light)"');

  const jsonLd = html.match(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/
  );
  expect(jsonLd, "JSON-LD block").toBeTruthy();
  const data = JSON.parse(jsonLd[1]);
  expect(data["@type"]).toBe("WebApplication");
  expect(data.name).toBe(SEO.name);
  expect(data.url).toBe(`${SITE_ORIGIN}/`);
  expect(data.description).toBe(SEO.description);
  expect(data.isAccessibleForFree).toBe(true);
  expect(data.offers).toMatchObject({ price: "0", priceCurrency: "USD" });
});

test("the manifest matches the site name, colors, and icons", () => {
  const manifest = JSON.parse(readFileSync("public/manifest.json", "utf8"));
  expect(manifest.name).toBe(SEO.name);
  expect(manifest.short_name).toBe(SEO.shortName);
  expect(manifest.description).toBe(SEO.description);
  expect(manifest.description).not.toContain(EM_DASH);
  expect(manifest.start_url).toBe("/");
  expect(manifest.scope).toBe("/");
  expect(manifest.display).toBe("standalone");
  expect(manifest.theme_color).toBe(SEO.themeColor);
  expect(manifest.background_color).toBe(SEO.backgroundColor);
  expect(manifest.icons.map((icon) => icon.src)).toEqual([
    "/favicon.svg",
    "/icons/icon-192.png",
    "/icons/icon-512.png",
    "/apple-touch-icon.png",
  ]);

  expect(pngSize(readFileSync("public/icons/icon-192.png"))).toEqual({
    width: 192,
    height: 192,
  });
  expect(pngSize(readFileSync("public/icons/icon-512.png"))).toEqual({
    width: 512,
    height: 512,
  });
  expect(pngSize(readFileSync("public/apple-touch-icon.png"))).toEqual({
    width: 180,
    height: 180,
  });
});

test("robots.txt allows every crawler and points at the sitemap", () => {
  const robots = readFileSync("public/robots.txt", "utf8");
  expect(robots).toContain("User-agent: *");
  expect(robots).toContain("Allow: /");
  expect(robots).not.toMatch(/Disallow:\s*\S/);
  expect(robots).toContain(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`);
  expect(robots.endsWith("\n")).toBe(true);
});

test("the committed sitemap lists today's canonical URLs", () => {
  const xml = renderSitemap(INDEXABLE_PAGES);
  expect(readFileSync("public/sitemap.xml", "utf8")).toBe(xml);
  expect(xml).toContain(`<loc>${SITE_ORIGIN}/</loc>`);
  expect(INDEXABLE_PAGES.map((page) => page.path)).toEqual(["/"]);
});

test("a future story page is one entry in the sitemap list", () => {
  const xml = renderSitemap([
    ...INDEXABLE_PAGES,
    {
      path: "/houston-vs-austin-rainfall",
      changefreq: "monthly",
      priority: "0.6",
    },
  ]);
  expect(xml).toContain(`<loc>${SITE_ORIGIN}/</loc>`);
  expect(xml).toContain(`<loc>${SITE_ORIGIN}/houston-vs-austin-rainfall</loc>`);
  expect(xml).toContain("<changefreq>monthly</changefreq>");
  expect(xml).toContain("<priority>0.6</priority>");
});

test("sitemap paths stay canonical", () => {
  const home = INDEXABLE_PAGES[0];
  expect(() => renderSitemap([{ ...home, path: "houston" }])).toThrow(
    /start with \//
  );
  expect(() =>
    renderSitemap([{ ...home, path: "/houston-vs-austin-rainfall/" }])
  ).toThrow(/trailing slash/);
  expect(() => renderSitemap([{ ...home, path: "/houston?x=1" }])).toThrow(
    /bare path/
  );
  expect(() => renderSitemap([home, { ...home }])).toThrow(/Duplicate/);
  expect(() => renderSitemap([{ ...home, priority: "2" }])).toThrow(/priority/);
  const escaped = renderSitemap([
    { path: "/rain&snow", changefreq: "yearly", priority: "0.5" },
  ]);
  expect(escaped).toContain(`<loc>${SITE_ORIGIN}/rain&amp;snow</loc>`);
  expect(escaped).not.toContain(`<loc>${SITE_ORIGIN}/rain&snow</loc>`);
});
