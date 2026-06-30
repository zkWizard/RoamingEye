import { LAYERS, layersByCategory, type LayerId } from "../lib/timeline";

/**
 * A grouped dropdown for choosing the active data layer. A trigger button shows
 * the current layer; clicking opens a panel listing every layer grouped by
 * scientific category. Scales cleanly as the dataset grows.
 */
export class LayerSelector {
  private readonly container: HTMLElement;
  private readonly trigger: HTMLButtonElement;
  private readonly current: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly options = new Map<LayerId, HTMLButtonElement>();

  constructor(
    container: HTMLElement,
    initial: LayerId,
    onChange: (id: LayerId) => void
  ) {
    this.container = container;
    container.classList.add("layer-selector");

    this.trigger = document.createElement("button");
    this.trigger.type = "button";
    this.trigger.className = "layer-selector__trigger";
    this.trigger.setAttribute("aria-haspopup", "listbox");
    this.trigger.setAttribute("aria-expanded", "false");
    this.current = document.createElement("span");
    this.current.className = "layer-selector__current";
    const chevron = document.createElement("span");
    chevron.className = "layer-selector__chevron";
    chevron.setAttribute("aria-hidden", "true");
    chevron.textContent = "▾";
    this.trigger.append(this.current, chevron);
    container.appendChild(this.trigger);

    this.panel = document.createElement("div");
    this.panel.className = "layer-selector__panel";
    this.panel.setAttribute("role", "listbox");
    for (const { category, ids } of layersByCategory()) {
      const group = document.createElement("div");
      group.className = "layer-selector__group";
      const title = document.createElement("div");
      title.className = "layer-selector__group-title";
      title.textContent = category;
      group.appendChild(title);
      for (const id of ids) {
        const option = document.createElement("button");
        option.type = "button";
        option.className = "layer-selector__option";
        option.setAttribute("role", "option");
        option.textContent = LAYERS[id].label;
        option.title = LAYERS[id].description;
        option.addEventListener("click", () => {
          this.select(id);
          this.close();
          onChange(id);
        });
        this.options.set(id, option);
        group.appendChild(option);
      }
      this.panel.appendChild(group);
    }
    container.appendChild(this.panel);

    this.trigger.addEventListener("click", () => this.toggle());
    document.addEventListener("pointerdown", (e) => {
      if (!container.contains(e.target as Node)) this.close();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.close();
    });

    this.select(initial);
  }

  private toggle(): void {
    if (this.panel.classList.contains("is-open")) this.close();
    else this.open();
  }

  private open(): void {
    this.panel.classList.add("is-open");
    this.trigger.setAttribute("aria-expanded", "true");
  }

  private close(): void {
    this.panel.classList.remove("is-open");
    this.trigger.setAttribute("aria-expanded", "false");
  }

  private select(id: LayerId): void {
    this.current.textContent = LAYERS[id].label;
    for (const [optionId, button] of this.options) {
      button.setAttribute("aria-selected", String(optionId === id));
    }
    this.container.dataset.category = LAYERS[id].category;
  }
}
