# RoamingEye 🌍

**Roam a high-fidelity 3D Earth from a satellite's-eye view — right in your browser.**

RoamingEye is an open-source project building a highly detailed, interactive 3D
globe you can explore on both mobile and desktop. The long-term vision: zoom from
orbit down to street-level terrain, and surface real information about whatever
country, region, or feature you're looking at — all powered by **open mapping and
geospatial data from researchers and institutions around the world**.

This repository is at its **first MVP milestone**: a single landing page with a
draggable, grab-to-rotate 3D Earth.

---

## ✨ Current features (MVP)

- A real, texture-mapped 3D Earth rendered with WebGL (Three.js)
- **Grab and drag** to rotate the globe in any direction (mouse + touch)
- Smooth inertia, responsive layout, and a starfield backdrop
- Works on desktop and mobile

> Zoom, pan, location info, and true elevation terrain are **on the roadmap** —
> see below.

---

## 🛰️ Data & imagery

The Earth texture is **NASA Blue Marble: Next Generation** — a true-color global
composite derived from satellite observations.

- Source: [NASA Visible Earth — Blue Marble](https://visibleearth.nasa.gov/collection/1484/blue-marble)
- License: **Public domain** (NASA imagery is generally free to use)

Future terrain elevation is planned to use open datasets such as
[GEBCO](https://www.gebco.net/) bathymetry/topography and
[NASA SRTM](https://www.earthdata.nasa.gov/data/instruments/srtm). All data
sources will remain open and properly attributed.

---

## 🚀 Getting started

**Requirements:** [Node.js](https://nodejs.org/) 18+ and npm.

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

| Concern        | Choice                                  |
| -------------- | --------------------------------------- |
| 3D rendering   | [Three.js](https://threejs.org/)        |
| Build / dev    | [Vite](https://vitejs.dev/)             |
| Controls       | Three.js `OrbitControls` (rotate-only)  |
| Imagery        | NASA Blue Marble (public domain)        |

---

## 🗺️ Roadmap

- [x] **M0** — Grab-to-rotate 3D Earth (this MVP)
- [ ] **M1** — Zoom in/out toward the surface, with sensible limits
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
│  ├─ main.js          # Three.js scene: Earth, lighting, controls
│  └─ style.css        # Layout and overlay styling
├─ public/
│  └─ textures/        # NASA Blue Marble imagery
├─ vite.config.js
└─ package.json
```

---

## 🤝 Contributing

RoamingEye is fully open source and contributions are welcome — whether that's
code, data-source expertise, or design. Open an issue to discuss an idea, or send
a pull request. If you work with open geospatial data and want to help, we'd
especially love your input.

## 📄 License

[MIT](./LICENSE) for the code. Imagery and data retain their respective licenses
(see **Data & imagery** above).
