import { LinearFilter, SRGBColorSpace, TextureLoader } from "three";
import type { SunHandle } from "./Sun";

/**
 * NASA Black Marble, one global image, loaded after the sun chunk.
 * VIIRS 2016 annual composite, public domain, GIBS WMS.
 * https://gibs.earthdata.nasa.gov
 */

const NIGHT_LIGHTS_URL =
  "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.1.1&LAYERS=VIIRS_Black_Marble&FORMAT=image/jpeg&SRS=EPSG:4326&BBOX=-180,-90,180,90&WIDTH=1024&HEIGHT=512&TIME=2016-01-01";

/** Fetch city lights and hand them to the science sphere. No-op on failure. */
export function loadNightLights(sun: SunHandle): void {
  const loader = new TextureLoader();
  loader.load(
    NIGHT_LIGHTS_URL,
    (texture) => {
      texture.colorSpace = SRGBColorSpace;
      texture.magFilter = LinearFilter;
      texture.minFilter = LinearFilter;
      texture.needsUpdate = true;
      sun.setNightMap(texture);
    },
    undefined,
    () => {
      // The terminator still reads without the cities.
    }
  );
}
