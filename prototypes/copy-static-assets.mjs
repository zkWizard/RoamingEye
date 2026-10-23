import { cpSync, mkdirSync } from "node:fs";
const src = "node_modules/cesium/Build/Cesium";
mkdirSync("public/cesium", { recursive: true });
for (const d of ["Workers", "ThirdParty", "Assets", "Widgets"]) {
  cpSync(`${src}/${d}`, `public/cesium/${d}`, { recursive: true });
}

// Precomputed Bruneton atmosphere LUTs, so the three.js prototype doesn't recompute them on load.
mkdirSync("public/atmosphere", { recursive: true });
cpSync("node_modules/@takram/three-atmosphere/assets", "public/atmosphere", {
  recursive: true,
  filter: (p) => !/\.(bin|exr)$/.test(p) || /(^|[\\/])(transmittance|scattering|irradiance|higher_order_scattering)\.exr$/.test(p),
});
