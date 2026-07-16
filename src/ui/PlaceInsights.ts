import {
  PLACE_METRICS,
  type PlaceInsightReading,
  type PlaceMetricId,
} from "../lib/placeInsights";
import {
  MARINE_PLACE_METRIC,
  type MarinePlaceInsightReading,
} from "../lib/marinePlaceInsight";
import { GVP_VOLCANO_SOURCE } from "../lib/volcanoContext";
import type { VolcanoExtentContext } from "../lib/volcanoExtent";
import { ICONS } from "./icons";

interface MetricElements {
  value: HTMLElement;
  detail: HTMLElement;
}

/** A compact month-over-month readout for the exact boundary selected in search. */
export class PlaceInsights {
  private readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly metrics = new Map<
    PlaceMetricId | MarinePlaceInsightReading["id"],
    MetricElements
  >();
  private readonly downloadButton: HTMLButtonElement;
  private exportJson: string | undefined;
  private readonly volcanoValue: HTMLElement;
  private readonly volcanoDetail: HTMLElement;
  private readonly volcanoRecords: HTMLUListElement;
  private readonly volcanoSource: HTMLAnchorElement;

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
      "Latest monthly conditions and geology context for the selected place";
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
    for (const metric of [...PLACE_METRICS, MARINE_PLACE_METRIC]) {
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

    const volcanoes = document.createElement("section");
    volcanoes.className = "place-insights__geology";
    volcanoes.setAttribute("aria-label", "Volcano records in search extent");
    const volcanoTitle = document.createElement("h3");
    volcanoTitle.textContent = "Volcano records";
    this.volcanoValue = document.createElement("p");
    this.volcanoValue.className = "place-insights__value";
    this.volcanoValue.setAttribute("aria-live", "polite");
    this.volcanoDetail = document.createElement("p");
    this.volcanoDetail.className = "place-insights__detail";
    this.volcanoRecords = document.createElement("ul");
    this.volcanoRecords.className = "place-insights__volcano-list";
    this.volcanoSource = document.createElement("a");
    this.volcanoSource.className = "place-insights__source";
    this.volcanoSource.href = GVP_VOLCANO_SOURCE.url;
    this.volcanoSource.target = "_blank";
    this.volcanoSource.rel = "noopener";
    this.volcanoSource.textContent =
      "Source: Smithsonian Global Volcanism Program — Volcanoes of the World";
    volcanoes.append(
      volcanoTitle,
      this.volcanoValue,
      this.volcanoDetail,
      this.volcanoRecords,
      this.volcanoSource
    );

    const note = document.createElement("p");
    note.className = "place-insights__note";
    note.textContent =
      "Boundary-grid means from NASA imagery; very small or thin boundaries may be labelled as a single in-boundary point estimate. Products may publish on different monthly schedules.";

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

    container.append(header, grid, volcanoes, exportControls, note);
  }

  open(name: string): void {
    this.title.textContent = name;
    this.exportJson = undefined;
    this.downloadButton.disabled = true;
    for (const { value, detail } of this.metrics.values()) {
      value.textContent = "Sampling";
      detail.textContent = "Latest two available months";
    }
    this.setVolcanoLoading();
    this.root.classList.add("is-open");
    this.root.setAttribute("aria-hidden", "false");
  }

  close(): void {
    if (!this.root.classList.contains("is-open")) return;
    this.root.classList.remove("is-open");
    this.root.setAttribute("aria-hidden", "true");
    this.onClose();
  }

  setReading(reading: PlaceInsightReading | MarinePlaceInsightReading): void {
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

  setVolcanoLoading(): void {
    this.volcanoValue.textContent = "Loading GVP records";
    this.volcanoDetail.textContent =
      "Checking the bundled Smithsonian volcano dataset against the search bounding box";
    this.volcanoRecords.replaceChildren();
  }

  setVolcanoContext(
    context: VolcanoExtentContext,
    dataMonth: string | null = null
  ): void {
    this.volcanoRecords.replaceChildren();
    if (context.status === "invalid-bounds") {
      this.volcanoValue.textContent = "Search extent unavailable";
      this.volcanoDetail.textContent = context.geographicCoverage;
      return;
    }
    if (context.suppliedRecordCount === 0) {
      this.volcanoValue.textContent = "Bundled records unavailable";
      this.volcanoDetail.textContent =
        "The GVP-derived local dataset supplied zero valid records; no geographic comparison was made.";
      return;
    }

    const count = context.matchedRecordCount;
    this.volcanoValue.textContent =
      count === 0
        ? "No records"
        : `${count} ${count === 1 ? "record" : "records"}`;
    const snapshot = dataMonth
      ? ` Bundled GVP snapshot retrieved ${dataMonth} (UTC).`
      : " Bundled snapshot retrieval month unavailable.";
    this.volcanoDetail.textContent =
      count === 0
        ? `No bundled GVP volcano records have coordinates inside this search bounding box.${snapshot}`
        : `${context.geographicCoverage}${snapshot}`;
    for (const record of context.records.slice(0, 5)) {
      const item = document.createElement("li");
      const details = [
        record.country,
        record.primaryType ?? "primary type not supplied",
        record.elevationMeters === null
          ? "elevation not supplied"
          : `${record.elevationMeters} m elevation`,
        record.lastEruptionText,
      ].filter(Boolean);
      item.textContent = `${record.name}: ${details.join("; ")}`;
      this.volcanoRecords.appendChild(item);
    }
    if (count > 5) {
      const item = document.createElement("li");
      item.textContent = `${count - 5} additional records not listed`;
      this.volcanoRecords.appendChild(item);
    }
  }

  setVolcanoUnavailable(): void {
    this.volcanoRecords.replaceChildren();
    this.volcanoValue.textContent = "Records unavailable";
    this.volcanoDetail.textContent =
      "The bundled GVP-derived volcano data could not be loaded for this search.";
  }
}
