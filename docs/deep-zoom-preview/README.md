# Deep zoom

Screenshots of searching for a city and zooming in, taken 2026-10-26.

`before/` is the live site (https://roamingeye.org) before this change. Searching
for Houston opened the city from about 760 km up (`alt=0.12`). The wheel then
stopped at about 410 km (`alt=0.06`). At that height the month's vegetation
layer covers the satellite photo, and neither downtown nor NRG Stadium is
recognizable. Tokyo stops at the same altitude.

`after/` is this branch. The same search opens Houston at about 180 km, and the
wheel, a trackpad pinch, and a two-finger pinch keep going to about 250 m above
the ground. Over Houston that is a hash altitude of roughly `-0.0048` (the
camera is just inside the old unit sphere, a few hundred metres above the
ellipsoid). Esri World Imagery is sharp enough to read streets, building
footprints, freeways, and the "NRG STADIUM" roof. The NASA month fades out as
the view gets finer than the layer's own pixels, and fades back in on the way
out. Turning Sharper imagery off keeps the month painted.

Heights above the ground in the file names:

| name              | height                                                                            |
| ----------------- | --------------------------------------------------------------------------------- |
| `*-search`        | where the Houston search flight stops, about 180 km                               |
| `*-search-zoomed` | the wheel taken to the closest the camera will go                                 |
| `*-city`          | 160 km                                                                            |
| `*-neighborhood`  | 6–8 km                                                                            |
| `*-street`        | 450 m downtown, 500 m in Tokyo, 700 m over NRG Stadium so the bowl fits the frame |

`desktop-*` is 1440×900. `phone-*` is 390×844.
