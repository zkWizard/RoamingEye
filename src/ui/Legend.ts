import { LAYERS, type LayerId } from "../lib/timeline";
import { LEGENDS, gradientCss, overlayKeyFor } from "../lib/legend";

/**
 * A compact key for the active data layer: a color-scale bar with end labels
 * and a one-line plain-language description, so first-time visitors know what
 * the colors on the globe mean without hunting for tooltips. Overlays with
 * color-coded markers (quakes, volcanoes) contribute their own key rows
 * while toggled on.
 */
export class Legend {
  private readonly measures: HTMLSpanElement;
  private readonly bar: HTMLDivElement;
  private readonly minLabel: HTMLSpanElement;
  private readonly maxLabel: HTMLSpanElement;
  private readonly caption: HTMLParagraphElement;
  private readonly keys: HTMLDivElement;
  private readonly keyRows = new Map<string, HTMLElement>();
  private readonly classes: HTMLDivElement;
  private scaleRow!: HTMLElement;

  constructor(container: HTMLElement, initial: LayerId) {
    container.classList.add("legend");

    const scale = document.createElement("div");
    scale.className = "legend__scale";

    this.minLabel = document.createElement("span");
    this.minLabel.className = "legend__end";

    this.bar = document.createElement("div");
    this.bar.className = "legend__bar";
    this.bar.setAttribute("role", "img");

    this.maxLabel = document.createElement("span");
    this.maxLabel.className = "legend__end";

    scale.append(this.minLabel, this.bar, this.maxLabel);

    this.measures = document.createElement("span");
    this.measures.className = "legend__measures";

    this.caption = document.createElement("p");
    this.caption.className = "legend__caption";

    const row = document.createElement("div");
    row.className = "legend__row";
    row.append(this.measures, scale);

    this.classes = document.createElement("div");
    this.classes.className = "legend__classes";

    this.keys = document.createElement("div");
    this.keys.className = "legend__keys";

    container.append(row, this.classes, this.keys, this.caption);
    this.scaleRow = scale;
    this.setLayer(initial);
  }

  /**
   * Show or hide the color key for an overlay (driven by its toolbar
   * toggle). Overlays without a key are ignored.
   */
  setOverlayKey(id: string, on: boolean): void {
    const existing = this.keyRows.get(id);
    if (!on) {
      existing?.remove();
      this.keyRows.delete(id);
      return;
    }
    if (existing) return;
    const spec = overlayKeyFor(id);
    if (!spec) return;

    const key = document.createElement("div");
    key.className = "legend__key";

    const title = document.createElement("span");
    title.className = "legend__key-title";
    title.textContent = spec.title;
    key.append(title);

    for (const entry of spec.entries) {
      const item = document.createElement("span");
      item.className = "legend__key-item";
      const swatch = document.createElement("span");
      swatch.className = "legend__swatch";
      swatch.style.background = entry.color;
      const label = document.createElement("span");
      label.textContent = entry.label;
      item.append(swatch, label);
      key.append(item);
    }

    this.keys.append(key);
    this.keyRows.set(id, key);
  }

  /** Point the legend at a different data layer. */
  setLayer(id: LayerId): void {
    const spec = LEGENDS[id];
    this.measures.textContent = spec.measures;
    this.caption.textContent = LAYERS[id].description;

    // Categorical layers get named class swatches instead of a gradient bar.
    const categorical = spec.kind === "classes";
    this.scaleRow.hidden = categorical;
    this.classes.hidden = !categorical;
    this.classes.replaceChildren();
    if (categorical) {
      for (const entry of spec.classes) {
        const item = document.createElement("span");
        item.className = "legend__key-item";
        const swatch = document.createElement("span");
        swatch.className = "legend__swatch";
        swatch.style.background = entry.color;
        const label = document.createElement("span");
        label.textContent = entry.label;
        item.append(swatch, label);
        this.classes.append(item);
      }
      return;
    }

    this.bar.style.background = gradientCss(spec.stops);
    this.bar.setAttribute(
      "aria-label",
      `Color scale from ${spec.minLabel} to ${spec.maxLabel}`
    );
    this.minLabel.textContent = spec.minLabel;
    this.maxLabel.textContent = spec.maxLabel;
  }
}
