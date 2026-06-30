import type { MapOverlay } from "../overlays/types";

/**
 * A vertical toolbar of icon + label toggles, one per map overlay. Reflects and
 * flips each overlay's on/off state.
 */
export class Toolbar {
  constructor(
    container: HTMLElement,
    overlays: MapOverlay[],
    onToggle: (overlay: MapOverlay, on: boolean) => void
  ) {
    container.classList.add("toolbar");
    container.setAttribute("role", "group");
    container.setAttribute("aria-label", "Map overlays");

    for (const overlay of overlays) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "toolbar__item";
      button.title = overlay.label;
      button.setAttribute("aria-pressed", String(Boolean(overlay.defaultOn)));
      button.innerHTML =
        `<span class="toolbar__icon">${overlay.icon}</span>` +
        `<span class="toolbar__label">${overlay.label}</span>`;

      button.addEventListener("click", () => {
        const on = button.getAttribute("aria-pressed") !== "true";
        button.setAttribute("aria-pressed", String(on));
        onToggle(overlay, on);
      });

      container.appendChild(button);
    }
  }
}
