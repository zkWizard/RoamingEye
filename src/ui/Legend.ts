import { LAYERS, type LayerId } from "../lib/timeline";
import { LEGENDS, gradientCss } from "../lib/legend";

/**
 * A compact key for the active data layer: a color-scale bar with end labels
 * and a one-line plain-language description, so first-time visitors know what
 * the colors on the globe mean without hunting for tooltips.
 */
export class Legend {
  private readonly measures: HTMLSpanElement;
  private readonly bar: HTMLDivElement;
  private readonly minLabel: HTMLSpanElement;
  private readonly maxLabel: HTMLSpanElement;
  private readonly caption: HTMLParagraphElement;

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

    container.append(row, this.caption);
    this.setLayer(initial);
  }

  /** Point the legend at a different data layer. */
  setLayer(id: LayerId): void {
    const spec = LEGENDS[id];
    this.measures.textContent = spec.measures;
    this.bar.style.background = gradientCss(spec.stops);
    this.bar.setAttribute(
      "aria-label",
      `Color scale from ${spec.minLabel} to ${spec.maxLabel}`
    );
    this.minLabel.textContent = spec.minLabel;
    this.maxLabel.textContent = spec.maxLabel;
    this.caption.textContent = LAYERS[id].description;
  }
}
