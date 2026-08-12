import {
  PLACE_METRICS,
  type PlaceInsightReading,
  type PlaceMetricId,
} from "../lib/placeInsights";
import {
  MARINE_PLACE_METRIC,
  type MarinePlaceInsightReading,
} from "../lib/marinePlaceInsight";
import {
  AEROSOL_PLACE_METRIC,
  type AerosolPlaceInsightReading,
} from "../lib/aerosolPlaceInsight";
import {
  GVP_VOLCANO_SOURCE,
  gvpVolcanoSourceLabel,
} from "../lib/volcanoContext";
import {
  volcanoCoordinateLabel,
  type VolcanoExtentContext,
} from "../lib/volcanoExtent";
import {
  USGS_M45_MONTH_SOURCE,
  type EarthquakePlaceContext,
  type NearbyEarthquakeObservation,
} from "../lib/earthquakeContext";
import {
  nearestVolcanoStatement,
  type VolcanoProximityContext,
} from "../lib/volcanoProximityContext";

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
    | PlaceMetricId
    | MarinePlaceInsightReading["id"]
    | AerosolPlaceInsightReading["id"],
    MetricElements
  >();
  private readonly downloadButton: HTMLButtonElement;
  private exportJson: string | undefined;
  private readonly volcanoValue: HTMLElement;
  private readonly volcanoDetail: HTMLElement;
  private readonly volcanoRecords: HTMLUListElement;
  private readonly volcanoSource: HTMLAnchorElement;
  private readonly seismicityValue: HTMLElement;
  private readonly seismicityDetail: HTMLElement;
  private readonly seismicityRecords: HTMLUListElement;

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
    for (const metric of [
      ...PLACE_METRICS,
      MARINE_PLACE_METRIC,
      AEROSOL_PLACE_METRIC,
    ]) {
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
    this.volcanoSource.textContent = `Source: ${gvpVolcanoSourceLabel()}`;
    volcanoes.append(
      volcanoTitle,
      this.volcanoValue,
      this.volcanoDetail,
      this.volcanoRecords,
      this.volcanoSource
    );

    const seismicity = document.createElement("section");
    seismicity.className = "place-insights__geology";
    seismicity.setAttribute("aria-label", "Recent earthquakes near this place");
    const seismicityTitle = document.createElement("h3");
    seismicityTitle.textContent = "Recent seismicity";
    this.seismicityValue = document.createElement("p");
    this.seismicityValue.className = "place-insights__value";
    this.seismicityValue.setAttribute("aria-live", "polite");
    this.seismicityDetail = document.createElement("p");
    this.seismicityDetail.className = "place-insights__detail";
    this.seismicityRecords = document.createElement("ul");
    this.seismicityRecords.className = "place-insights__record-list";
    const seismicitySource = document.createElement("a");
    seismicitySource.className = "place-insights__source";
    seismicitySource.href = USGS_M45_MONTH_SOURCE.url;
    seismicitySource.target = "_blank";
    seismicitySource.rel = "noopener";
    seismicitySource.textContent = `Source: ${USGS_M45_MONTH_SOURCE.name} — M${USGS_M45_MONTH_SOURCE.minimumMagnitude}+, ${USGS_M45_MONTH_SOURCE.feedWindow}`;
    seismicity.append(
      seismicityTitle,
      this.seismicityValue,
      this.seismicityDetail,
      this.seismicityRecords,
      seismicitySource
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

    container.append(header, grid, volcanoes, seismicity, exportControls, note);
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
    this.setSeismicityLoading();
    this.root.classList.add("is-open");
    this.root.setAttribute("aria-hidden", "false");
  }

  close(): void {
    if (!this.root.classList.contains("is-open")) return;
    this.root.classList.remove("is-open");
    this.root.setAttribute("aria-hidden", "true");
    this.onClose();
  }

  setReading(
    reading:
      | PlaceInsightReading
      | MarinePlaceInsightReading
      | AerosolPlaceInsightReading
  ): void {
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

  /**
   * `proximity` supplies the nearest catalogued volcano inside a fixed, stated
   * radius. It is only read when the bounding box matched nothing: a search
   * extent is sized by the geocoder, so an empty inventory says more about the
   * boundary than about the geology.
   */
  setVolcanoContext(
    context: VolcanoExtentContext,
    dataMonth: string | null = null,
    proximity: VolcanoProximityContext | null = null
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
    const nearest =
      count === 0 && proximity ? nearestVolcanoStatement(proximity) : null;
    this.volcanoDetail.textContent =
      count === 0
        ? `No bundled GVP volcano records have coordinates inside this search bounding box.${nearest ? ` ${nearest}` : ""}${snapshot}`
        : `${context.geographicCoverage} Summit elevation is supplied for ${context.elevationCoverage.presentCount} of ${count} matched ${count === 1 ? "record" : "records"} in metres relative to sea level.${snapshot}`;
    for (const record of context.records.slice(0, 5)) {
      const item = document.createElement("li");
      const details = [
        record.country,
        record.subregion ?? record.region,
        volcanoCoordinateLabel(record),
        record.primaryType ?? "primary type not supplied",
        record.elevationMeters === null
          ? "elevation not supplied"
          : `${record.elevationMeters} m elevation`,
        record.lastEruptionText,
        record.tectonicSetting
          ? `GVP tectonic setting: ${record.tectonicSetting}`
          : "tectonic setting not supplied",
      ].filter(Boolean);
      const label = `${record.name}: ${details.join("; ")}`;
      if (record.sourceUrl) {
        const link = document.createElement("a");
        link.href = record.sourceUrl;
        link.target = "_blank";
        link.rel = "noopener";
        link.textContent = record.name;
        link.setAttribute(
          "aria-label",
          `${record.name} — Smithsonian GVP volcano record`
        );
        item.append(link, `: ${details.join("; ")}`);
      } else {
        item.textContent = label;
      }
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

  setSeismicityLoading(): void {
    this.seismicityValue.textContent = "Loading USGS events";
    this.seismicityDetail.textContent =
      "Checking the live USGS M4.5+ 30-day feed against this search extent";
    this.seismicityRecords.replaceChildren();
  }

  /**
   * Render nearby recorded seismicity. Deliberately descriptive: an event count
   * is a record of what the feed observed in a rolling 30-day window, never a
   * hazard rating, and an empty result is reported as "no recorded events",
   * not as a quiet or safe place.
   */
  setSeismicityContext(context: EarthquakePlaceContext): void {
    this.seismicityRecords.replaceChildren();
    const { coverage, query } = context;

    if (coverage.status === "invalid-query") {
      this.seismicityValue.textContent = "Search extent unavailable";
      this.seismicityDetail.textContent =
        "This place supplied no usable bounding box, so no radial search was run against the USGS feed.";
      return;
    }
    if (coverage.status === "no-usable-events") {
      this.setSeismicityUnavailable();
      this.seismicityDetail.textContent =
        "The USGS feed supplied no valid events, so no comparison with this search extent was made.";
      return;
    }

    const count = coverage.matchedEventCount;
    const radius = formatRadiusKm(query.radiusKm);
    this.seismicityValue.textContent =
      count === 0
        ? "No recorded events"
        : `${count} ${count === 1 ? "event" : "events"}`;
    // The radial query circumscribes the rectangular search extent, so the
    // circle reaches past the boundary corners. Say "near", never "inside".
    const scope = `Epicentres within ${radius} km of the search-extent centre — a circle circumscribing the extent, so it reaches past the boundary corners.`;
    this.seismicityDetail.textContent =
      count === 0
        ? `${scope} No M4.5+ events recorded in the feed window; that does not establish the area is seismically quiet.`
        : `${scope} Counted from ${coverage.validEventCount} valid events in the global feed.`;

    for (const observation of context.observations.slice(0, 5)) {
      this.seismicityRecords.appendChild(seismicityListItem(observation));
    }
    if (count > 5) {
      const item = document.createElement("li");
      item.textContent = `${count - 5} additional events not listed`;
      this.seismicityRecords.appendChild(item);
    }
  }

  setSeismicityUnavailable(): void {
    this.seismicityRecords.replaceChildren();
    this.seismicityValue.textContent = "Events unavailable";
    this.seismicityDetail.textContent =
      "The live USGS M4.5+ feed could not be loaded for this search.";
  }
}

/**
 * One matched event: magnitude with its reported scale, epicentral distance,
 * hypocentre depth and class, and the source-reported place. Links to the USGS
 * event page when the feed supplied one so the record stays traceable.
 */
function seismicityListItem(
  observation: NearbyEarthquakeObservation
): HTMLLIElement {
  const item = document.createElement("li");
  const magnitude = `M${observation.magnitude.toFixed(1)}${
    observation.magnitudeType ? ` ${observation.magnitudeType}` : ""
  }`;
  const details = [
    observation.place ?? "source location not supplied",
    `${formatDistanceKm(observation.distanceKm)} km away`,
    `${observation.depthKm} km deep (${observation.depthClass})`,
    `${new Date(observation.time).toISOString().slice(0, 10)} UTC`,
  ];
  const url = observation.sourceRecord?.url;
  if (url) {
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = magnitude;
    link.setAttribute("aria-label", `${magnitude} — USGS event record`);
    item.append(link, `: ${details.join("; ")}`);
  } else {
    item.textContent = `${magnitude}: ${details.join("; ")}`;
  }
  return item;
}

/** Radii span metropolitan boundaries to whole countries; keep both legible. */
function formatRadiusKm(radiusKm: number): string {
  return radiusKm >= 100 ? String(Math.round(radiusKm)) : radiusKm.toFixed(1);
}

function formatDistanceKm(distanceKm: number): string {
  return distanceKm >= 10
    ? String(Math.round(distanceKm))
    : distanceKm.toFixed(1);
}
