/**
 * Downloads and slims the static map-overlay datasets into public/data/.
 *
 * Sources: Natural Earth (public domain) via the natural-earth-vector mirror.
 *  - Country boundaries (admin-0, 1:110m)
 *  - Populated places (1:110m)
 *
 * Run with: node scripts/prepare-data.mjs
 * The slimmed outputs are committed so the app needs no network for overlays.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "data");
const BASE =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson";

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} fetching ${url}`);
  return res.json();
}

async function main() {
  mkdirSync(OUT, { recursive: true });

  // --- Country borders: keep only the name + geometry ----------------------
  console.log("Fetching country borders…");
  const countries = await getJson(`${BASE}/ne_110m_admin_0_countries.geojson`);
  const slimCountries = {
    type: "FeatureCollection",
    features: countries.features
      .filter((f) => f.properties?.NAME && f.geometry)
      .map((f) => ({
        type: "Feature",
        properties: { name: f.properties.NAME },
        geometry: f.geometry,
      })),
  };
  writeFileSync(join(OUT, "countries.geojson"), JSON.stringify(slimCountries));
  console.log(
    `  → countries.geojson (${slimCountries.features.length} features)`
  );

  // --- Populated places: compact array sorted by population ----------------
  console.log("Fetching populated places…");
  const places = await getJson(
    `${BASE}/ne_110m_populated_places_simple.geojson`
  );
  const cities = places.features
    .map((f) => {
      const p = f.properties ?? {};
      const [lon, lat] = f.geometry?.coordinates ?? [p.longitude, p.latitude];
      return {
        name: p.name,
        lat: Number(lat.toFixed(4)),
        lon: Number(lon.toFixed(4)),
        country: p.adm0name ?? null,
        pop: p.pop_max ?? null,
        capital: Boolean(p.adm0cap),
      };
    })
    .filter((c) => c.name && Number.isFinite(c.lat) && Number.isFinite(c.lon))
    .sort((a, b) => (b.pop ?? 0) - (a.pop ?? 0));
  writeFileSync(join(OUT, "cities.json"), JSON.stringify(cities));
  console.log(`  → cities.json (${cities.length} cities)`);

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
