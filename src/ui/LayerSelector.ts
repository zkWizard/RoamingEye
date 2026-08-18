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
  /** Option buttons in visual order, for arrow-key navigation. */
  private readonly optionOrder: HTMLButtonElement[] = [];
  private selected: LayerId;

  constructor(
    container: HTMLElement,
    initial: LayerId,
    onChange: (id: LayerId) => void
  ) {
    this.container = container;
    this.selected = initial;
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
    // A role=listbox is an ARIA input and must carry an accessible name
    // (WCAG 4.1.2) — the first violation the axe gate caught.
    this.panel.setAttribute("aria-label", "Data layer");
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
        const name = document.createElement("span");
        name.className = "layer-selector__option-name";
        name.textContent = LAYERS[id].label;
        // The layer's caption is its instrument and its qualifier — "not a
        // monthly mean", "not root zone" — and `.legend__caption` drops it
        // below 541px wide, where the HUD has no room for it. `title` was the
        // only other copy, and a touch screen cannot hover, so a phone reader
        // could not reach it at all. This second line is that same string,
        // shown at exactly the widths the legend drops it (style.css). It
        // costs the HUD nothing: the panel is absolutely positioned and
        // scrolls itself, so the height goes to the dropdown, not the globe.
        // It stays inside the button rather than moving to aria-describedby so
        // the qualifier is announced with the choice it qualifies, and so the
        // visible text and the accessible name stay identical.
        const description = document.createElement("span");
        description.className = "layer-selector__option-desc";
        description.textContent = LAYERS[id].description;
        option.append(name, description);
        option.title = LAYERS[id].description;
        option.addEventListener("click", () => {
          this.select(id);
          this.close({ restoreFocus: true });
          onChange(id);
        });
        this.options.set(id, option);
        this.optionOrder.push(option);
        group.appendChild(option);
      }
      this.panel.appendChild(group);
    }
    container.appendChild(this.panel);

    this.trigger.addEventListener("click", () => this.toggle());
    // Listbox keyboard support: arrows move focus (wrapping), Home/End jump;
    // Enter/Space activate natively (the options are buttons), Esc closes.
    this.panel.addEventListener("keydown", (e) => {
      const current = this.optionOrder.indexOf(
        document.activeElement as HTMLButtonElement
      );
      let next: number;
      switch (e.key) {
        case "ArrowDown":
          next = (current + 1) % this.optionOrder.length;
          break;
        case "ArrowUp":
          next =
            (current - 1 + this.optionOrder.length) % this.optionOrder.length;
          break;
        case "Home":
          next = 0;
          break;
        case "End":
          next = this.optionOrder.length - 1;
          break;
        default:
          return;
      }
      e.preventDefault();
      this.optionOrder[next]?.focus();
    });
    // A pointer press outside closes, but must NOT claim focus: the press is
    // on its way to focusing whatever was clicked.
    document.addEventListener("pointerdown", (e) => {
      if (!container.contains(e.target as Node)) this.close();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.close({ restoreFocus: true });
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
    this.options.get(this.selected)?.focus();
  }

  /**
   * Close the panel. The panel is `display: none` when closed, so focus left
   * inside it falls to `<body>` and the tab ring restarts from the top of the
   * document — 28 Tabs back to this trigger, measured at 1280x900. Any close
   * the keyboard drove (Esc, or activating an option) therefore hands focus
   * back to the trigger that opened the panel; a pointer press outside does
   * not, because that press is already on its way to focusing its own target.
   */
  private close({ restoreFocus = false } = {}): void {
    if (!this.panel.classList.contains("is-open")) return;
    const hadFocusInside = this.panel.contains(document.activeElement);
    this.panel.classList.remove("is-open");
    this.trigger.setAttribute("aria-expanded", "false");
    if (restoreFocus && hadFocusInside) this.trigger.focus();
  }

  private select(id: LayerId): void {
    this.selected = id;
    this.current.textContent = LAYERS[id].label;
    for (const [optionId, button] of this.options) {
      button.setAttribute("aria-selected", String(optionId === id));
    }
    this.container.dataset.category = LAYERS[id].category;
  }
}
