/**
 * Build the bundled event index (public/data/events.json).
 *
 *   node scripts/build-events-index.mjs
 *
 * Keyless sources, all fetched at build time so the app never needs them live:
 * - NASA EONET v3 (CORS *, thin before ~2012). Named storms, droughts, snow,
 *   dust, eruptions, and named wildfires. The GDACS "Wildfire in {place} {id}"
 *   firehose is dropped — those titles are not something a person searches.
 * - USGS FDSN, magnitude 7.5 and up, for the earthquake history EONET barely
 *   has.
 * - The stories in src/lib/stories.ts, so "Black Summer" plays the story.
 *
 * Re-run when a story is added. src/lib/events.test.ts fails if a story id is
 * missing from the file, or if a category's layer disagrees with the map.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public/data/events.json");
const UA = "RoamingEye-build/1.1 (https://github.com/zkWizard/RoamingEye)";

/** Category id stored on each event, and the layer the app should open. */
const LAYER_BY_CATEGORY = {
  wildfire: "aerosol",
  storm: "precip",
  drought: "ndvi",
  snow: "snow",
  volcano: "aerosol",
  earthquake: "terrain",
  dust: "aerosol",
  monsoon: "ndvi",
};

const STORY_CATEGORY = {
  "canada-smoke-2023": "wildfire",
  "amazon-burning-season-2020": "wildfire",
  "saharan-dust-2020": "dust",
  "black-summer-2019": "wildfire",
  "sahel-monsoon-2024": "monsoon",
  "northern-snow-2023": "snow",
};

const EONET = "https://eonet.gsfc.nasa.gov/api/v3/events";
const USGS = "https://earthquake.usgs.gov/fdsnws/event/1/query";
const GENERIC_FIRE = /^wildfire in .+\s\d{4,}$/i;
const UNNAMED_STORM = /#\s*\d|\bunnamed\b/i;
// InciWeb's daily firehose (prescribed burns, incident codes, "Bear Wildfire,
// Catron, New Mexico") is not something a person searches by name. Named
// events keep the "Camp Fire, California" shape.
const PRESCRIBED_FIRE =
  /prescribed|\bRX\b|emergency stabilization|\bBAER\b|green forest fire notification/i;
const CODED_FIRE = /^wildfire [A-Z]{2,4}-/i;
const INCIDENT_DUMP = /\bWildfire, [A-Z][^,]+, [A-Z]/;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Successful responses, so a 429 mid-run does not repeat the hours already fetched. */
const CACHE = "/tmp/roamingeye-events-cache";
mkdirSync(CACHE, { recursive: true });

function cacheFile(url) {
  return join(CACHE, `${createHash("sha1").update(url).digest("hex")}.json`);
}

async function getJson(url) {
  const file = cacheFile(url);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  let wait = 2000;
  for (let attempt = 1; attempt <= 8; attempt++) {
    const response = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
    });
    if (response.status === 429 || response.status >= 500) {
      console.warn(
        `  ${response.status} on attempt ${attempt}, waiting ${wait}ms`
      );
      await sleep(wait);
      wait = Math.min(wait * 2, 30000);
      continue;
    }
    if (!response.ok) throw new Error(`${response.status} for ${url}`);
    const data = await response.json();
    writeFileSync(file, JSON.stringify(data));
    await sleep(600);
    return data;
  }
  throw new Error(`gave up after retries: ${url}`);
}

function round4(n) {
  return Math.round(n * 10000) / 10000;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function yearMonth(iso) {
  const match = /^(\d{4})-(\d{2})/.exec(iso ?? "");
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return undefined;
  return { year, month };
}

function ymKey(ym) {
  return ym.year * 12 + (ym.month - 1);
}

/** Points as [lon, lat], plus the ISO dates that rode on them. */
function collectPoints(geometry) {
  const points = [];
  const dates = [];
  const walk = (coords) => {
    if (!Array.isArray(coords)) return;
    if (
      typeof coords[0] === "number" &&
      typeof coords[1] === "number" &&
      Number.isFinite(coords[0]) &&
      Number.isFinite(coords[1]) &&
      Math.abs(coords[0]) <= 180 &&
      Math.abs(coords[1]) <= 90
    ) {
      points.push([coords[0], coords[1]]);
      return;
    }
    for (const child of coords) walk(child);
  };
  for (const item of geometry ?? []) {
    if (item?.date) dates.push(item.date);
    if (item?.type === "Point") walk(item.coordinates);
    else if (item?.type === "Polygon" || item?.type === "MultiPolygon") {
      walk(item.coordinates);
    }
  }
  return { points, dates };
}

/**
 * A representative point and, when the points fit in one hemisphere of
 * longitude, their box in Nominatim order [south, north, west, east].
 */
function summarize(points) {
  const lats = points.map((p) => p[1]);
  const lons = points.map((p) => p[0]);
  const lat = median(lats);
  const lon = median(lons);
  let west = Math.min(...lons);
  let east = Math.max(...lons);
  if (east - west > 180) {
    const shifted = lons.map((value) => (value < 0 ? value + 360 : value));
    const shiftedWest = Math.min(...shifted);
    const shiftedEast = Math.max(...shifted);
    if (shiftedEast - shiftedWest > 180) {
      return { lat: round4(lat), lon: round4(lon) };
    }
    west = shiftedWest > 180 ? shiftedWest - 360 : shiftedWest;
    east = shiftedEast > 180 ? shiftedEast - 360 : shiftedEast;
  }
  const south = Math.min(...lats);
  const north = Math.max(...lats);
  if (north - south < 0.05 && Math.abs(east - west) < 0.05) {
    return { lat: round4(lat), lon: round4(lon) };
  }
  return {
    lat: round4(lat),
    lon: round4(lon),
    bbox: [round4(south), round4(north), round4(west), round4(east)],
  };
}

function aliasesFor(name, year) {
  const lower = name.toLowerCase().replace(/\s+/g, " ").trim();
  const values = new Set([lower, `${lower} ${year}`]);
  const stripped = lower
    .replace(
      /^(hurricane|tropical storm|tropical cyclone|super typhoon|typhoon|cyclone|severe tropical storm)\s+/,
      ""
    )
    .replace(/\s+volcano$/, "");
  if (stripped !== lower) {
    values.add(stripped);
    values.add(`${stripped} ${year}`);
  }
  const head = lower
    .split(",")[0]
    .replace(/\s+volcano$/, "")
    .trim();
  if (head && head !== lower && head.length >= 3) {
    values.add(head);
    values.add(`${head} ${year}`);
  }
  return [...values].filter((alias) => alias.length >= 3);
}

function makeEvent(raw) {
  const where = summarize(raw.points);
  const from = raw.from;
  const to = raw.to;
  const month = raw.month ?? from;
  const name = raw.name.includes(String(from.year))
    ? raw.name
    : `${raw.name} (${from.year})`;
  const event = {
    id: raw.id,
    name,
    aliases: aliasesFor(name, from.year),
    category: raw.category,
    lat: where.lat,
    lon: where.lon,
    from,
    to,
    month,
    layer: LAYER_BY_CATEGORY[raw.category],
  };
  if (where.bbox) event.bbox = where.bbox;
  if (raw.storyId) event.storyId = raw.storyId;
  return event;
}

async function eonetWindow(category, start, end) {
  const params = new URLSearchParams({
    category,
    status: "all",
    start,
    end,
    limit: "1000",
  });
  const data = await getJson(`${EONET}?${params}`);
  return data.events ?? [];
}

/**
 * One window. EONET caps a response at 1000 and has no offset, so a full
 * window is split in half and the halves are fetched again. Events on the
 * shared boundary day come back twice; callers dedupe by id.
 */
async function eonetRange(category, start, end) {
  const batch = await eonetWindow(category, start, end);
  const span = Date.parse(end) - Date.parse(start);
  if (batch.length >= 1000 && span > 2 * 24 * 60 * 60 * 1000) {
    const mid = new Date(Date.parse(start) + span / 2)
      .toISOString()
      .slice(0, 10);
    console.warn(
      `  ${category} ${start}..${end} hit 1000; splitting at ${mid}`
    );
    const left = await eonetRange(category, start, mid);
    const right = await eonetRange(category, mid, end);
    return [...left, ...right];
  }
  if (batch.length >= 1000) {
    console.warn(`  ${category} ${start}..${end} still at the 1000 cap`);
  }
  return batch;
}

async function eonetYears(category, first, last) {
  const events = [];
  for (let year = first; year <= last; year++) {
    const batch = await eonetRange(
      category,
      `${year}-01-01`,
      `${year + 1}-01-01`
    );
    events.push(...batch);
    process.stdout.write(`  ${category} ${year}: ${batch.length}\n`);
  }
  const byId = new Map(events.map((item) => [item.id, item]));
  return [...byId.values()];
}

function decodeEntities(value) {
  return value
    .replace(/&#0*39;|&#x0*27;|&apos;/gi, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"');
}

function keepWildfire(title) {
  if (GENERIC_FIRE.test(title)) return false;
  if (PRESCRIBED_FIRE.test(title)) return false;
  if (CODED_FIRE.test(title)) return false;
  if (INCIDENT_DUMP.test(title)) return false;
  return true;
}

/**
 * EONET has no event for the 2018 lower East Rift eruption. The point is
 * Leilani Estates, where the lava reached the ocean; May–August 2018.
 */
const CURATED = [
  {
    id: "curated:kilauea-2018",
    name: "Kilauea",
    category: "volcano",
    points: [[-154.92, 19.47]],
    from: { year: 2018, month: 5 },
    to: { year: 2018, month: 8 },
    month: { year: 2018, month: 5 },
  },
];

function eonetRecord(item, category) {
  const title = decodeEntities(item.title.replace(/\s+/g, " ").trim());
  if (category === "wildfire" && !keepWildfire(title)) return undefined;
  if (category === "storm" && UNNAMED_STORM.test(title)) return undefined;
  const { points, dates } = collectPoints(item.geometry);
  if (points.length === 0) return undefined;
  const months = dates.map(yearMonth).filter(Boolean);
  if (months.length === 0) return undefined;
  months.sort((a, b) => ymKey(a) - ymKey(b));
  const from = months[0];
  const to = months[months.length - 1];
  const month = months[Math.floor(months.length / 2)];
  return {
    id: item.id,
    name: title,
    category,
    points,
    from,
    to,
    month,
  };
}

function dedupe(records) {
  const byKey = new Map();
  for (const record of records) {
    const key = `${record.category}|${record.name.toLowerCase()}|${record.from.year}`;
    const prev = byKey.get(key);
    if (!prev || record.points.length > prev.points.length)
      byKey.set(key, record);
  }
  return [...byKey.values()];
}

function readStories() {
  const text = readFileSync(join(ROOT, "src/lib/stories.ts"), "utf8");
  const pattern =
    /\{\s*id:\s*"([^"]+)"[\s\S]*?title:\s*"([^"]+)"[\s\S]*?layer:\s*"([^"]+)"[\s\S]*?from:\s*\{\s*year:\s*(\d+),\s*month:\s*(\d+)\s*\}[\s\S]*?to:\s*\{\s*year:\s*(\d+),\s*month:\s*(\d+)\s*\}[\s\S]*?camera:\s*\{\s*lat:\s*(-?\d+(?:\.\d+)?),\s*lon:\s*(-?\d+(?:\.\d+)?)/g;
  const stories = [...text.matchAll(pattern)].map((match) => ({
    id: match[1],
    title: match[2],
    from: { year: Number(match[4]), month: Number(match[5]) },
    to: { year: Number(match[6]), month: Number(match[7]) },
    lat: Number(match[8]),
    lon: Number(match[9]),
  }));
  if (stories.length < 6) {
    throw new Error(`expected the curated stories, parsed ${stories.length}`);
  }
  return stories;
}

function storyRecords() {
  return readStories().map((story) => {
    const category = STORY_CATEGORY[story.id];
    if (!category) throw new Error(`no event category for story ${story.id}`);
    return {
      id: `story:${story.id}`,
      name: story.title,
      category,
      points: [[story.lon, story.lat]],
      from: story.from,
      to: story.to,
      month: story.from,
      storyId: story.id,
    };
  });
}

async function earthquakes() {
  const params = new URLSearchParams({
    format: "geojson",
    eventtype: "earthquake",
    starttime: "1980-01-01",
    minmagnitude: "7.5",
    orderby: "magnitude",
    limit: "200",
  });
  const data = await getJson(`${USGS}?${params}`);
  const records = [];
  for (const feature of data.features ?? []) {
    const coords = feature.geometry?.coordinates;
    const place = feature.properties?.place;
    const when = feature.properties?.time;
    if (!Array.isArray(coords) || !place || !when) continue;
    const [lon, lat] = coords;
    const date = new Date(when);
    if (Number.isNaN(date.getTime())) continue;
    const month = {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
    };
    const mag = feature.properties.mag;
    const name = mag ? `M${Number(mag).toFixed(1)} ${place}` : place;
    records.push({
      id: `usgs:${feature.id}`,
      name,
      category: "earthquake",
      points: [[lon, lat]],
      from: month,
      to: month,
      month,
    });
  }
  return records;
}

async function main() {
  console.log("EONET named storms, 2000–2026");
  const storms = dedupe(
    (await eonetYears("severeStorms", 2000, 2026))
      .map((item) => eonetRecord(item, "storm"))
      .filter(Boolean)
  );
  console.log("EONET drought, snow, dust");
  const themed = [];
  for (const [eonetCategory, category] of [
    ["drought", "drought"],
    ["snow", "snow"],
    ["dustHaze", "dust"],
  ]) {
    const batch = await eonetWindow(eonetCategory, "1980-01-01", "2027-01-01");
    console.log(`  ${eonetCategory}: ${batch.length}`);
    themed.push(
      ...dedupe(
        batch.map((item) => eonetRecord(item, category)).filter(Boolean)
      )
    );
    await sleep(150);
  }
  console.log("EONET volcanoes, 1980–2026");
  const volcanoes = dedupe(
    (await eonetYears("volcanoes", 1980, 2026))
      .map((item) => eonetRecord(item, "volcano"))
      .filter(Boolean)
  );
  console.log("EONET named wildfires, 2000–2026");
  const fires = dedupe(
    (await eonetYears("wildfires", 2000, 2026))
      .map((item) => eonetRecord(item, "wildfire"))
      .filter(Boolean)
  );
  console.log("USGS earthquakes ≥ M7.5");
  const quakes = await earthquakes();
  console.log(`  quakes: ${quakes.length}`);
  const stories = storyRecords();

  const events = [
    ...stories,
    ...CURATED,
    ...storms,
    ...fires,
    ...themed,
    ...volcanoes,
    ...quakes,
  ].map(makeEvent);
  // One EONET id can sit in two categories (a blizzard is both a storm and
  // snow). Keep the category whose layer shows the event.
  const rank = {
    snow: 5,
    drought: 4,
    wildfire: 4,
    volcano: 4,
    dust: 3,
    monsoon: 3,
    storm: 2,
    earthquake: 1,
  };
  const byId = new Map();
  for (const event of events) {
    const prev = byId.get(event.id);
    if (!prev || (rank[event.category] ?? 0) > (rank[prev.category] ?? 0)) {
      byId.set(event.id, event);
    }
  }
  const unique = [...byId.values()].sort(
    (a, b) => ymKey(b.month) - ymKey(a.month) || a.name.localeCompare(b.name)
  );

  const file = {
    version: 1,
    generated: new Date().toISOString().slice(0, 10),
    sources: [
      {
        id: "eonet",
        title: "NASA Earth Observatory Natural Event Tracker v3",
        url: "https://eonet.gsfc.nasa.gov/api/v3/events",
      },
      {
        id: "usgs",
        title: "USGS earthquake catalog, magnitude 7.5 and above since 1980",
        url: "https://earthquake.usgs.gov/fdsnws/event/1/query",
      },
      {
        id: "stories",
        title: "RoamingEye curated stories",
        url: "src/lib/stories.ts",
      },
    ],
    events: unique,
  };
  writeFileSync(OUT, `${JSON.stringify(file)}\n`);
  const counts = {};
  for (const event of unique)
    counts[event.category] = (counts[event.category] ?? 0) + 1;
  console.log(`wrote ${unique.length} events to ${OUT}`);
  console.log(counts);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
