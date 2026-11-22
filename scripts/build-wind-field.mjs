import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  GLOBAL_WIND_GRID,
  OPEN_METEO_BATCH,
  WIND_SCALE,
  encodeWindField,
  fillWindArrays,
  gridCoordinates,
  openMeteoCurrentUrl,
  parseOpenMeteoCurrentBody,
} from "../src/live/wind/field.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function chunks(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

let rateRemaining = 600;
let rateReset = 0;

async function waitForBudget(cost) {
  const now = Date.now() / 1000;
  if (rateRemaining >= cost) return;
  const waitMs = Math.max(1000, (rateReset - now) * 1000 + 750);
  console.log(
    `Open-Meteo budget ${rateRemaining}, waiting ${Math.ceil(waitMs / 1000)}s`
  );
  await sleep(waitMs);
  rateRemaining = 600;
}

function noteRateLimit(response, fallbackCost) {
  const remainingHeader = response.headers.get("x-ratelimit-remaining");
  const resetHeader = response.headers.get("x-ratelimit-reset");
  if (remainingHeader !== null && Number.isFinite(Number(remainingHeader))) {
    rateRemaining = Number(remainingHeader);
  } else {
    rateRemaining -= fallbackCost;
  }
  if (resetHeader !== null && Number.isFinite(Number(resetHeader))) {
    rateReset = Number(resetHeader);
  }
}

async function fetchBatch(fetchImpl, coords) {
  const url = openMeteoCurrentUrl(coords);
  let lastError = new Error("Open-Meteo request failed");
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      await waitForBudget(coords.length);
      const response = await fetchImpl(url);
      noteRateLimit(response, coords.length);
      if (response.status === 429) {
        throw new Error("Open-Meteo HTTP 429");
      }
      if (!response.ok) throw new Error(`Open-Meteo HTTP ${response.status}`);
      const places = parseOpenMeteoCurrentBody(await response.json());
      if (places.length !== coords.length) {
        throw new Error(
          `Open-Meteo returned ${places.length} of ${coords.length} rows`
        );
      }
      return places;
    } catch (err) {
      lastError = err instanceof Error ? err : lastError;
      const limited = lastError.message.includes("429");
      await sleep(limited ? 15000 * attempt : 500 * attempt);
    }
  }
  throw lastError;
}

/**
 * Fetch a global grid and encode it the same way the browser decodes it.
 * `fetchImpl` is injectable so tests can skip the network.
 */
export async function buildWindField(
  fetchImpl = fetch,
  grid = GLOBAL_WIND_GRID
) {
  const coords = gridCoordinates(grid);
  const places = [];
  const batches = chunks(coords, OPEN_METEO_BATCH);
  for (let i = 0; i < batches.length; i++) {
    places.push(...(await fetchBatch(fetchImpl, batches[i])));
    if (batches.length > 1) {
      console.log(
        `wind batch ${i + 1}/${batches.length} (${places.length} cells, budget ${rateRemaining})`
      );
    }
    if (i < batches.length - 1) await sleep(150);
  }
  const filled = fillWindArrays(grid, places);
  if (filled.missing > coords.length * 0.05) {
    throw new Error(
      `Wind field is missing ${filled.missing} of ${coords.length} cells`
    );
  }
  return encodeWindField(
    { ...grid, time: filled.time, source: "open-meteo", scale: WIND_SCALE },
    filled.u,
    filled.v,
    filled.t
  );
}

export async function writeWindField(
  directory = resolve(root, "public/data/wind")
) {
  const { header, buffer } = await buildWindField();
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, "latest.bin"), Buffer.from(buffer));
  writeFileSync(
    resolve(directory, "latest.json"),
    `${JSON.stringify(header, null, 2)}\n`
  );
  return header;
}

const invoked =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invoked) {
  const header = await writeWindField();
  console.log(
    `wind field ${header.time} ${header.nLat}x${header.nLon} -> public/data/wind/latest.bin`
  );
}
