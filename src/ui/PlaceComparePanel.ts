import { chartBounds } from "../lib/compareClimate";
import { ICONS } from "./icons";
import { onDismissPlaceCompare } from "./placeCompareBridge";

export interface PlaceNumber {
  name: string;
  primary: string;
  secondary: string;
}

export interface CompareChartModel {
  labels: readonly string[];
  a: readonly (number | null)[];
  b: readonly (number | null)[];
  /** Rain starts at zero. Temperature is padded so a small gap still shows. */
  zeroBased: boolean;
  label: string;
}

export interface PlaceCompareCard {
  title: string;
  /** "Rain · September 2026". */
  meta: string;
  sentence: string;
  note: string;
  source: string;
  /** Set when the globe's imagery month is not the month of the numbers. */
  mapNote: string;
  places: readonly [PlaceNumber, PlaceNumber] | null;
  chart: CompareChartModel | null;
}

/**
 * Place against place, docked beside the map (a bottom sheet on a phone).
 * The globe stays usable: nothing behind the card is blocked.
 */
export class PlaceComparePanel {
  private readonly root: HTMLElement;
  private readonly title: HTMLHeadingElement;
  private readonly collapse: HTMLButtonElement;
  private readonly meta: HTMLParagraphElement;
  private readonly sentence: HTMLParagraphElement;
  private readonly note: HTMLParagraphElement;
  private readonly places: HTMLElement;
  private readonly chart: HTMLElement;
  private readonly source: HTMLParagraphElement;
  private readonly mapNote: HTMLParagraphElement;
  private onClose = (): void => {};

  constructor(parent: HTMLElement) {
    this.root = document.createElement("aside");
    this.root.className = "place-compare";
    this.root.setAttribute("aria-label", "Place comparison");

    const header = document.createElement("div");
    header.className = "place-compare__header";
    this.title = document.createElement("h2");
    this.title.className = "place-compare__title";
    const actions = document.createElement("div");
    actions.className = "place-compare__actions";
    this.collapse = document.createElement("button");
    this.collapse.type = "button";
    this.collapse.className = "place-compare__collapse";
    this.collapse.innerHTML = ICONS.chevronRight;
    this.collapse.setAttribute("aria-expanded", "true");
    this.collapse.setAttribute("aria-label", "Collapse comparison");
    this.collapse.addEventListener("click", () => this.toggleCollapsed());
    const close = document.createElement("button");
    close.type = "button";
    close.className = "place-compare__close";
    close.setAttribute("aria-label", "Close comparison");
    close.innerHTML = ICONS.close;
    close.addEventListener("click", () => this.hide());
    actions.append(this.collapse, close);
    header.append(this.title, actions);

    const body = document.createElement("div");
    body.className = "place-compare__body";
    this.meta = document.createElement("p");
    this.meta.className = "place-compare__meta";
    this.sentence = document.createElement("p");
    this.sentence.className = "place-compare__sentence";
    this.sentence.setAttribute("aria-live", "polite");
    this.note = document.createElement("p");
    this.note.className = "place-compare__note";
    this.places = document.createElement("div");
    this.places.className = "place-compare__places";
    this.chart = document.createElement("div");
    this.chart.className = "place-compare__chart";
    this.source = document.createElement("p");
    this.source.className = "place-compare__source";
    this.mapNote = document.createElement("p");
    this.mapNote.className = "place-compare__map-note";
    body.append(
      this.meta,
      this.sentence,
      this.note,
      this.places,
      this.chart,
      this.source,
      this.mapNote
    );

    this.root.append(header, body);
    parent.append(this.root);
    onDismissPlaceCompare(() => this.hide());
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || !this.root.classList.contains("is-open")) {
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      this.hide();
    });
  }

  setOnClose(fn: () => void): void {
    this.onClose = fn;
  }

  show(card: PlaceCompareCard): void {
    this.title.textContent = card.title;
    this.meta.textContent = card.meta;
    this.meta.hidden = card.meta.length === 0;
    this.sentence.textContent = card.sentence;
    this.note.textContent = card.note;
    this.note.hidden = card.note.length === 0;
    this.source.textContent = card.source;
    this.source.hidden = card.source.length === 0;
    this.mapNote.textContent = card.mapNote;
    this.mapNote.hidden = card.mapNote.length === 0;
    this.renderPlaces(card.places);
    this.renderChart(card.chart);
    this.root.classList.remove("is-collapsed");
    this.collapse.setAttribute("aria-expanded", "true");
    this.collapse.setAttribute("aria-label", "Collapse comparison");
    this.root.classList.add("is-open");
  }

  hide(): void {
    if (!this.root.classList.contains("is-open")) return;
    this.root.classList.remove("is-open", "is-collapsed");
    this.places.replaceChildren();
    this.chart.replaceChildren();
    this.onClose();
  }

  private toggleCollapsed(): void {
    const collapsed = this.root.classList.toggle("is-collapsed");
    this.collapse.setAttribute("aria-expanded", collapsed ? "false" : "true");
    this.collapse.setAttribute(
      "aria-label",
      collapsed ? "Expand comparison" : "Collapse comparison"
    );
  }

  private renderPlaces(
    places: readonly [PlaceNumber, PlaceNumber] | null
  ): void {
    this.places.replaceChildren();
    this.places.hidden = places === null;
    if (!places) return;
    places.forEach((place, index) => {
      const column = document.createElement("div");
      column.className = "place-compare__place";
      column.dataset.place = index === 0 ? "a" : "b";
      const name = document.createElement("div");
      name.className = "place-compare__name";
      const swatch = document.createElement("span");
      swatch.className = `place-compare__swatch place-compare__swatch--${index === 0 ? "a" : "b"}`;
      swatch.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.textContent = place.name;
      name.append(swatch, label);
      const primary = document.createElement("div");
      primary.className = "place-compare__primary";
      primary.textContent = place.primary;
      const secondary = document.createElement("div");
      secondary.className = "place-compare__secondary";
      secondary.textContent = place.secondary;
      secondary.hidden = place.secondary.length === 0;
      column.append(name, primary, secondary);
      this.places.append(column);
    });
  }

  private renderChart(chart: CompareChartModel | null): void {
    this.chart.replaceChildren();
    this.chart.hidden = chart === null;
    if (!chart) return;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 320 92");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", chart.label);
    const { lo, hi } = chartBounds([...chart.a, ...chart.b], chart.zeroBased);
    const span = hi - lo || 1;
    const plotTop = 4;
    const plotH = 68;
    const slot = 320 / Math.max(chart.labels.length, 1);
    const barW = Math.min(8, slot * 0.32);
    chart.labels.forEach((label, index) => {
      const mid = index * slot + slot / 2;
      drawBar(
        svg,
        chart.a[index],
        mid - barW - 1,
        barW,
        lo,
        span,
        plotTop,
        plotH,
        "#4ea1ff"
      );
      drawBar(
        svg,
        chart.b[index],
        mid + 1,
        barW,
        lo,
        span,
        plotTop,
        plotH,
        "#ffb020"
      );
      if (index % 2 === 0) {
        const text = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "text"
        );
        text.setAttribute("x", mid.toFixed(1));
        text.setAttribute("y", "88");
        text.setAttribute("text-anchor", "middle");
        text.textContent = label;
        svg.append(text);
      }
    });
    this.chart.append(svg);
  }
}

function drawBar(
  svg: SVGSVGElement,
  value: number | null | undefined,
  x: number,
  width: number,
  lo: number,
  span: number,
  plotTop: number,
  plotH: number,
  color: string
): void {
  if (value === null || value === undefined || !Number.isFinite(value)) return;
  const height = Math.max(1.5, ((value - lo) / span) * plotH);
  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  rect.setAttribute("x", x.toFixed(1));
  rect.setAttribute("y", (plotTop + plotH - height).toFixed(1));
  rect.setAttribute("width", width.toFixed(1));
  rect.setAttribute("height", height.toFixed(1));
  rect.setAttribute("rx", "1.5");
  rect.setAttribute("fill", color);
  svg.append(rect);
}
