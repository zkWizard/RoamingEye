// Regenerate the README demo GIF (docs/demo.gif): two years of monthly
// composites scrubbing past on the globe.
// Usage: start the dev server (npm run dev), then: node scripts/capture-demo.mjs
import { chromium } from "@playwright/test";
import gifenc from "gifenc";
const { GIFEncoder, quantize, applyPalette } = gifenc;
import { writeFileSync } from "node:fs";

const OUT = process.argv[2] ?? "docs/demo.gif";
const URL = process.env.DEMO_URL ?? "http://localhost:5173/";
// Capture at desktop size (so the globe dominates the layout), encode smaller.
const CAPTURE = { width: 1280, height: 720 };
const WIDTH = 720;
const HEIGHT = 405;
const MONTHS = 24; // two seasonal cycles
const DELAY_MS = 180; // per frame

const browser = await chromium.launch({
  args: [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const page = await browser.newPage({
  viewport: CAPTURE,
  deviceScaleFactor: 1,
});
await page.goto(URL);
await page.waitForFunction(() => window.__APP_READY__ === true, null, {
  timeout: 30_000,
});
await page.waitForSelector("#loader.is-hidden", { timeout: 30_000 });
// Let the preview prefetch warm so every scrub step lands instantly.
await page.waitForTimeout(10_000);

// Walk back from the latest month so the demo ends on fresh data, then
// screenshot one frame per month stepping forward.
const track = page.locator(".timeline__track");
await track.focus();
for (let i = 0; i < MONTHS; i++) await page.keyboard.press("ArrowLeft");
await page.waitForTimeout(1500);

const frames = [];
for (let i = 0; i <= MONTHS; i++) {
  await page.waitForTimeout(DELAY_MS + 120);
  frames.push(await page.screenshot({ type: "png" }));
  if (i < MONTHS) await page.keyboard.press("ArrowRight");
}

// Decode the PNGs to raw RGBA in the (already open) browser page — Node has
// no built-in image decoder, the browser does.
console.log(`captured ${frames.length} frames, encoding…`);
const gif = GIFEncoder();
for (const png of frames) {
  const b64 = await page.evaluate(
    async ({ data, width, height }) => {
      const res = await fetch(`data:image/png;base64,${data}`);
      const bitmap = await createImageBitmap(await res.blob());
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bitmap, 0, 0, width, height);
      const { data: rgba } = ctx.getImageData(0, 0, width, height);
      let out = "";
      const CHUNK = 0x8000;
      for (let i = 0; i < rgba.length; i += CHUNK) {
        out += String.fromCharCode(...rgba.subarray(i, i + CHUNK));
      }
      return btoa(out);
    },
    { data: png.toString("base64"), width: WIDTH, height: HEIGHT }
  );
  const rgba = new Uint8Array(Buffer.from(b64, "base64"));
  const palette = quantize(rgba, 256);
  const index = applyPalette(rgba, palette);
  gif.writeFrame(index, WIDTH, HEIGHT, { palette, delay: DELAY_MS });
}
gif.finish();

await browser.close();
const bytes = gif.bytes();
writeFileSync(OUT, bytes);
console.log(`wrote ${OUT} (${(bytes.length / 1024 / 1024).toFixed(2)} MB)`);
