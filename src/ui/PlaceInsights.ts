import {
  formatHeadline,
  formatSpan,
  matchingPreset,
  PLACE_CHANGE_METRICS,
  PLACE_RANGE_PRESETS,
  presetRange,
  type PlaceChange,
  type PlaceChangeLayerId,
  type PlaceChangeMetric,
  type QuakeTally,
  type VolcanoTally,
  type YearRange,
} from "../lib/placeChange";
import { ICONS } from "./icons";

export interface PlaceInsightsHandlers {
  onClose(): void;
  onRangeChange(range: YearRange): void;
  onSelectLayer(layerId: PlaceChangeLayerId): void;
}

interface CardElements {
  metric: PlaceChangeMetric;
  root: HTMLButtonElement;
  years: HTMLElement;
  delta: HTMLElement;
  span: HTMLElement;
}

interface StatElements {
  value: HTMLElement;
  sub: HTMLElement;
}

/**
 * The searched place, as numbers: how each measurement changed across the
 * chosen years, plus the hazards inside the boundary. Prose stays out of the
 * panel; each card's tooltip names its product, and the CSV carries the rest.
 */
export class PlaceInsights {
  private readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly presetButtons = new Map<string, HTMLButtonElement>();
  private readonly fromSelect: HTMLSelectElement;
  private readonly toSelect: HTMLSelectElement;
  private readonly cards = new Map<PlaceChangeLayerId, CardElements>();
  private readonly quakes: StatElements;
  private readonly volcanoes: StatElements;
  private readonly plates: StatElements;
  private readonly quakeLabel: HTMLElement;
  private readonly downloadButton: HTMLButtonElement;
  private csv: string | undefined;
  private bounds: YearRange = { from: 0, to: 0 };
  private range: YearRange = { from: 0, to: 0 };

  constructor(
    container: HTMLElement,
    private readonly handlers: PlaceInsightsHandlers
  ) {
    this.root = container;
    container.classList.add("place-insights");
    container.setAttribute("role", "region");
    container.setAttribute("aria-label", "Place insights");
    container.setAttribute("aria-hidden", "true");

    const header = document.createElement("header");
    header.className = "place-insights__header";
    this.title = document.createElement("h2");
    this.title.className = "place-insights__title";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "place-insights__close";
    close.title = "Close place insights";
    close.setAttribute("aria-label", "Close place insights");
    close.innerHTML = ICONS.close;
    close.addEventListener("click", () => this.close());
    header.append(this.title, close);

    const rangeBar = document.createElement("div");
    rangeBar.className = "place-range";
    rangeBar.setAttribute("role", "group");
    rangeBar.setAttribute("aria-label", "Years to compare");
    const presets = document.createElement("div");
    presets.className = "place-range__presets";
    for (const preset of PLACE_RANGE_PRESETS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "place-range__preset";
      button.textContent = preset.label;
      button.setAttribute(
        "aria-label",
        preset.years ? `Last ${preset.years} years` : "Whole record"
      );
      button.addEventListener("click", () =>
        this.pickRange(presetRange(preset.id, this.bounds))
      );
      this.presetButtons.set(preset.id, button);
      presets.appendChild(button);
    }
    const years = document.createElement("div");
    years.className = "place-range__years";
    this.fromSelect = this.yearSelect("From year");
    this.toSelect = this.yearSelect("To year");
    const arrow = document.createElement("span");
    arrow.className = "place-range__arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "→";
    years.append(this.fromSelect, arrow, this.toSelect);
    this.fromSelect.addEventListener("change", () => {
      const from = Number(this.fromSelect.value);
      this.pickRange({ from, to: Math.max(this.range.to, from + 1) });
    });
    this.toSelect.addEventListener("change", () => {
      const to = Number(this.toSelect.value);
      this.pickRange({ from: Math.min(this.range.from, to - 1), to });
    });
    rangeBar.append(presets, years);

    const grid = document.createElement("section");
    grid.className = "place-insights__grid";
    grid.setAttribute("aria-label", "Change between the two years");
    for (const metric of PLACE_CHANGE_METRICS) {
      const root = document.createElement("button");
      root.type = "button";
      root.className = "place-card";
      root.title = `${metric.source}. Show on the globe.`;
      root.setAttribute("aria-pressed", "false");
      const top = document.createElement("span");
      top.className = "place-card__top";
      const label = document.createElement("span");
      label.className = "place-card__label";
      label.textContent = metric.label;
      const yearsTag = document.createElement("span");
      yearsTag.className = "place-card__years";
      top.append(label, yearsTag);
      const delta = document.createElement("span");
      delta.className = "place-card__delta";
      const span = document.createElement("span");
      span.className = "place-card__span";
      root.append(top, delta, span);
      root.addEventListener("click", () =>
        this.handlers.onSelectLayer(metric.layerId)
      );
      grid.appendChild(root);
      this.cards.set(metric.layerId, {
        metric,
        root,
        years: yearsTag,
        delta,
        span,
      });
    }

    const hazards = document.createElement("section");
    hazards.className = "place-hazards";
    hazards.setAttribute("aria-label", "Hazards");
    const stat = (label: string): [HTMLElement, StatElements, HTMLElement] => {
      const el = document.createElement("div");
      el.className = "place-stat";
      const name = document.createElement("span");
      name.className = "place-stat__label";
      name.textContent = label;
      const value = document.createElement("span");
      value.className = "place-stat__value";
      const sub = document.createElement("span");
      sub.className = "place-stat__sub";
      el.append(name, value, sub);
      hazards.appendChild(el);
      return [el, { value, sub }, name];
    };
    const [quakeEl, quakes, quakeLabel] = stat("Quakes M4.5+");
    quakeEl.title = "USGS earthquake catalog, events inside the boundary";
    this.quakes = quakes;
    this.quakeLabel = quakeLabel;
    const [volcanoEl, volcanoes] = stat("Volcanoes");
    volcanoEl.title = "Smithsonian GVP Holocene volcanoes inside the boundary";
    this.volcanoes = volcanoes;
    const [plateEl, plates] = stat("Plate boundary");
    plateEl.title = "Bird (2003) plate boundary model";
    this.plates = plates;

    const footer = document.createElement("footer");
    footer.className = "place-insights__footer";
    const note = document.createElement("p");
    note.className = "place-insights__note";
    note.textContent =
      "Annual means inside the boundary · NASA imagery, approx.";
    this.downloadButton = document.createElement("button");
    this.downloadButton.type = "button";
    this.downloadButton.className = "place-insights__download";
    this.downloadButton.textContent = "CSV";
    this.downloadButton.setAttribute(
      "aria-label",
      "Download these numbers as CSV"
    );
    this.downloadButton.disabled = true;
    this.downloadButton.addEventListener("click", () => this.downloadCsv());
    footer.append(note, this.downloadButton);

    container.append(header, rangeBar, grid, hazards, footer);
  }

  open(name: string, bounds: YearRange, range: YearRange): void {
    this.title.textContent = name;
    this.bounds = bounds;
    this.fillYears(this.fromSelect, bounds.from, bounds.to - 1);
    this.fillYears(this.toSelect, bounds.from + 1, bounds.to);
    this.showRange(range);
    this.root.classList.add("is-open");
    this.root.setAttribute("aria-hidden", "false");
  }

  close(): void {
    if (!this.root.classList.contains("is-open")) return;
    this.root.classList.remove("is-open");
    this.root.setAttribute("aria-hidden", "true");
    this.handlers.onClose();
  }

  /** Reflect a range in the controls and reset every reading to pending. */
  showRange(range: YearRange): void {
    this.range = range;
    this.fromSelect.value = String(range.from);
    this.toSelect.value = String(range.to);
    const preset = matchingPreset(range, this.bounds);
    for (const [id, button] of this.presetButtons) {
      button.setAttribute("aria-pressed", String(id === preset));
    }
    this.quakeLabel.textContent = "Quakes M4.5+";
    this.setCsv(undefined);
  }

  setCardLoading(layerId: PlaceChangeLayerId, years: YearRange): void {
    const card = this.cards.get(layerId);
    if (!card) return;
    card.root.hidden = false;
    card.root.dataset.tone = "loading";
    this.setYearsTag(card, years);
    card.delta.textContent = "—";
    card.span.textContent = "Sampling…";
    card.root.setAttribute("aria-label", `${card.metric.label}, sampling`);
  }

  setCardChange(
    layerId: PlaceChangeLayerId,
    years: YearRange,
    change: PlaceChange
  ): void {
    const card = this.cards.get(layerId);
    if (!card) return;
    const headline = formatHeadline(card.metric, change);
    const span = formatSpan(card.metric, change);
    card.root.hidden = false;
    card.root.dataset.tone = change.tone;
    this.setYearsTag(card, years);
    card.delta.textContent = headline;
    card.span.textContent = span;
    card.root.setAttribute(
      "aria-label",
      `${card.metric.label}, ${years.from} to ${years.to}: ${headline}, ${span}`
    );
  }

  /** No reading: `reason` is a two- or three-word why ("No data here"). */
  setCardEmpty(
    layerId: PlaceChangeLayerId,
    years: YearRange | null,
    reason: string
  ): void {
    const card = this.cards.get(layerId);
    if (!card) return;
    card.root.hidden = false;
    card.root.dataset.tone = "empty";
    if (years) this.setYearsTag(card, years);
    else card.years.textContent = "";
    card.delta.textContent = "—";
    card.span.textContent = reason;
    card.root.setAttribute(
      "aria-label",
      `${card.metric.label}: ${card.span.textContent}`
    );
  }

  hideCard(layerId: PlaceChangeLayerId): void {
    const card = this.cards.get(layerId);
    if (card) card.root.hidden = true;
  }

  setActiveLayer(layerId: string): void {
    for (const [id, card] of this.cards) {
      card.root.setAttribute("aria-pressed", String(id === layerId));
    }
  }

  setQuakes(tally: QuakeTally | "loading" | "error"): void {
    if (tally === "loading" || tally === "error") {
      this.quakes.value.textContent = "—";
      this.quakes.sub.textContent = tally === "loading" ? "…" : "Unavailable";
      return;
    }
    this.quakes.value.textContent = `${tally.count.toLocaleString("en-US")}${tally.capped ? "+" : ""}`;
    this.quakes.sub.textContent =
      tally.maxMagnitude === null
        ? "none"
        : `max M${tally.maxMagnitude.toFixed(1)}`;
  }

  setVolcanoes(tally: VolcanoTally | "loading" | "error"): void {
    if (tally === "loading" || tally === "error") {
      this.volcanoes.value.textContent = "—";
      this.volcanoes.sub.textContent =
        tally === "loading" ? "…" : "Unavailable";
      return;
    }
    this.volcanoes.value.textContent = String(tally.inside);
    this.volcanoes.sub.textContent =
      tally.inside > 0
        ? tally.latestEruption === null
          ? "no dated eruption"
          : `last erupted ${formatYear(tally.latestEruption)}`
        : tally.nearestKm === null
          ? ""
          : `nearest ${Math.round(tally.nearestKm).toLocaleString("en-US")} km`;
  }

  setPlates(
    state: { crosses: boolean; distanceKm: number | null } | "loading" | "error"
  ): void {
    if (state === "loading" || state === "error") {
      this.plates.value.textContent = "—";
      this.plates.sub.textContent = state === "loading" ? "…" : "Unavailable";
      return;
    }
    if (state.crosses) {
      this.plates.value.textContent = "Crosses";
      this.plates.sub.textContent = "runs through";
    } else {
      this.plates.value.textContent =
        state.distanceKm === null
          ? "—"
          : `${Math.round(state.distanceKm).toLocaleString("en-US")} km`;
      this.plates.sub.textContent = "to nearest";
    }
  }

  /** Enable the download once the current range has settled. */
  setCsv(csv: string | undefined): void {
    this.csv = csv;
    this.downloadButton.disabled = csv === undefined;
  }

  private pickRange(range: YearRange): void {
    if (range.from === this.range.from && range.to === this.range.to) return;
    this.showRange(range);
    this.handlers.onRangeChange(range);
  }

  private setYearsTag(card: CardElements, years: YearRange): void {
    // Only when the layer's record narrowed the panel's range, so the reader
    // sees which years this card actually compares.
    const narrowed =
      years.from !== this.range.from || years.to !== this.range.to;
    card.years.textContent = narrowed ? `${years.from}–${years.to}` : "";
  }

  private yearSelect(label: string): HTMLSelectElement {
    const select = document.createElement("select");
    select.className = "place-range__year";
    select.setAttribute("aria-label", label);
    return select;
  }

  private fillYears(select: HTMLSelectElement, from: number, to: number): void {
    select.replaceChildren();
    for (let year = to; year >= from; year--) {
      const option = document.createElement("option");
      option.value = String(year);
      option.textContent = String(year);
      select.appendChild(option);
    }
  }

  private downloadCsv(): void {
    if (!this.csv) return;
    const blob = new Blob([this.csv], { type: "text/csv" });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    // Keep the searched place out of the filename; it may be personal context.
    anchor.download = "roamingeye-place-change.csv";
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  }
}

function formatYear(year: number): string {
  return year < 0 ? `${-year} BCE` : String(year);
}
