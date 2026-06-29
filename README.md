# RoamingEye 🌍

**Roam a high-fidelity 3D Earth from a satellite's-eye view — right in your browser.**

RoamingEye is an open-source project building a highly detailed, interactive 3D
globe you can explore on both mobile and desktop. The long-term vision: zoom from
orbit down to street-level terrain, and surface real information about whatever
country, region, or feature you're looking at — all powered by **open mapping and
geospatial data from researchers and institutions around the world**.

## ✨ Current features

- A real, texture-mapped 3D Earth rendered with WebGL (Three.js)
- **Grab and drag** to rotate the globe in any direction (mouse + touch)
- A **temporal scrubber** — a ruler-style timeline (one tick per month, labelled
  by year) to scrub through the last 5 years of monthly satellite data and watch
  the **seasons change** across the globe
- **Switchable data layers**: vegetation (NDVI / EVI) and snow cover
- Smooth inertia, responsive layout, and a starfield backdrop; works on desktop
  and mobile

> Zoom, pan, location info, and true elevation terrain are **on the roadmap** —
> see below.

---

## 🛰️ Data & imagery

The globe is painted with **NASA GIBS** (Global Imagery Browse Services) monthly
composites — cloud-free, gap-free, derived from the MODIS instrument on NASA's
Terra satellite, and served with permissive CORS so the browser can load them
directly into WebGL textures.

- **Vegetation** — `MODIS_Terra_L3_NDVI_Monthly`, `MODIS_Terra_L3_EVI_Monthly`
- **Snow cover** — `MODIS_Terra_L3_Snow_Cover_Monthly_Average_Pct`
- Coverage: monthly, **2000 → present** (the scrubber starts with the most
  recent 5 years)
- Source: [NASA GIBS](https://nasa-gibs.github.io/gibs-api-docs/) ·
  License: **Public domain** (NASA imagery is generally free to use)

> Why not photographic true-color? Open, cloud-free, monthly _true-color_
> imagery doesn't exist across multiple years — daily true-color mosaics are
> cloudy and have orbital-swath gaps. Vegetation and snow indices are the
> standard, purpose-built way to observe seasonal cycles over decades.

Future terrain elevation is planned to use open datasets such as
[GEBCO](https://www.gebco.net/) bathymetry/topography and
[NASA SRTM](https://www.earthdata.nasa.gov/data/instruments/srtm). All data
sources will remain open and properly attributed.

---

## 🚀 Getting started

**Requirements:** [Node.js](https://nodejs.org/) 20+ and npm.

```bash
# 1. Install dependencies
npm install

# 2. Start the local dev server
npm run dev
```

Then open the URL Vite prints (default: <http://localhost:5173>).
The dev server is also exposed on your local network, so you can open that same
`http://<your-computer-ip>:5173` address on your phone to test mobile.

### Other scripts

```bash
npm run build     # production build into dist/
npm run preview   # preview the production build locally
```

---

## 🧰 Tech stack

| Concern       | Choice                                        |
| ------------- | --------------------------------------------- |
| Language      | [TypeScript](https://www.typescriptlang.org/) |
| 3D rendering  | [Three.js](https://threejs.org/)              |
| Build / dev   | [Vite](https://vitejs.dev/)                   |
| Controls      | Three.js `OrbitControls` (rotate-only)        |
| Unit tests    | [Vitest](https://vitest.dev/)                 |
| E2E tests     | [Playwright](https://playwright.dev/)         |
| Lint / format | ESLint + Prettier                             |
| CI            | GitHub Actions                                |
| Imagery       | NASA GIBS / MODIS monthly (public domain)     |

---

## 🗺️ Roadmap

- [x] **M0** — Grab-to-rotate 3D Earth (this MVP)
- [x] **Temporal scrubber** — monthly seasonal composites (NDVI/EVI/snow) over
      the last 5 years, with a ruler-style timeline
- [ ] **M1** — Zoom in/out toward the surface, with sensible limits
- [ ] Extend the timeline back to 2000 (and stream the current month as NASA
      publishes it)
- [ ] **M2** — Higher-resolution, tiled imagery that streams in as you zoom
- [ ] **M3** — True elevation terrain (GEBCO / SRTM) for real 3D relief
- [ ] **M4** — Click/tap a location to see details (country, region, features)
- [ ] **M5** — Search and "fly to" a place

---

## 📦 Project structure

```
RoamingEye/
├─ index.html          # Landing page + overlay UI
├─ src/
│  ├─ main.ts          # Three.js scene: Earth, lighting, controls, wiring
│  ├─ lib/             # Pure, unit-tested logic (geo math, timeline model)
│  ├─ textures/        # GIBS imagery loading, caching, application
│  ├─ ui/              # Timeline scrubber + layer selector (DOM components)
│  └─ style.css        # Layout and overlay styling
├─ e2e/                # Playwright browser smoke tests
├─ public/
│  └─ textures/        # Static fallback imagery (NASA Blue Marble)
├─ .github/            # CI, issue/PR templates, contributing & security docs
├─ vite.config.ts
└─ package.json
```

---

## 🤝 Contributing

RoamingEye is fully open source and contributions are welcome — whether that's
code, data-source expertise, or design. Every change lands through a reviewed,
CI-gated pull request.

- **[CONTRIBUTING.md](.github/CONTRIBUTING.md)** — setup, workflow, testing, and
  DCO sign-off.
- **[GOVERNANCE.md](GOVERNANCE.md)** — roles, the trust ladder, and how decisions
  get made.
- **[Code of Conduct](.github/CODE_OF_CONDUCT.md)** — be kind.

If you work with open geospatial data and want to help, we'd especially love
your input.

## 📄 License

[MIT](./LICENSE) for the code. Imagery and data retain their respective licenses
(see **Data & imagery** above).
