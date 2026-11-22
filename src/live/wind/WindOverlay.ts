import type { Group, PerspectiveCamera, WebGLRenderer } from "three";
import { vector3ToLatLng } from "../../lib/geo";
import type { MapOverlay } from "../../overlays/types";
import { cssRamp, SPEED_STOPS, TEMP_STOPS } from "./ramp";
import { formatWindReadout, updatedAgoLabel } from "./readout";
import { loadWindField } from "./loader";
import { sampleWind, type WindField } from "./field";
import { WindSimulation } from "./simulation";

/**
 * Live wind draped on the globe: a centre readout, a speed legend, and an
 * optional temperature colouring. The GPU work stays in this chunk.
 */
export async function mountWindOverlay(
  root: Group,
  renderer: WebGLRenderer
): Promise<MapOverlay> {
  const field = await loadWindField();
  const simulation = new WindSimulation(renderer, field);
  root.add(simulation.object);
  const hud = createHud(field);
  const host = document.querySelector("#app") ?? document.body;
  host.append(hud.root);
  let showTemperature = false;
  let lastReadout = "";
  let lastAgeAt = 0;
  let radar: {
    update(camera: PerspectiveCamera, active: boolean): void;
  } | null = null;
  void import("../radar/mount").then(
    ({ mountRadar }) => {
      radar = mountRadar(root, hud.extra);
    },
    () => {
      // Wind still runs if the radar chunk cannot load.
    }
  );

  hud.temperature.addEventListener("click", () => {
    showTemperature = !showTemperature;
    hud.temperature.setAttribute("aria-pressed", String(showTemperature));
    simulation.setColorMode(showTemperature ? "temperature" : "speed");
    paintRamp(hud, showTemperature);
  });

  return {
    id: "weather",
    label: "Weather now",
    detail: "Animated wind, coloured by speed",
    group: "live",
    icon: "",
    object: root,
    update(camera: PerspectiveCamera) {
      const active = root.visible && !document.hidden;
      hud.root.hidden = !root.visible;
      simulation.update(performance.now(), active, camera.position.length());
      radar?.update(camera, active);
      if (!active) return;
      const now = Date.now();
      if (now - lastAgeAt > 30_000) {
        lastAgeAt = now;
        hud.age.textContent = updatedAgoLabel(field.header.time, now);
      }
      const aim = vector3ToLatLng(camera.position);
      const sample = sampleWind(field, aim.lat, aim.lon);
      const text = sample
        ? formatWindReadout(sample, showTemperature)
        : "No wind at the map centre";
      if (text !== lastReadout) {
        lastReadout = text;
        hud.readout.textContent = text;
      }
    },
  };
}

interface Hud {
  root: HTMLElement;
  readout: HTMLElement;
  ramp: HTMLElement;
  low: HTMLElement;
  high: HTMLElement;
  age: HTMLElement;
  temperature: HTMLButtonElement;
  extra: HTMLElement;
}

function paintRamp(hud: Hud, temperature: boolean): void {
  const stops = temperature ? TEMP_STOPS : SPEED_STOPS;
  hud.ramp.style.background = cssRamp(stops);
  hud.low.textContent = temperature ? "Cold" : "Calm";
  hud.high.textContent = temperature ? "Hot" : "Strong";
  hud.ramp.setAttribute(
    "aria-label",
    temperature
      ? "Temperature from cold to hot"
      : "Wind speed from calm to strong"
  );
}

function createHud(field: WindField): Hud {
  const root = document.createElement("div");
  root.className = "weather-hud";
  root.hidden = true;

  const readout = document.createElement("p");
  readout.className = "weather-readout";
  readout.textContent = "Wind";

  const card = document.createElement("section");
  card.className = "weather-card";
  card.setAttribute("aria-label", "Wind now");

  const title = document.createElement("p");
  title.className = "weather-card__title";
  title.textContent = "Wind now";

  const scale = document.createElement("div");
  scale.className = "weather-card__scale";
  const low = document.createElement("span");
  const ramp = document.createElement("div");
  ramp.className = "weather-card__ramp";
  ramp.setAttribute("role", "img");
  const high = document.createElement("span");
  scale.append(low, ramp, high);

  const age = document.createElement("p");
  age.className = "weather-card__age";
  age.textContent = updatedAgoLabel(field.header.time, Date.now());

  const temperature = document.createElement("button");
  temperature.type = "button";
  temperature.className = "weather-card__temp";
  temperature.textContent = "Temperature colours";
  temperature.setAttribute("aria-pressed", "false");

  const extra = document.createElement("div");
  extra.className = "weather-card__extra";
  extra.dataset.weatherExtra = "";

  card.append(title, scale, age, temperature, extra);
  root.append(readout, card);

  const hud = { root, readout, ramp, low, high, age, temperature, extra };
  paintRamp(hud, false);
  return hud;
}
