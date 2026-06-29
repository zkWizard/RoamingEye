import { LAYERS, LAYER_ORDER, type LayerId } from "../lib/timeline";

/**
 * A small segmented control for choosing which seasonal data layer the globe
 * and timeline display.
 */
export class LayerSelector {
  private readonly buttons = new Map<LayerId, HTMLButtonElement>();
  private current: LayerId;

  constructor(
    container: HTMLElement,
    initial: LayerId,
    onChange: (id: LayerId) => void
  ) {
    this.current = initial;
    container.classList.add("layer-selector");
    container.setAttribute("role", "group");
    container.setAttribute("aria-label", "Data layer");

    for (const id of LAYER_ORDER) {
      const layer = LAYERS[id];
      const button = document.createElement("button");
      button.type = "button";
      button.className = "layer-selector__btn";
      button.textContent = layer.label;
      button.title = layer.description;
      button.setAttribute("aria-pressed", String(id === initial));
      button.addEventListener("click", () => {
        if (id === this.current) return;
        this.select(id);
        onChange(id);
      });
      this.buttons.set(id, button);
      container.appendChild(button);
    }
  }

  private select(id: LayerId): void {
    this.current = id;
    for (const [buttonId, button] of this.buttons) {
      button.setAttribute("aria-pressed", String(buttonId === id));
    }
  }
}
