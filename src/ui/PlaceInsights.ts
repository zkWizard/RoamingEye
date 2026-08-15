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
  LST_PLACE_METRIC,
  type LstPlaceInsightReading,
} from "../lib/lstPlaceInsight";
import {
  GVP_VOLCANO_SOURCE,
  gvpVolcanoSourceLabel,
} from "../lib/volcanoContext";
import { searchExtentSpanPhrase } from "../lib/searchExtentSpan";
import {
  gvpCatalogRegionLabel,
  suppliedRecordPopulationText,
  volcanoCoordinateLabel,
  type VolcanoExtentContext,
} from "../lib/volcanoExtent";
import {
  epicenterConstraintText,
  comparedEventPopulationText,
  epicentralDistanceText,
  feedGenerationText,
  listedSeismicityOrderNote,
  reportedDepthBasisText,
  reportedMagnitudeText,
  searchExtentScopeText,
  USGS_M45_MONTH_SOURCE,
  type EarthquakePlaceContext,
  type NearbyEarthquakeObservation,
} from "../lib/earthquakeContext";
import { reportedMagnitudeRangeNote } from "../lib/magnitudeScale";
import {
  nearestVolcanoStatement,
  type VolcanoProximityContext,
} from "../lib/volcanoProximityContext";
import {
  BIRD_2003_PLATE_BOUNDARY_SOURCE,
  digitizationCreditText,
  subductionMarkingText,
  subductionPolarityText,
  suppliedRepeatText,
  type PlateBoundaryExtentContext,
} from "../lib/plateBoundaryContext";
import { plateBoundaryPairLabel } from "../lib/plateBoundaryHover";
import {
  nearestPlateBoundaryStatement,
  type PlateProximityContext,
} from "../lib/plateProximity";
import { eruptionRecencyText } from "../lib/volcanoRecency";
import { qualifiedVolcanoTypeLabel } from "../lib/volcanoMorphology";
import { crustalThicknessBasisText } from "../lib/volcanoTectonicSetting";
import { volcanoTypeCompositionText } from "../lib/volcanoType";
import { elevationRegimeLabel } from "../lib/volcanoes";
import {
  summitDatumText,
  tallyElevationRegimes,
} from "../lib/volcanoElevationProfile";
import type { PlaceMonthAlignment } from "../lib/placeMonthAlignment";
import { ICONS } from "./icons";

interface MetricElements {
  value: HTMLElement;
  detail: HTMLElement;
}

const SAMPLING_NOTE =
  "Boundary-grid means from NASA imagery; very small or thin boundaries may be labelled as a single in-boundary point estimate.";
/** Stands in until the panel's actual card months have been resolved. */
const UNRESOLVED_MONTHS_NOTE =
  "Products may publish on different monthly schedules.";
/**
 * Matched events shown as rows before the list is truncated. Shared with the
 * ordering note so the count it reports as hidden can never drift from the
 * number of rows actually rendered.
 */
const SEISMICITY_LIST_LIMIT = 5;

/** A compact month-over-month readout for the exact boundary selected in search. */
export class PlaceInsights {
  private readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly metrics = new Map<
    | PlaceMetricId
    | MarinePlaceInsightReading["id"]
    | AerosolPlaceInsightReading["id"]
    | LstPlaceInsightReading["id"],
    MetricElements
  >();
  private readonly downloadButton: HTMLButtonElement;
  private exportJson: string | undefined;
  private readonly volcanoValue: HTMLElement;
  private readonly volcanoDetail: HTMLElement;
  private readonly volcanoRecency: HTMLElement;
  private readonly volcanoCrust: HTMLElement;
  private readonly volcanoTypes: HTMLElement;
  private readonly volcanoRecords: HTMLUListElement;
  private readonly volcanoSource: HTMLAnchorElement;
  private readonly seismicityValue: HTMLElement;
  private readonly seismicityDetail: HTMLElement;
  private readonly seismicityMagnitude: HTMLElement;
  private readonly seismicityDepthBasis: HTMLElement;
  private readonly seismicityEpicenterConstraint: HTMLElement;
  private readonly seismicityRecords: HTMLUListElement;
  private readonly plateValue: HTMLElement;
  private readonly plateDetail: HTMLElement;
  private readonly plateRecords: HTMLUListElement;
  private readonly note: HTMLElement;

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
      LST_PLACE_METRIC,
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
    // The record list below is truncated and ordered by name, so the recency
    // composition of the full matched set gets its own line.
    this.volcanoRecency = document.createElement("p");
    this.volcanoRecency.className = "place-insights__detail";
    // Same reason as the recency line: the rows print one landform label each,
    // so for a wide extent the visible types are whichever the alphabetical
    // order surfaced, not the composition of the matched set.
    this.volcanoTypes = document.createElement("p");
    this.volcanoTypes.className = "place-insights__detail";
    // Each row prints GVP's tectonic-setting label verbatim, kilometre bounds
    // and all, next to a summit elevation that is a real measurement. The globe
    // hover drops those bounds; here they need saying, or "(> 25 km)" reads as
    // a crustal thickness measured beneath that volcano.
    this.volcanoCrust = document.createElement("p");
    this.volcanoCrust.className = "place-insights__detail";
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
      this.volcanoRecency,
      this.volcanoTypes,
      this.volcanoCrust,
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
    // The record list below is truncated and ordered nearest first, so the
    // largest value the feed reported near this place — and the methods behind
    // the values shown — get their own line.
    this.seismicityMagnitude = document.createElement("p");
    this.seismicityMagnitude.className = "place-insights__detail";
    // Record rows print the feed's depth verbatim. The globe hover qualifies a
    // depth that sits on an operator default; without the same disclosure here
    // a fixed 10 km would read as a resolved hypocentre, so it gets a line.
    this.seismicityDepthBasis = document.createElement("p");
    this.seismicityDepthBasis.className = "place-insights__detail";
    // Both the distance the rows are ordered by and the depth they print come
    // from the location solution, and this feed reports no location uncertainty
    // — only the station geometry behind it. Events USGS documents as weakly
    // constrained get a line so those digits are not read as fully resolved.
    this.seismicityEpicenterConstraint = document.createElement("p");
    this.seismicityEpicenterConstraint.className = "place-insights__detail";
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
      this.seismicityMagnitude,
      this.seismicityDepthBasis,
      this.seismicityEpicenterConstraint,
      this.seismicityRecords,
      seismicitySource
    );

    const plates = document.createElement("section");
    plates.className = "place-insights__geology";
    plates.setAttribute("aria-label", "Plate boundaries in search extent");
    const plateTitle = document.createElement("h3");
    plateTitle.textContent = "Plate boundaries";
    this.plateValue = document.createElement("p");
    this.plateValue.className = "place-insights__value";
    this.plateValue.setAttribute("aria-live", "polite");
    this.plateDetail = document.createElement("p");
    this.plateDetail.className = "place-insights__detail";
    this.plateRecords = document.createElement("ul");
    this.plateRecords.className = "place-insights__record-list";
    const plateSource = document.createElement("a");
    plateSource.className = "place-insights__source";
    plateSource.href = BIRD_2003_PLATE_BOUNDARY_SOURCE.url;
    plateSource.target = "_blank";
    plateSource.rel = "noopener";
    plateSource.textContent = `Source: ${BIRD_2003_PLATE_BOUNDARY_SOURCE.name} (${BIRD_2003_PLATE_BOUNDARY_SOURCE.digitization})`;
    plates.append(
      plateTitle,
      this.plateValue,
      this.plateDetail,
      this.plateRecords,
      plateSource
    );

    const note = document.createElement("p");
    note.className = "place-insights__note";
    note.textContent = `${SAMPLING_NOTE} ${UNRESOLVED_MONTHS_NOTE}`;
    this.note = note;

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

    container.append(
      header,
      grid,
      volcanoes,
      seismicity,
      plates,
      exportControls,
      note
    );
  }

  open(name: string): void {
    this.title.textContent = name;
    this.exportJson = undefined;
    this.downloadButton.disabled = true;
    this.note.textContent = `${SAMPLING_NOTE} ${UNRESOLVED_MONTHS_NOTE}`;
    for (const { value, detail } of this.metrics.values()) {
      value.textContent = "Sampling";
      detail.textContent = "Latest two available months";
    }
    this.setVolcanoLoading();
    this.setSeismicityLoading();
    this.setPlateBoundaryLoading();
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
      | LstPlaceInsightReading
  ): void {
    const metric = this.metrics.get(reading.id);
    if (!metric) return;
    metric.value.textContent = reading.value;
    metric.detail.textContent = reading.detail;
  }

  /**
   * Replace the standing "products may publish on different schedules" hedge
   * with the months this panel's cards actually read, so a reader can see which
   * cards are contemporaneous instead of assuming the grid is one snapshot.
   */
  setMonthAlignment(alignment: PlaceMonthAlignment): void {
    this.note.textContent = `${SAMPLING_NOTE} ${alignment.statement}`;
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
    this.volcanoRecency.textContent = "";
    this.volcanoTypes.textContent = "";
    this.volcanoCrust.textContent = "";
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
    this.volcanoRecency.textContent =
      eruptionRecencyText(context.eruptionRecency) ?? "";
    this.volcanoTypes.textContent =
      volcanoTypeCompositionText(context.typeComposition) ?? "";
    // Silent unless a matched record carries a printed kilometre band, so an
    // empty or unbanded extent gains no line.
    this.volcanoCrust.textContent =
      crustalThicknessBasisText(
        context.records.map((record) => record.tectonicSetting)
      ) ?? "";
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
    // GVP summit elevations are signed against the sea-level datum, so an arc
    // extent can match mostly submarine seamounts. Say so, rather than leaving
    // the negative metres in the list below to speak for themselves.
    const datum = summitDatumText(
      tallyElevationRegimes(
        context.records.map((record) => record.elevationMeters)
      )
    );
    // A match count is only readable against the size of the set that produced
    // it, and neither branch stated that size. Placed after the sentence it
    // qualifies and before the snapshot stamp, matching how the seismicity
    // section trails its own "Counted from N valid events in the global feed".
    const population = suppliedRecordPopulationText(context);
    this.volcanoDetail.textContent =
      count === 0
        ? `No bundled GVP volcano records have coordinates inside this search bounding box.${nearest ? ` ${nearest}` : ""}${population ? ` ${population}` : ""}${snapshot}`
        : `${context.geographicCoverage} Summit elevation is supplied for ${context.elevationCoverage.presentCount} of ${count} matched ${count === 1 ? "record" : "records"} in metres relative to sea level.${datum ? ` ${datum}` : ""}${population ? ` ${population}` : ""}${snapshot}`;
    for (const record of context.records.slice(0, 5)) {
      const item = document.createElement("li");
      const details = [
        record.country,
        // GVP's region vocabulary names tectonic features, not political
        // geography, so the bare value read as the app asserting arc or rift
        // membership. Attribute it the way the tectonic setting below already
        // is, since the same row carries app-derived readings too.
        gvpCatalogRegionLabel(record),
        volcanoCoordinateLabel(record),
        // GVP encodes qualifiers in the type string itself: "(s)"/"(es)" for a
        // record covering multiple landforms and "?" for an uncertain
        // assignment. Spell them out as the globe's hover label already does.
        qualifiedVolcanoTypeLabel(record.primaryType) ??
          "primary type not supplied",
        // Reads the datum sign GVP reports: a negative summit elevation is a
        // summit below sea level, not a missing or erroneous height.
        elevationRegimeLabel(record.elevationMeters),
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
      // Say how the shown records were chosen: they are the alphabetically
      // first five, not the largest, highest, or most recently active.
      const hidden = count - 5;
      item.textContent = `${hidden} additional ${hidden === 1 ? "record" : "records"} not listed; the list is ordered by name`;
      this.volcanoRecords.appendChild(item);
    }
  }

  setVolcanoUnavailable(): void {
    this.volcanoRecords.replaceChildren();
    this.volcanoRecency.textContent = "";
    this.volcanoTypes.textContent = "";
    this.volcanoCrust.textContent = "";
    this.volcanoValue.textContent = "Records unavailable";
    this.volcanoDetail.textContent =
      "The bundled GVP-derived volcano data could not be loaded for this search.";
  }

  setSeismicityLoading(): void {
    this.seismicityValue.textContent = "Loading USGS events";
    this.seismicityDetail.textContent =
      "Checking the live USGS M4.5+ 30-day feed against this search extent";
    this.seismicityMagnitude.textContent = "";
    this.seismicityDepthBasis.textContent = "";
    this.seismicityEpicenterConstraint.textContent = "";
    this.seismicityRecords.replaceChildren();
  }

  /**
   * Render nearby recorded seismicity. Deliberately descriptive: an event count
   * is a record of what the feed observed in a rolling 30-day window, never a
   * hazard rating, and an empty result is reported as "no recorded events",
   * not as a quiet or safe place.
   */
  setSeismicityContext(
    context: EarthquakePlaceContext,
    generatedTime: number | null = null
  ): void {
    this.seismicityRecords.replaceChildren();
    // Silent unless events matched, so a no-event or unusable-query result
    // gains no line.
    this.seismicityMagnitude.textContent = reportedMagnitudeText(context) ?? "";
    // Likewise silent unless a matched depth sits on a conventional default.
    this.seismicityDepthBasis.textContent =
      reportedDepthBasisText(context) ?? "";
    // Likewise silent unless a matched event exceeds the one azimuthal-gap
    // threshold USGS documents for these fields.
    this.seismicityEpicenterConstraint.textContent =
      epicenterConstraintText(context) ?? "";
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
    this.seismicityValue.textContent =
      count === 0
        ? "No recorded events"
        : `${count} ${count === 1 ? "event" : "events"}`;
    // The radial query circumscribes the rectangular search extent, so the
    // circle reaches past the boundary corners. Say "near", never "inside".
    // The extent is itself the geocoder's bounding box, not the place outline;
    // the volcano and plate sections above already say so, so this one does too
    // rather than reading as the boundary-exact section of the three.
    const scope = searchExtentScopeText(query.radiusKm);
    // Only the two branches below can reach this: the invalid-query and
    // no-usable-events statuses return above, and those are exactly the cases
    // where no feed copy was parsed. So the stamp is never claimed for a feed
    // that was never read — it dates the copy these counts came from.
    const generated = ` ${feedGenerationText(generatedTime)}`;
    // A negative result is only readable against the size of the set that
    // produced it, and the matched branch below already states that size. Placed
    // after the disclaimer it qualifies, matching how the plate section trails
    // its own "Compared against N usable supplied polylines".
    const compared = comparedEventPopulationText(context);
    this.seismicityDetail.textContent =
      count === 0
        ? `${scope} No M4.5+ events recorded in the feed window; that does not establish the area is seismically quiet.${compared ? ` ${compared}` : ""}${generated}`
        : `${scope} Counted from ${coverage.validEventCount} valid events in the global feed.${generated}`;

    for (const observation of context.observations.slice(
      0,
      SEISMICITY_LIST_LIMIT
    )) {
      this.seismicityRecords.appendChild(seismicityListItem(observation));
    }
    // Say how the shown events were chosen, as the volcano and plate lists do:
    // nearest first, so these are the closest events and not the largest.
    const orderNote = listedSeismicityOrderNote(context, SEISMICITY_LIST_LIMIT);
    if (orderNote) {
      const item = document.createElement("li");
      item.textContent = orderNote;
      this.seismicityRecords.appendChild(item);
    }
  }

  setSeismicityUnavailable(): void {
    this.seismicityRecords.replaceChildren();
    this.seismicityMagnitude.textContent = "";
    this.seismicityDepthBasis.textContent = "";
    this.seismicityEpicenterConstraint.textContent = "";
    this.seismicityValue.textContent = "Events unavailable";
    this.seismicityDetail.textContent =
      "The live USGS M4.5+ feed could not be loaded for this search.";
  }

  setPlateBoundaryLoading(): void {
    this.plateValue.textContent = "Loading plate linework";
    this.plateDetail.textContent =
      "Checking the bundled Bird (2003) boundary polylines against the search bounding box";
    this.plateRecords.replaceChildren();
  }

  /**
   * Render which Bird (2003) boundary polylines cross this search extent.
   *
   * Strictly descriptive map context. The bundled model supplies linework and a
   * plate-pair label per step — not plate polygons, relative motion, slip rate,
   * deformation, or activity — so a crossing is never reported as a boundary
   * type, and an empty result is "no supplied linework crosses this extent",
   * never a claim that the place is tectonically stable.
   *
   * When nothing crosses the extent, `proximity` supplies the nearest supplied
   * polyline instead. Most searched places do not sit on a boundary, so without
   * it the common case renders only a disclaimer — and the disclaimer's own
   * point ("this does not establish the place sits away from a plate boundary")
   * is exactly the question a measured distance answers.
   */
  setPlateBoundaryContext(
    context: PlateBoundaryExtentContext,
    proximity: PlateProximityContext | null = null
  ): void {
    this.plateRecords.replaceChildren();
    const { coverage } = context;

    if (coverage.status === "invalid-bounds") {
      this.plateValue.textContent = "Search extent unavailable";
      this.plateDetail.textContent = context.geographicCoverage;
      return;
    }
    if (coverage.status === "no-usable-boundaries") {
      this.plateValue.textContent = "Bundled linework unavailable";
      this.plateDetail.textContent =
        "The bundled Bird (2003) file supplied no usable polylines, so no geographic comparison was made.";
      return;
    }

    const count = coverage.matchedBoundaryCount;
    this.plateValue.textContent =
      count === 0
        ? "No boundaries in extent"
        : `${count} ${count === 1 ? "boundary" : "boundaries"}`;
    // The overlay draws the same linework, so the panel says plainly what a
    // match is and is not, rather than letting a crossing imply tectonic
    // setting, seismicity, volcanism, or hazard. The one thing the source DOES
    // classify is subduction, reported on its own line below.
    const caveat =
      "A crossing is descriptive map context: apart from the source's own subduction marking, the supplied model carries no boundary type, motion, deformation, activity, or hazard.";
    // Named first among the derived clauses because it explains the counts in
    // the sentence it follows; the marking and credit clauses then describe the
    // boundaries those counts refer to.
    const repeats = suppliedRepeatText(context);
    const marking = subductionMarkingText(context);
    // Directly after the marking line, which establishes that some of these
    // boundaries are subduction steps; this then reads the polarity the label's
    // own delimiter carries for those steps. Silent unless a matched label
    // encodes one.
    const polarity = subductionPolarityText(context);
    // Named after the marking lines so the paragraph moves from what the source
    // says about these boundaries to who supplied them.
    const credit = digitizationCreditText(context);
    const segments = coverage.matchedSegmentCount;
    const nearest =
      count === 0 && proximity
        ? nearestPlateBoundaryStatement(proximity)
        : null;
    // A negative result is only readable against the size of the region that
    // produced it: the geocoder sizes this box by what it matched, so the same
    // "no boundaries" sentence covers a monument a few hundred metres across
    // and a country thousands of kilometres wide. The count > 0 branch carries
    // the same figure inside `geographicCoverage`.
    const span = searchExtentSpanPhrase(
      context.bounds,
      context.crossesAntimeridian
    );
    this.plateDetail.textContent =
      count === 0
        ? `No bundled Bird (2003) boundary polylines intersect this search bounding box${span ? `, ${span}` : ""}; that does not establish the place sits away from a plate boundary.${nearest ? ` ${nearest}` : ""} Compared against ${coverage.usableBoundaryCount} usable supplied ${coverage.usableBoundaryCount === 1 ? "polyline" : "polylines"}.`
        : `${context.geographicCoverage} ${segments} supplied ${segments === 1 ? "segment intersects" : "segments intersect"}, from ${coverage.usableBoundaryCount} usable supplied ${coverage.usableBoundaryCount === 1 ? "polyline" : "polylines"}.${repeats ? ` ${repeats}` : ""}${marking ? ` ${marking}` : ""}${polarity ? ` ${polarity}` : ""}${credit ? ` ${credit}` : ""} ${caveat}`;

    for (const boundary of context.matchingBoundaries.slice(0, 5)) {
      const item = document.createElement("li");
      const segmentCount = boundary.matchedSegmentCount;
      item.textContent = `${plateBoundaryPairLabel(boundary.name)}: ${segmentCount} ${segmentCount === 1 ? "segment" : "segments"} in extent`;
      this.plateRecords.appendChild(item);
    }
    if (count > 5) {
      const item = document.createElement("li");
      // Say how the shown boundaries were chosen: alphabetically by plate-pair
      // label, not by length, segment count, or proximity.
      const hidden = count - 5;
      item.textContent = `${hidden} additional ${hidden === 1 ? "boundary" : "boundaries"} not listed; the list is ordered by plate-pair label`;
      this.plateRecords.appendChild(item);
    }
  }

  setPlateBoundaryUnavailable(): void {
    this.plateRecords.replaceChildren();
    this.plateValue.textContent = "Linework unavailable";
    this.plateDetail.textContent =
      "The bundled Bird (2003) plate-boundary linework could not be loaded for this search.";
  }
}

/**
 * One matched event: magnitude with its reported scale, epicentral distance,
 * hypocentre depth and class, and the source-reported place. Links to the USGS
 * event page when the feed supplied one so the record stays traceable.
 *
 * A row whose value falls outside the range USGS publishes for the method that
 * measured it carries that as a trailing clause. The rows are ordered nearest
 * first rather than largest first, so an out-of-range value routinely appears
 * here while the section's largest-value sentence names a different event.
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
    // Named anchor, not a bare "away": the source's own place string states a
    // distance from a settlement, so an unlabelled second figure beside it
    // reads as a contradiction rather than as a different measurement.
    epicentralDistanceText(observation.distanceKm),
    `${observation.depthKm} km deep (${observation.depthClass})`,
    `${new Date(observation.time).toISOString().slice(0, 10)} UTC`,
  ];
  // Trails the record so the row still leads with what the feed reported; a
  // value inside the published range adds nothing, which keeps most rows as
  // they were.
  const rangeNote = reportedMagnitudeRangeNote(
    observation.magnitude,
    observation.magnitudeType
  );
  if (rangeNote !== null) details.push(rangeNote);
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
