/**
 * Compass and the one-tap 3D button. Loaded after the first frame.
 */

export interface TiltUiHooks {
  getPitch: () => number;
  getHeading: () => number;
  toggle3d: () => void;
  northUp: () => void;
}

export function mountTiltUi(hooks: TiltUiHooks): void {
  if (document.querySelector(".tilt-dock")) return;
  const dock = document.createElement("div");
  dock.className = "tilt-dock";

  const compass = document.createElement("button");
  compass.type = "button";
  compass.className = "tilt-dock__compass";
  compass.title = "North up";
  compass.setAttribute("aria-label", "Point north up");
  compass.innerHTML = `<span class="tilt-dock__needle" aria-hidden="true">N</span>`;

  const tilt = document.createElement("button");
  tilt.type = "button";
  tilt.className = "tilt-dock__3d";
  tilt.textContent = "3D";
  tilt.title = "Tilt the view";
  tilt.setAttribute("aria-pressed", "false");
  tilt.setAttribute("aria-label", "Tilt the view");

  const paint = (): void => {
    const heading = hooks.getHeading();
    const needle = compass.querySelector<HTMLElement>(".tilt-dock__needle");
    if (needle) needle.style.transform = `rotate(${-heading}deg)`;
    const on = hooks.getPitch() >= 5;
    tilt.setAttribute("aria-pressed", on ? "true" : "false");
  };

  compass.addEventListener("click", () => {
    hooks.northUp();
    paint();
  });
  tilt.addEventListener("click", () => {
    hooks.toggle3d();
    paint();
  });

  dock.append(compass, tilt);
  const app = document.querySelector("#app");
  if (app) app.append(dock);
  else document.body.append(dock);
  paint();
  window.addEventListener("pointerup", paint);
}
