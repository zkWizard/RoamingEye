import {
  serializePlaceObservationExport,
  type PlaceObservationExportInput,
} from "../lib/placeObservationExport";

/**
 * Explicit, local-only download control for a selected place's reproducible
 * observations. The download is unavailable until all displayed independent
 * signals have calibrated source values and provenance.
 */
export class PlaceObservationExportControl {
  private readonly button: HTMLButtonElement;
  private readonly status: HTMLElement;
  private json: string | undefined;

  constructor(container: HTMLElement) {
    const section = document.createElement("section");
    section.className = "place-insights__export";
    section.setAttribute("aria-label", "Place observation export");
    const heading = document.createElement("h3");
    heading.textContent = "Observation export";
    const description = document.createElement("p");
    description.className = "place-insights__detail";
    description.id = "place-observation-export-description";
    description.textContent =
      "Download sampled monthly observations, source citations, coverage, and method. No place name or search query is included.";
    this.button = document.createElement("button");
    this.button.type = "button";
    this.button.className = "place-insights__export-button";
    this.button.textContent = "Preparing export";
    this.button.disabled = true;
    this.button.setAttribute("aria-describedby", description.id);
    this.button.addEventListener("click", () => this.download());
    this.status = document.createElement("p");
    this.status.className = "place-insights__export-status";
    this.status.setAttribute("role", "status");
    this.status.setAttribute("aria-live", "polite");
    this.status.textContent =
      "Waiting for four independently sampled source products.";
    section.append(heading, description, this.button, this.status);
    container.appendChild(section);
  }

  setPending(): void {
    this.json = undefined;
    this.button.disabled = true;
    this.button.textContent = "Preparing export";
    this.status.textContent =
      "Waiting for four independently sampled source products.";
  }

  setAvailable(input: PlaceObservationExportInput): void {
    this.json = serializePlaceObservationExport(input);
    this.button.disabled = false;
    this.button.textContent = "Download observations (JSON)";
    this.status.textContent =
      "Ready: four source products retain their own months, native units, and sampled coverage.";
  }

  setUnavailable(reason: string): void {
    this.json = undefined;
    this.button.disabled = true;
    this.button.textContent = "Observation export unavailable";
    this.status.textContent = reason;
  }

  private download(): void {
    if (!this.json) return;
    const blob = new Blob([this.json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `roamingeye_place-observations_${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    this.status.textContent =
      "Download started. The file contains source observations and provenance only.";
  }
}
