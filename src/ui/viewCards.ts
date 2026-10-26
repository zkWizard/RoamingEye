import { LAYERS, type LayerId } from "../lib/timeline";

/**
 * The front door. Each card puts the globe into one view a new visitor can
 * name without knowing a dataset id. Thumbnails are keyless GIBS GetMap
 * images of a month every listed layer actually publishes.
 */

export interface ViewCard {
  id: string;
  title: string;
  blurb: string;
  /** Imagery to switch to. Omitted when the card only turns overlays on. */
  layer?: LayerId;
  overlays?: readonly string[];
  thumbnailLayer: LayerId;
}

export const VIEW_CARDS: readonly ViewCard[] = [
  {
    id: "green",
    title: "Forests & greenery",
    blurb: "Where plants are thriving",
    layer: "ndvi",
    thumbnailLayer: "ndvi",
  },
  {
    id: "smoke",
    title: "Wildfire smoke & dust",
    blurb: "Smoke and dust in the air",
    layer: "aerosol",
    overlays: ["borders"],
    thumbnailLayer: "aerosol",
  },
  {
    id: "snow",
    title: "Snow & ice",
    blurb: "Where snow covers the ground",
    layer: "snow",
    thumbnailLayer: "snow",
  },
  {
    id: "ocean",
    title: "Ocean heat",
    blurb: "How warm the sea surface is",
    layer: "sst",
    thumbnailLayer: "sst",
  },
  {
    id: "land-heat",
    title: "Hot spots on land",
    blurb: "Daytime temperature of the ground",
    layer: "lst",
    thumbnailLayer: "lst",
  },
  {
    id: "rain",
    title: "Rain",
    blurb: "Where water fell on the land",
    layer: "precip",
    thumbnailLayer: "precip",
  },
  {
    id: "dry",
    title: "Dry ground",
    blurb: "How much water is in the soil",
    layer: "soil",
    thumbnailLayer: "soil",
  },
  {
    id: "hazards",
    title: "Earthquakes & volcanoes",
    blurb: "Plates, volcanoes, and recent quakes",
    overlays: ["plates", "volcanoes", "quakes"],
    thumbnailLayer: "terrain",
  },
];

/** A small world preview. June 2024 is inside every monthly layer's record. */
export function viewCardThumbnail(layerId: LayerId): string {
  const layer = LAYERS[layerId];
  const params = new URLSearchParams({
    SERVICE: "WMS",
    REQUEST: "GetMap",
    VERSION: "1.3.0",
    LAYERS: layer.wmsLayer,
    STYLES: "",
    FORMAT: "image/jpeg",
    CRS: "EPSG:4326",
    BBOX: "-58,-170,72,180",
    WIDTH: "280",
    HEIGHT: "150",
    TIME: layer.static ? "2000-03-01" : "2024-06-01",
  });
  return `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?${params}`;
}
