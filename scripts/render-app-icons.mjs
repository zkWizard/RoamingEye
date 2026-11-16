/**
 * Rasterize the home-screen icons from the same globe mark as public/favicon.svg.
 *
 * The favicon is the globe emoji on a transparent square. Installed-app and
 * Apple touch icons need an opaque tile in the site background (#05070d),
 * so the emoji sits centered on that color. Commit the PNGs this writes;
 * the production build does not rerun it.
 *
 * Usage: node scripts/render-app-icons.mjs
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const targets = [
  { size: 512, out: "public/icons/icon-512.png" },
  { size: 192, out: "public/icons/icon-192.png" },
  { size: 180, out: "public/apple-touch-icon.png" },
];

const browser = await chromium.launch();
try {
  for (const { size, out } of targets) {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    });
    const font = Math.round(size * 0.62);
    await page.setContent(
      `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html,
      body {
        margin: 0;
        width: ${size}px;
        height: ${size}px;
        background: #05070d;
      }
      body {
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .mark {
        font-family: "Noto Color Emoji", sans-serif;
        font-size: ${font}px;
        line-height: 1;
      }
    </style>
  </head>
  <body>
    <div class="mark">🌍</div>
  </body>
</html>`,
      { waitUntil: "load" }
    );
    const path = join(root, out);
    mkdirSync(dirname(path), { recursive: true });
    await page.screenshot({
      path,
      clip: { x: 0, y: 0, width: size, height: size },
    });
    await page.close();
    console.log(`wrote ${out}`);
  }
} finally {
  await browser.close();
}
