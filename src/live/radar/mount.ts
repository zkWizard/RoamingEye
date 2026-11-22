import type { Group, PerspectiveCamera } from "three";
import { RadarDrape } from "./RadarDrape";

const RAINVIEWER_HOME = "https://www.rainviewer.com/";

/**
 * Play/pause chip for the radar loop. It is not the monthly timeline.
 */
export function mountRadar(
  parent: Group,
  slot: HTMLElement
): {
  update(camera: PerspectiveCamera, active: boolean): void;
} {
  const drape = new RadarDrape();
  parent.add(drape.object);
  let failed = false;

  const chip = document.createElement("div");
  chip.className = "radar-chip";
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "radar-chip__play";
  toggle.textContent = "Pause radar";
  toggle.setAttribute("aria-pressed", "true");
  const credit = document.createElement("a");
  credit.href = RAINVIEWER_HOME;
  credit.target = "_blank";
  credit.rel = "noopener";
  credit.textContent = "RainViewer";
  const legend = document.createElement("div");
  legend.className = "radar-legend";
  const light = document.createElement("span");
  light.textContent = "Light";
  const bar = document.createElement("div");
  bar.className = "radar-legend__bar";
  bar.setAttribute("role", "img");
  bar.setAttribute("aria-label", "Radar from light rain to heavy rain");
  const heavy = document.createElement("span");
  heavy.textContent = "Heavy";
  legend.append(light, bar, heavy);
  chip.append(toggle, legend, credit);
  slot.append(chip);

  toggle.addEventListener("click", () => {
    drape.toggle();
    const playing = drape.playing();
    toggle.textContent = playing ? "Pause radar" : "Play radar";
    toggle.setAttribute("aria-pressed", String(playing));
  });

  void drape.load().catch((err: unknown) => {
    console.warn("RoamingEye: radar loop failed to load", err);
    failed = true;
    chip.hidden = true;
  });

  return {
    update(camera, active) {
      chip.hidden = failed || !active;
      drape.update(camera, active);
    },
  };
}
