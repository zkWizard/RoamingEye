import * as THREE from "three";
import { latLngToVector3 } from "../lib/geo";
import { fetchJson } from "../lib/net";
import { ICONS } from "../ui/icons";
import { GLOBE_RADIUS, once, type MapOverlay } from "./types";

/** A label must face the camera at least this much to show. */
const FRONT_FACING_DOT = 0.2;

interface ZoneLabel {
  el: HTMLSpanElement;
  position: THREE.Vector3;
  normal: THREE.Vector3;
}

/**
 * Time-zone boundaries from Natural Earth, with one UTC offset label per
 * zone. Boundaries rather than a colour wash, so the satellite picture stays
 * readable. Loaded only when the visitor turns the overlay on.
 */
export class TimeZonesOverlay implements MapOverlay {
  readonly id = "timezones";
  readonly label = "Time zones";
  readonly detail = "UTC offset of each region";
  readonly icon = ICONS.timezones;
  readonly object = new THREE.Group();

  private labelLayer: HTMLDivElement | undefined;
  private halo: typeof import("./haloLines") | undefined;
  private labels: ZoneLabel[] = [];
  private readonly projected = new THREE.Vector3();
  private readonly cameraDir = new THREE.Vector3();
  private readonly radius = GLOBE_RADIUS * 1.0018;

  constructor(
    private readonly url = `${import.meta.env.BASE_URL}data/time-zones.json`
  ) {
    this.object.visible = false;
  }

  private readonly loadOnce = once(() => this.load());

  ensureLoaded(): Promise<void> {
    return this.loadOnce();
  }

  update(camera: THREE.PerspectiveCamera, viewportHeightPx: number): void {
    this.halo?.setHaloResolution(
      this.object,
      window.innerWidth,
      viewportHeightPx
    );
    const layer = this.labelLayer;
    if (!layer) return;
    if (!this.object.visible) {
      layer.hidden = true;
      return;
    }
    layer.hidden = false;
    const width = window.innerWidth;
    this.cameraDir.copy(camera.position).normalize();
    for (const label of this.labels) {
      const facing = label.normal.dot(this.cameraDir) > FRONT_FACING_DOT;
      label.el.hidden = !facing;
      if (!facing) continue;
      this.projected.copy(label.position).project(camera);
      const x = ((this.projected.x + 1) / 2) * width;
      const y = ((1 - this.projected.y) / 2) * viewportHeightPx;
      label.el.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }
  }

  private async load(): Promise<void> {
    const [{ formatUtcOffset, labelAnchors, parseTimeZones }, halo] =
      await Promise.all([import("../lib/timeZones"), import("./haloLines")]);
    this.halo = halo;
    const zones = parseTimeZones(await fetchJson<unknown>(this.url));
    const lines = zones.flatMap((zone) => zone.lines);
    const mesh = halo.haloLineMesh(lines, this.radius, {
      widthPx: 3.2,
      core: 0xd7ecff,
      halo: 0x102033,
    });
    if (mesh) this.object.add(mesh);

    const layer = document.createElement("div");
    layer.className = "tz-labels";
    layer.hidden = true;
    layer.setAttribute("aria-hidden", "true");
    for (const anchor of labelAnchors(zones)) {
      const el = document.createElement("span");
      el.className = "tz-label";
      el.textContent = formatUtcOffset(anchor.offset);
      el.hidden = true;
      layer.appendChild(el);
      const position = latLngToVector3(
        anchor.label[1],
        anchor.label[0],
        this.radius
      );
      this.labels.push({
        el,
        position,
        normal: position.clone().normalize(),
      });
    }
    (document.querySelector("#app") ?? document.body).appendChild(layer);
    this.labelLayer = layer;
  }
}
