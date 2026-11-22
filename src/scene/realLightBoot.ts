import {
  type DirectionalLight,
  type Material,
  type Mesh,
  type Object3D,
  type Scene,
} from "three";
import {
  LAYERS,
  monthRangeForLayer,
  type LayerId,
  type YearMonth,
} from "../lib/timeline";
import { decodeViewState } from "../lib/viewState";
import { parseSession, SESSION_STORAGE_KEY } from "../lib/sessionState";
import type { IlluminationQuery, MonthRef } from "../lib/solar";
import { attachSun, type TerrainLightTarget } from "./Sun";

/**
 * Settings toggles and the share-link flag for real sun lighting.
 * Loaded after the first paint so the entry chunk does not carry them.
 */

const STORAGE_KEY = "roamingeye:real-light";

export interface LightChoice {
  real: boolean;
  science: boolean;
}

/** Empty when the choice is the default (satellite lit, science flat). */
export function formatLightQuery(choice: LightChoice): string {
  if (!choice.real) return "light=off";
  if (choice.science) return "light=science";
  return "";
}

/** Null when the hash does not name a real-light choice. */
export function parseLightQuery(hash: string): LightChoice | null {
  let light: string | null;
  try {
    light = new URLSearchParams(hash.replace(/^#/, "")).get("light");
  } catch {
    return null;
  }
  if (light === "off") return { real: false, science: false };
  if (light === "science") return { real: true, science: true };
  return null;
}

export function readStoredLight(): LightChoice | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const json = JSON.parse(raw) as Record<string, unknown>;
    if (typeof json.real !== "boolean") return null;
    return {
      real: json.real,
      science: json.science === true,
    };
  } catch {
    return null;
  }
}

export function writeStoredLight(choice: LightChoice): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(choice));
  } catch {
    // Private mode. The toggles still work for this visit.
  }
}

const SUN_ICON =
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
  `<circle cx="12" cy="12" r="4"/>` +
  `<path d="M12 2.5v2M12 19.5v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2.5 12h2M19.5 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>` +
  `</svg>`;

function settingsButton(
  id: string,
  label: string,
  detail: string,
  on: boolean,
  onToggle: (on: boolean) => void
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "toolbar__item";
  button.dataset.overlay = id;
  button.title = `${label}: ${detail}`;
  button.setAttribute("aria-pressed", String(on));
  button.innerHTML =
    `<span class="toolbar__icon">${SUN_ICON}</span>` +
    `<span class="toolbar__text"><span class="toolbar__label">${label}</span>` +
    `<span class="toolbar__detail">${detail}</span></span>`;
  button.addEventListener("click", () => {
    const next = button.getAttribute("aria-pressed") !== "true";
    button.setAttribute("aria-pressed", String(next));
    onToggle(next);
  });
  return button;
}

function mountSettings(buttons: HTMLButtonElement[]): void {
  const list = document.querySelector(
    ".toolbar__fold--settings .toolbar__list"
  );
  if (!list) return;
  const atmosphere = list.querySelector('[data-overlay="atmosphere"]');
  for (const button of buttons) {
    if (atmosphere) list.insertBefore(button, atmosphere);
    else list.appendChild(button);
  }
}

/**
 * Noon on the 15th when a monthly layer is showing, otherwise the wall clock.
 * Annual and static layers are not a month.
 */
export function clockForLayer(input: {
  now: Date;
  month: MonthRef;
  staticLayer: boolean;
  annual: boolean;
  scienceDrawn: boolean;
}): IlluminationQuery {
  return {
    now: input.now,
    month: input.month,
    monthlyLayerVisible:
      !input.staticLayer && !input.annual && input.scienceDrawn,
  };
}

interface SceneSun extends TerrainLightTarget {
  scienceDraped: boolean;
}

function appendLight(url: string, query: string): string {
  if (!query || url.includes("light=")) return url;
  const hash = url.indexOf("#");
  if (hash < 0) return url;
  const joiner = url.length > hash + 1 ? "&" : "";
  return `${url}${joiner}${query}`;
}

function watchShareLink(choice: () => LightChoice): void {
  const original = history.replaceState.bind(history);
  history.replaceState = (state, title, url) => {
    const query = formatLightQuery(choice());
    const next = typeof url === "string" ? appendLight(url, query) : url;
    return original(state, title, next);
  };
  const clipboard = navigator.clipboard;
  if (!clipboard) return;
  const write = clipboard.writeText.bind(clipboard);
  clipboard.writeText = (text: string) =>
    write(appendLight(text, formatLightQuery(choice())));
}

function activeMonth(): { layerId: LayerId; month: YearMonth } {
  const view = decodeViewState(window.location.hash);
  let storedLayer: LayerId | undefined;
  let storedMonth: YearMonth | undefined;
  try {
    const session = parseSession(
      window.localStorage.getItem(SESSION_STORAGE_KEY)
    );
    storedLayer = session.layer;
    storedMonth = session.month;
  } catch {
    // Storage can throw. The hash and the default layer still work.
  }
  const layerId = view.layer ?? storedLayer ?? "ndvi";
  const layer = LAYERS[layerId];
  const months = monthRangeForLayer(layer);
  const month = view.month ??
    storedMonth ??
    months[months.length - 1] ?? {
      year: 2000,
      month: 1,
    };
  return { layerId, month };
}

/**
 * Find the sun and the science sphere on the live scene. Called from the
 * terrain chunk, which is already off the entry path.
 */
export function bootFromScene(scene: Scene, terrain: SceneSun): void {
  let sunLight: DirectionalLight | undefined;
  let earthMaterial: Material | undefined;
  let scienceRoot: Object3D | undefined;
  for (const child of scene.children) {
    if ((child as DirectionalLight).isDirectionalLight && !sunLight) {
      sunLight = child as DirectionalLight;
    }
    const mesh = child as Mesh;
    if (
      mesh.isMesh &&
      !Array.isArray(mesh.material) &&
      mesh.material.type === "MeshStandardMaterial"
    ) {
      earthMaterial = mesh.material;
    }
    if (child.name === "hd-tiles") scienceRoot = child;
  }
  if (!sunLight || !earthMaterial) return;

  const fromHash = parseLightQuery(window.location.hash);
  let choice = fromHash ?? readStoredLight() ?? { real: true, science: false };
  if (fromHash) writeStoredLight(choice);
  const current = (): LightChoice => choice;

  watchShareLink(current);
  scene.add(sunLight.target);

  const persist = (): void => {
    writeStoredLight(choice);
    const hash = window.location.hash.replace(/^#/, "");
    const query = formatLightQuery(choice);
    const next = appendLight(hash ? `#${hash}` : "#", query);
    history.replaceState(null, "", next);
  };
  mountSettings([
    settingsButton(
      "real-light",
      "Real light",
      "Day, night, and twilight on the satellite map",
      choice.real,
      (on) => {
        choice = { ...choice, real: on };
        persist();
      }
    ),
    settingsButton(
      "science-light",
      "Light the data",
      "Also shade data layers. Off keeps their colours exact",
      choice.science,
      (on) => {
        choice = { ...choice, science: on };
        persist();
      }
    ),
  ]);

  const clock = (): IlluminationQuery => {
    const { layerId, month } = activeMonth();
    const layer = LAYERS[layerId];
    return clockForLayer({
      now: new Date(),
      month,
      staticLayer: layer.static === true,
      annual: layer.cadence === "annual",
      scienceDrawn: earthMaterial.colorWrite !== false || terrain.scienceDraped,
    });
  };

  attachSun({
    scene,
    sunLight,
    earthMaterial,
    getTerrain: () => terrain,
    getScienceRoot: () => scienceRoot ?? scene,
    getClock: clock,
    getRealLight: () => choice.real,
    getScienceLight: () => choice.science,
  });
}
