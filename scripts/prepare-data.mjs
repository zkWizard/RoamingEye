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
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
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

/**
 * Unique boundary polylines from polygon features, snapped to `step` degrees.
 * Shared edges (a border drawn by both neighbours) are kept once. Rings that
 * jump the antimeridian are split there rather than stroked across the globe.
 */
function boundaryLines(features, step) {
  const prec = step >= 0.1 ? 2 : 3;
  const quant = (n) => Number((Math.round(n / step) * step).toFixed(prec));
  const pointKey = (x, y) => `${x},${y}`;
  const adj = new Map();
  const link = (a, b) => {
    if (!adj.has(a)) adj.set(a, new Set());
    adj.get(a).add(b);
  };
  const addRing = (ring) => {
    if (!Array.isArray(ring)) return;
    for (let i = 0; i + 1 < ring.length; i++) {
      const a = ring[i];
      const b = ring[i + 1];
      if (!a || !b) continue;
      let dlon = Math.abs(a[0] - b[0]);
      if (dlon > 180) dlon = 360 - dlon;
      if (dlon > 25 || Math.abs(a[1] - b[1]) > 25) continue;
      const ax = quant(a[0]);
      const ay = quant(a[1]);
      const bx = quant(b[0]);
      const by = quant(b[1]);
      if (ax === bx && ay === by) continue;
      const ak = pointKey(ax, ay);
      const bk = pointKey(bx, by);
      link(ak, bk);
      link(bk, ak);
    }
  };
  for (const feature of features) {
    const geometry = feature.geometry;
    if (!geometry) continue;
    const polygons =
      geometry.type === "Polygon"
        ? [geometry.coordinates]
        : geometry.type === "MultiPolygon"
          ? geometry.coordinates
          : [];
    for (const polygon of polygons) addRing(polygon[0]);
  }
  const lines = [];
  for (const [start, neighbours] of adj) {
    while (neighbours.size > 0) {
      const line = [start];
      let current = start;
      while (adj.get(current)?.size) {
        const next = adj.get(current).values().next().value;
        adj.get(current).delete(next);
        adj.get(next)?.delete(current);
        line.push(next);
        current = next;
        if (current === start) break;
      }
      // Two-point scraps are snap noise, and they double the file for no
      // coastline a person can see.
      if (line.length < 4) continue;
      lines.push(line.flatMap((key) => key.split(",").map((n) => Number(n))));
    }
  }
  return lines;
}

function ringCentroid(ring) {
  let lon = 0;
  let lat = 0;
  const n = Math.max(1, ring.length - 1);
  for (let i = 0; i < ring.length - 1; i++) {
    lon += ring[i][0];
    lat += ring[i][1];
  }
  return [Number((lon / n).toFixed(2)), Number((lat / n).toFixed(2))];
}

/** The outer ring with the most vertices — the one a label should sit on. */
function largestOuterRing(geometry) {
  const polygons =
    geometry?.type === "Polygon"
      ? [geometry.coordinates]
      : geometry?.type === "MultiPolygon"
        ? geometry.coordinates
        : [];
  let best = null;
  for (const polygon of polygons) {
    const ring = polygon?.[0];
    if (ring && (!best || ring.length > best.length)) best = ring;
  }
  return best;
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
    // --- Plate boundaries (Bird 2003): step attributes + rounded geometry ----
    // PB2002 publishes four per-step attributes we retain verbatim alongside
    // the label, rather than leaving consumers to re-derive them from the
    // label string: PlateA/PlateB (the bordering plate codes), Type (set to
    // "subduction" on subduction steps and left blank on every other step),
    // and Source (the digitization credited for that step — the dataset is a
    // compilation of dozens of sources, not one uniform survey).
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
          properties: {
            name: f.properties?.Name ?? "",
            plateA: f.properties?.PlateA ?? "",
            plateB: f.properties?.PlateB ?? "",
            type: f.properties?.Type ?? "",
            source: f.properties?.Source ?? "",
          },
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
          volcanoNumber: Number.isInteger(p.Volcano_Number)
            ? p.Volcano_Number
            : null,
          name: p.Volcano_Name ?? null,
          lat: Number(Number(lat).toFixed(3)),
          lon: Number(Number(lon).toFixed(3)),
          type: p.Primary_Volcano_Type ?? null,
          elevation: Number.isFinite(p.Elevation) ? p.Elevation : null,
          lastEruptionYear: Number.isFinite(p.Last_Eruption_Year)
            ? p.Last_Eruption_Year
            : null,
          country: p.Country ?? null,
          region: p.Region ?? null,
          subregion: p.Subregion ?? null,
          tectonicSetting: p.Tectonic_Setting ?? null,
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

  if (want("admin-lines")) {
    // State and province outlines, derived from the admin-1 extract already
    // vendored for the hover readout. Two snaps: a light one for the zoom
    // where a country fills the view, and a tighter one for close zoom.
    // Neither file is fetched at boot — BordersOverlay asks for them only
    // after the visitor turns borders on and moves in.
    console.log("Building admin-1 boundary lines…");
    const admin1 = JSON.parse(
      readFileSync(join(OUT, "admin1.geojson"), "utf8")
    );
    const regional = boundaryLines(admin1.features, 0.4);
    const close = boundaryLines(admin1.features, 0.15);
    writeFileSync(
      join(OUT, "admin1-lines.json"),
      JSON.stringify({ step: 0.4, lines: regional })
    );
    writeFileSync(
      join(OUT, "admin1-detail.json"),
      JSON.stringify({ step: 0.15, lines: close })
    );
    console.log(
      `  → admin1-lines.json (${regional.length} lines), admin1-detail.json (${close.length} lines)`
    );
  }

  if (want("timezones")) {
    // Natural Earth time zones (public domain). Snapped hard: the overlay is
    // a reading aid at globe scale, not a survey of the political boundary.
    console.log("Fetching time zones…");
    const zones = await getJson(`${BASE}/ne_10m_time_zones.geojson`);
    const features = [];
    for (const feature of zones.features) {
      const raw = feature.properties?.zone;
      const offset = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(offset) || !feature.geometry) continue;
      const snapped = {
        type: "Feature",
        properties: {},
        geometry: snapGeometry(feature.geometry, 0.7) ?? feature.geometry,
      };
      const lines = boundaryLines([snapped], 0.7);
      if (lines.length === 0) continue;
      const ring = largestOuterRing(snapped.geometry);
      if (!ring || ring.length < 4) continue;
      features.push({
        offset,
        label: ringCentroid(ring),
        lines,
      });
    }
    writeFileSync(
      join(OUT, "time-zones.json"),
      JSON.stringify({ zones: features })
    );
    console.log(`  → time-zones.json (${features.length} zones)`);
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
