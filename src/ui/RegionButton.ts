import { ICONS } from "./icons";

/**
 * The "Draw region" toggle (top-left, under the theme toggle). Arms the
 * RegionDrawer; pressed state mirrors the drawer so canceling from either
 * side stays in sync.
 */
export class RegionButton {
  private readonly button: HTMLButtonElement;

  constructor(container: HTMLElement, onToggle: (on: boolean) => void) {
    container.classList.add("draw");
    this.button = document.createElement("button");
    this.button.type = "button";
    this.button.className = "draw-button";
    this.button.setAttribute("aria-pressed", "false");
    this.button.title = "Draw a study region and chart its monthly mean";
    this.button.innerHTML = `<span class="draw-button__icon">${ICONS.draw}</span><span>Draw region</span>`;
    this.button.addEventListener("click", () => {
      const on = this.button.getAttribute("aria-pressed") !== "true";
      this.setActive(on);
      onToggle(on);
    });
    container.appendChild(this.button);
  }

  setActive(on: boolean): void {
    this.button.setAttribute("aria-pressed", String(on));
  }
}
