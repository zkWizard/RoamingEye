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
  private readonly downloadButton: HTMLButtonElement;
  private exportJson: string | undefined;

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
      "Regional means from NASA imagery; products may publish on different monthly schedules.";

    const exportControls = document.createElement("div");
    exportControls.className = "place-insights__export";
    this.downloadButton = document.createElement("button");
    this.downloadButton.type = "button";
    this.downloadButton.className = "place-insights__download";
    this.downloadButton.textContent = "Download observation JSON";
    this.downloadButton.disabled = true;
    this.downloadButton.addEventListener("click", () =>
      this.downloadObservationJson()
    );
    const exportNote = document.createElement("p");
    exportNote.className = "place-insights__export-note";
    exportNote.textContent =
      "Includes the selected boundary, cited products, native units, data months, and sampling coverage.";
    exportControls.append(this.downloadButton, exportNote);

    container.append(header, grid, exportControls, note);
  }

  open(name: string): void {
    this.title.textContent = name;
    this.exportJson = undefined;
    this.downloadButton.disabled = true;
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

  /** Enable an explicit, user-triggered reproducibility export after sampling. */
  setObservationExport(json: string): void {
    this.exportJson = json;
    this.downloadButton.disabled = false;
  }

  private downloadObservationJson(): void {
    if (!this.exportJson) return;
    const blob = new Blob([this.exportJson], { type: "application/json" });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    // Keep the searched place out of the filename; it may be personal context.
    anchor.download = "roamingeye-place-observations.json";
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  }
}
