import {
  PLACE_METRICS,
  type PlaceInsightReading,
  type PlaceMetricId,
} from "../lib/placeInsights";
import { ICONS } from "./icons";

interface MetricElements {
  value: HTMLElement;
  detail: HTMLElement;
}

/** A compact month-over-month readout for the exact boundary selected in search. */
export class PlaceInsights {
  private readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly metrics = new Map<PlaceMetricId, MetricElements>();

  constructor(
    container: HTMLElement,
    private readonly onClose: () => void
  ) {
    this.root = container;
    container.classList.add("place-insights");
    container.setAttribute("role", "region");
    container.setAttribute("aria-label", "Place insights");
    container.setAttribute("aria-hidden", "true");

    const header = document.createElement("header");
    header.className = "place-insights__header";
    const heading = document.createElement("div");
    this.title = document.createElement("h2");
    this.title.className = "place-insights__title";
    const subtitle = document.createElement("p");
    subtitle.className = "place-insights__subtitle";
    subtitle.textContent =
      "Latest monthly conditions inside the selected boundary";
    heading.append(this.title, subtitle);

    const close = document.createElement("button");
    close.type = "button";
    close.className = "place-insights__close";
    close.title = "Close place insights";
    close.setAttribute("aria-label", "Close place insights");
    close.innerHTML = ICONS.close;
    close.addEventListener("click", () => this.close());
    header.append(heading, close);

    const grid = document.createElement("section");
    grid.className = "place-insights__grid";
    grid.setAttribute("aria-label", "Monthly conditions");
    for (const metric of PLACE_METRICS) {
      const card = document.createElement("article");
      card.className = "place-insights__metric";
      const label = document.createElement("h3");
      label.textContent = metric.label;
      const value = document.createElement("p");
      value.className = "place-insights__value";
      const detail = document.createElement("p");
      detail.className = "place-insights__detail";
      card.append(label, value, detail);
      grid.appendChild(card);
      this.metrics.set(metric.id, { value, detail });
    }

    const note = document.createElement("p");
    note.className = "place-insights__note";
    note.textContent =
      "Boundary-grid means from NASA imagery; very small or thin boundaries may be labelled as a single in-boundary point estimate. Products may publish on different monthly schedules.";
    container.append(header, grid, note);
  }

  open(name: string): void {
    this.title.textContent = name;
    for (const { value, detail } of this.metrics.values()) {
      value.textContent = "Sampling";
      detail.textContent = "Latest two available months";
    }
    this.root.classList.add("is-open");
    this.root.setAttribute("aria-hidden", "false");
  }

  close(): void {
    if (!this.root.classList.contains("is-open")) return;
    this.root.classList.remove("is-open");
    this.root.setAttribute("aria-hidden", "true");
    this.onClose();
  }

  setReading(reading: PlaceInsightReading): void {
    const metric = this.metrics.get(reading.id);
    if (!metric) return;
    metric.value.textContent = reading.value;
    metric.detail.textContent = reading.detail;
  }
}
