# Terrain relief & OSM buildings preview (roadmap 6b / 6c)

Esri World Imagery on Terrarium terrain, pitched ~55°. **Before** shots are from
`main` before zoom-dependent relief exaggeration and OpenFreeMap building
extrusions. **After** adds stronger close-up relief, OSM 3D buildings at city zoom,
and tilt-boosted place labels.

| View | Before | After |
|------|--------|-------|
| Alps close-up | `before-desktop-alps.png` | `after-desktop-alps.png` |
| Grand Canyon | `before-desktop-grand-canyon.png` | `after-desktop-grand-canyon.png` |
| Manhattan + buildings | `before-desktop-manhattan.png` | `after-desktop-manhattan.png` |
| Phone 390×844 | `before-phone-manhattan.png` | `after-phone-manhattan.png` |

Regenerate with `npm run dev` and `node scripts/capture-terrain-buildings-preview.mjs`
(after). On `main`, run with `PREFIX=before` for comparators.