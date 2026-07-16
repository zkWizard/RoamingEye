/**
 * Downloads and slims the static map-overlay datasets into public/data/.
 *
 * Sources:
 *  - Natural Earth (public domain) via the natural-earth-vector mirror:
 *    country boundaries (admin-0, 1:110m) and populated places (1:110m).
 *  - Plate boundaries: Bird (2003) "An updated digital model of plate
 *    boundaries", via the fraxen/tectonicplates GeoJSON digitization (ODC-By).
 *  - Holocene volcanoes: Smithsonian Global Volcanism Program (VOTW) WFS.
 *
 * Run with: node scripts/prepare-data.mjs [dataset]
 * (dataset = countries | cities | plates | volcanoes | admin1; omit for all.)
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

/**
 * Snap a polygonal geometry's linework to a `step`-degree grid, dropping the
 * consecutive duplicates that creates and pruning rings that collapse
 * (< 4 points — islets far below the grid). On dense 1:10m polygons this is
 * the bulk of the size reduction; for point-in-polygon lookup it only fuzzes
 * answers within ~step of a boundary. Returns null if nothing survives.
 */
function snapGeometry(geometry, step) {
  const snap = (n) => Number((Math.round(n / step) * step).toFixed(6));
  const snapRing = (ring) => {
    const out = [];
    for (const [lon, lat] of ring) {
      const p = [snap(lon), snap(lat)];
      const prev = out[out.length - 1];
      if (!prev || prev[0] !== p[0] || prev[1] !== p[1]) out.push(p);
    }
    return out.length >= 4 ? out : null;
  };
  const snapPolygon = (rings) => {
    const outer = snapRing(rings[0]);
    if (!outer) return null;
    return [outer, ...rings.slice(1).map(snapRing).filter(Boolean)];
  };
  if (geometry.type === "Polygon") {
    const poly = snapPolygon(geometry.coordinates);
    return poly ? { type: "Polygon", coordinates: poly } : null;
  }
  if (geometry.type === "MultiPolygon") {
    const polys = geometry.coordinates.map(snapPolygon).filter(Boolean);
    return polys.length ? { type: "MultiPolygon", coordinates: polys } : null;
  }
  return geometry;
}

const only = process.argv[2];
const want = (name) => !only || only === name;

async function main() {
  mkdirSync(OUT, { recursive: true });

  if (want("countries")) {
    // --- Country borders: keep only the name + geometry ----------------------
    console.log("Fetching country borders…");
    const countries = await getJson(
      `${BASE}/ne_110m_admin_0_countries.geojson`
    );
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
    writeFileSync(
      join(OUT, "countries.geojson"),
      JSON.stringify(slimCountries)
    );
    console.log(
      `  → countries.geojson (${slimCountries.features.length} features)`
    );
  }

  if (want("admin1")) {
    // --- Admin-1 (states/provinces): name + country + snapped geometry --------
    // Only the 1:10m dataset has GLOBAL admin-1 coverage (50m carries just 9
    // big countries). Powers the hover readout's "Ontario, Canada" — lookup
    // only, never drawn — so the linework is snapped to a 0.05° (~5 km) grid:
    // a hover within 5 km of a boundary may name the neighbour, which is the
    // honest limit of pointing a cursor at a globe anyway.
    console.log("Fetching admin-1 states/provinces (1:10m)…");
    const admin1 = await getJson(
      `${BASE}/ne_10m_admin_1_states_provinces.geojson`
    );
    const slimAdmin1 = {
      type: "FeatureCollection",
      features: admin1.features
        .filter((f) => f.properties?.name && f.properties?.admin && f.geometry)
        .map((f) => ({
          type: "Feature",
          properties: { name: f.properties.name, admin: f.properties.admin },
          geometry: snapGeometry(f.geometry, 0.05),
        }))
        .filter((f) => f.geometry !== null),
    };
    writeFileSync(join(OUT, "admin1.geojson"), JSON.stringify(slimAdmin1));
    console.log(`  → admin1.geojson (${slimAdmin1.features.length} regions)`);
  }

  if (want("cities")) {
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
  }

  if (want("plates")) {
    // --- Plate boundaries (Bird 2003): name + rounded geometry ---------------
    console.log("Fetching plate boundaries (Bird 2003)…");
    const plates = await getJson(
      "https://raw.githubusercontent.com/fraxen/tectonicplates/master/GeoJSON/PB2002_boundaries.json"
    );
    const slimPlates = {
      type: "FeatureCollection",
      features: plates.features
        .filter((f) => f.geometry?.type === "LineString")
        .map((f) => ({
          type: "Feature",
          properties: { name: f.properties?.Name ?? "" },
          geometry: {
            type: "LineString",
            // 3 decimals ≈ 100 m — far below the dataset's own precision.
            coordinates: f.geometry.coordinates.map(([lon, lat]) => [
              Number(lon.toFixed(3)),
              Number(lat.toFixed(3)),
            ]),
          },
        })),
    };
    writeFileSync(
      join(OUT, "plate-boundaries.geojson"),
      JSON.stringify(slimPlates)
    );
    console.log(
      `  → plate-boundaries.geojson (${slimPlates.features.length} segments)`
    );
  }

  if (want("volcanoes")) {
    // --- Holocene volcanoes (Smithsonian GVP): compact array ------------------
    console.log("Fetching Holocene volcanoes (Smithsonian GVP)…");
    const gvp = await getJson(
      "https://webservices.volcano.si.edu/geoserver/GVP-VOTW/ows?" +
        "service=WFS&version=2.0.0&request=GetFeature" +
        "&typeName=GVP-VOTW:Smithsonian_VOTW_Holocene_Volcanoes&outputFormat=json"
    );
    const volcanoes = gvp.features
      .map((f) => {
        const p = f.properties ?? {};
        const [lon, lat] = f.geometry?.coordinates ?? [p.Longitude, p.Latitude];
        return {
          name: p.Volcano_Name ?? null,
          lat: Number(Number(lat).toFixed(3)),
          lon: Number(Number(lon).toFixed(3)),
          type: p.Primary_Volcano_Type ?? null,
          elevation: Number.isFinite(p.Elevation) ? p.Elevation : null,
          lastEruptionYear: Number.isFinite(p.Last_Eruption_Year)
            ? p.Last_Eruption_Year
            : null,
          country: p.Country ?? null,
        };
      })
      .filter((v) => v.name && Number.isFinite(v.lat) && Number.isFinite(v.lon))
      .sort((a, b) => a.name.localeCompare(b.name));
    const volcanoDataset = {
      provenance: {
        source:
          "Smithsonian Institution Global Volcanism Program — Volcanoes of the World",
        sourceUrl: "https://volcano.si.edu/",
        service: "GVP-VOTW WFS",
        retrievedAt: new Date().toISOString(),
      },
      records: volcanoes,
    };
    writeFileSync(join(OUT, "volcanoes.json"), JSON.stringify(volcanoDataset));
    console.log(`  → volcanoes.json (${volcanoes.length} volcanoes)`);
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
