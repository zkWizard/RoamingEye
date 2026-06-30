# Adding a data layer or overlay

RoamingEye is designed so new data is easy to add. There are two common kinds of
contribution. Both are great first PRs.

---

## A) Add a new timeline imagery layer (e.g. land-surface temperature)

The timeline's switchable layers live in one catalog. To add one:

1. **Find the GIBS layer.** Browse [NASA Worldview](https://worldview.earthdata.nasa.gov/)
   or the [GIBS layer list](https://nasa-gibs.github.io/gibs-api-docs/available-visualizations/)
   and note the exact WMS layer identifier and its temporal coverage.
2. **Add it to `LAYERS`** in [`src/lib/timeline.ts`](../src/lib/timeline.ts):

   ```ts
   lst: {
     id: "lst",
     label: "Land surface temp",
     wmsLayer: "MODIS_Terra_L3_Land_Surface_Temp_Monthly_Day",
     start: { year: 2000, month: 3 },
     description: "Monthly daytime land-surface temperature.",
   },
   ```

3. **Register it** in `LAYER_ORDER` (same file) so the selector shows it.
4. **Add a unit test** in `timeline.test.ts` if it has any special handling.
5. Run `npm run dev`, pick the new layer, and scrub. Done — the selector,
   prefetch, and scrubbing all work automatically.

> Tip: if the layer needs a non-default resolution or date convention, that lives
> alongside the layer config; keep any new logic pure and tested.

---

## B) Add a new map overlay (e.g. tectonic plates, protected areas)

Overlays are self-contained classes implementing the `MapOverlay` interface in
[`src/overlays/types.ts`](../src/overlays/types.ts):

```ts
export interface MapOverlay {
  readonly id: string;
  readonly label: string;
  readonly icon: string; // inline SVG (see src/ui/icons.ts)
  readonly object: THREE.Object3D;
  readonly defaultOn?: boolean;
  ensureLoaded?(): Promise<void>; // lazy data fetch on first enable
}
```

Steps:

1. **Create `src/overlays/MyOverlay.ts`.** Build a Three.js object (lines, points,
   a mesh). Use `latLngToVector3(lat, lon, radius)` from `src/lib/geo.ts` to place
   things on the globe — pick a radius just above the base (≈1.001–1.004) to layer
   cleanly. If it loads remote data, fetch it via `fetchJson` from `src/lib/net.ts`
   inside `ensureLoaded()`.
2. **Add an icon** to `src/ui/icons.ts` (a small inline SVG).
3. **Register it** in the `overlays` array in [`src/main.ts`](../src/main.ts).
   The toolbar, lazy-loading, and toggling are wired automatically.
4. **Bundle data** if needed: drop a slimmed file in `public/data/` (and, ideally,
   extend `scripts/prepare-data.mjs` so it's reproducible). Keep files small.
5. **Attribute the source** in [`DATA_SOURCES.md`](../DATA_SOURCES.md) and the
   in-app footer if it's a new provider.

Look at `GraticuleOverlay` (pure geometry), `BordersOverlay` (fetched GeoJSON →
lines), and `CitiesOverlay` (points) as references.

---

## Checklist before opening the PR

- [ ] `npm run lint && npm run typecheck && npm run test && npm run build` pass.
- [ ] Data source is open and attributed.
- [ ] Commits are signed off (`git commit -s`).

Thank you for widening what RoamingEye can show the world. 🌍
