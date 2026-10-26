import * as THREE from "three";
import { parseBorderLines } from "../lib/borderLines";
import { geometryToRings, type GeoGeometry } from "../lib/geojson";
import { fetchJson } from "../lib/net";
import { ICONS } from "../ui/icons";
import type { HaloStyle } from "./haloLines";
import { GLOBE_RADIUS, once, type MapOverlay } from "./types";

interface FeatureCollection {
  features: { geometry: GeoGeometry }[];
}

/**
 * Borders from Natural Earth (public domain).
 *
 * Countries load with the toggle. State and province lines (admin-1) wait
 * until the camera has moved in, in two snaps: a light one when a country
 * fills the view, a tighter one up close. US county lines are a third snap,
 * and only while the view is over the United States: there is no similarly
 * small global admin-2 extract, so other countries stay at admin-1.
 */
const STATE_DISTANCE = 2.35;
const DETAIL_DISTANCE = 1.5;
/** Close enough that a state fills the view and county lines are readable. */
const COUNTY_DISTANCE = 1.28;

const BORDER_STYLE: HaloStyle = {
  widthPx: 4.5,
  core: 0xf6f3ec,
  halo: 0x12161e,
};

export class BordersOverlay implements MapOverlay {
  readonly id = "borders";
  readonly label = "Borders";
  readonly detail = "Countries, states, US counties up close";
  readonly icon = ICONS.borders;
  readonly object = new THREE.Group();

  private states: THREE.Object3D | null = null;
  private detailMesh: THREE.Object3D | null = null;
  private statesStarted = false;
  private detailStarted = false;
  private halo: typeof import("./haloLines") | undefined;
  /** County sync, loaded only after the camera has moved in close. */
  private us?: (camera: THREE.PerspectiveCamera) => void;

  constructor(
    private readonly countriesUrl = `${import.meta.env.BASE_URL}data/countries.geojson`,
    private readonly statesUrl = `${import.meta.env.BASE_URL}data/admin1-lines.json`,
    private readonly detailUrl = `${import.meta.env.BASE_URL}data/admin1-detail.json`
  ) {
    this.object.visible = false;
  }

  private readonly loadOnce = once(() => this.loadCountries());

  ensureLoaded(): Promise<void> {
    return this.loadOnce();
  }

  update(camera: THREE.PerspectiveCamera): void {
    this.halo?.setHaloResolution(
      this.object,
      window.innerWidth,
      window.innerHeight
    );
    if (!this.object.visible) return;
    const distance = camera.position.length();
    const showStates = distance < STATE_DISTANCE;
    const showDetail = distance < DETAIL_DISTANCE;
    if (this.states) this.states.visible = showStates;
    if (this.detailMesh) this.detailMesh.visible = showDetail && showStates;
    if (showStates)
      this.arm("statesStarted", "states", this.statesUrl, 1.0026, 3.4);
    if (showDetail)
      this.arm("detailStarted", "detailMesh", this.detailUrl, 1.0031, 2.8);
    if (distance < COUNTY_DISTANCE) {
      if (this.us) this.us(camera);
      else this.loadUs(camera);
    }
  }

  private loadUs(camera: THREE.PerspectiveCamera): void {
    this.us = () => undefined;
    void import("./usCounties")
      .then((mod) => {
        this.us = (next) => mod.syncUsCounties(this.object, next);
        this.us(camera);
      })
      .catch(() => {
        this.us = undefined;
      });
  }

  private async loadCountries(): Promise<void> {
    const data = await fetchJson<FeatureCollection>(this.countriesUrl);
    const lines = data.features.flatMap((feature) =>
      geometryToRings(feature.geometry)
    );
    await this.addLines(lines, GLOBE_RADIUS * 1.002, BORDER_STYLE.widthPx);
  }

  private arm(
    flag: "statesStarted" | "detailStarted",
    slot: "states" | "detailMesh",
    url: string,
    lift: number,
    widthPx: number
  ): void {
    if (this[flag]) return;
    this[flag] = true;
    void this.loadLineFile(url, GLOBE_RADIUS * lift, widthPx)
      .then((mesh) => {
        this[slot] = mesh;
        if (mesh) mesh.visible = true;
      })
      .catch(() => {
        this[flag] = false;
      });
  }

  private async loadLineFile(
    url: string,
    radius: number,
    widthPx: number
  ): Promise<THREE.Object3D | null> {
    const lines = parseBorderLines(await fetchJson<unknown>(url));
    return this.addLines(lines, radius, widthPx);
  }

  private async addLines(
    lines: ReadonlyArray<ReadonlyArray<readonly [number, number]>>,
    radius: number,
    widthPx: number
  ): Promise<THREE.Object3D | null> {
    this.halo ??= await import("./haloLines");
    const mesh = this.halo.haloLineMesh(lines, radius, {
      ...BORDER_STYLE,
      widthPx,
    });
    if (mesh) this.object.add(mesh);
    return mesh;
  }
}
