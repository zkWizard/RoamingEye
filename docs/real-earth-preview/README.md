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

## First view, in space

The frames above light the satellite oceans and leave Greenness flat, so a
first visit in the light theme looked like a pale card. These later frames are
the default visit: Greenness, 15 Oct 2026, camera over the Americas, clock
frozen at 15 Nov 2026 16:30 UTC.

Day and night are on for data layers by default. The night floor is 0.045 in
linear light, about 17% of the day side once sRGB encodes it, and it is a
multiply with a cool tint so the hue stays. Twilight is a warm band across
the terminator. The probe still reads the unshaded colormap. The limb is a
shell 1.2% larger than the globe. NASA Black Marble (VIIRS, 2016) is added
only on the bright city pixels of the night side. The credits sit on a dark
plate in both themes. These frames look at 20 N, 25 E, 15 Nov 2026 16:30 UTC,
so the evening terminator crosses Africa and the night side is in frame.

Desktop is 1440x900. Phone is 390x844. `terminator.gif` steps the same view
through 24 hours, two hours a frame, on 15 Oct 2026.

The sky chunk, the night-lights fetch, and the sun chunk stay off the entry
path.
