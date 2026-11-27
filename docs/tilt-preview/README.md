# Tilt and heading

Straight down, then pitched to 55 degrees over the same ground point.
The base map is Esri World Imagery on streamed terrain; the monthly
science drape fades once the photo is finer. Desktop is 1440x900.
Phone is 390x844 with the dock folded. `light=flat` keeps NASA shading
off the mesh so relief reads from the photograph and Terrarium height.

`tilt.gif` is a right-drag over the Alps, from straight down toward
the horizon. The compass (N) points north up. The 3D button is the
one-tap pitch.

Before (#1224) is true-scale relief with a nadir tile budget and no
terrain anisotropy. After (tilt 5b) adds anisotropic imagery, oblique
LOD, 1.75x vertical exaggeration while pitched, a light horizon haze,
and auto-folding the dock on small screens when the view tilts.

| Place         | Before                           | After                           | Phone after                   |
| ------------- | -------------------------------- | ------------------------------- | ----------------------------- |
| Himalaya      | before-desktop-himalaya.png      | after-desktop-himalaya.png      | after-phone-himalaya.png      |
| Alps          | before-desktop-alps.png          | after-desktop-alps.png          | after-phone-alps.png          |
| Grand Canyon  | before-desktop-grand-canyon.png  | after-desktop-grand-canyon.png  | after-phone-grand-canyon.png  |
| San Francisco | before-desktop-san-francisco.png | after-desktop-san-francisco.png | after-phone-san-francisco.png |
