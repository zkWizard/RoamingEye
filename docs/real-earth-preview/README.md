# Real sun and day/night

Before and after the real-sun lighting. The satellite base map uses the clock.
These frames freeze that clock so the terminator can be compared with a
day/night map for the same UTC time.

Globe frames (whole Earth, Europe, NDVI, settings): 15 Nov 2026, 16:30 UTC.
NOAA's solar calculator puts the sun overhead at 18.6 S, 71.4 W. The evening
terminator is near 19 E, so the Pacific west of the Americas is in night and
Europe is in late afternoon. NDVI on land stays the colormap. Oceans take the
day, twilight, and night shading.

Himalaya: 15 Nov 2026, 09:45 UTC, close enough that the satellite photo and the
terrain relief show. The sun is low to the west of the range.

SwiftShader frame rate on the whole-Earth view, 2.5 s of frames: 8 fps before,
9 fps after. Not a regression.

Entry chunk after this change: 58.8 kB gzip, below main and the 60 kB
budget. The sun chunk is lazy at 4.4 kB gzip and loads with the terrain globe,
after the first frame.
