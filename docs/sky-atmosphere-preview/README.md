# Stars, atmosphere, and tone mapping

Before and after the sky chunk. The clock is frozen at 15 Nov 2026, 16:30 UTC,
the same instant as the real-sun frames, so the day limb and the twilight limb
can be compared. The sun is overhead near 18.6 S, 71.4 W. The Americas are in
daylight and the Atlantic limb is the evening terminator.

Whole Earth, dark: the flat blue ring becomes a blue day limb and a warm, thin
night limb, and the star shell goes from 1,500 points to 6,000. Whole Earth,
light: the page stays the pale background, stars stay off, and the limb is
quieter so the globe still reads. Europe is the same NDVI month, close enough
to see the limb without covering the colormap.

SwiftShader frame rate on the whole-Earth dark view, 2 seconds of frames:
6 fps before, 8 fps after.

Entry chunk after this change: 58.7 kB gzip, below the sun-lighting branch
(58.8 kB) and below main (59.3 kB). The sky chunk is lazy at 1.6 kB gzip and
loads after the first frame. Filmic tone mapping applies to the satellite mesh
only. Science colours, including the NDVI land in these frames, stay ungraded.
