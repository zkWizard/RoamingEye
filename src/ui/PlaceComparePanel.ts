import { ICONS } from "./icons";
import { onDismissPlaceCompare } from "./placeCompareBridge";

export interface PlaceCompareView {
  placeA: string;
  placeB: string;
  layerLabel: string;
  monthLabel: string;
  /** Fallback sentence. Empty when the requested month is published. */
  note: string;
  /** Difference, or a short status while the readings are still loading. */
  readout: string;
}

/**
 * Two places, one layer, one month: a snapshot of each and a sentence about
 * the difference. The globe behind frames both; these columns stay readable
 * when the places are too far apart for one close view.
 */
export class PlaceComparePanel {
  private readonly root: HTMLElement;
  private readonly title: HTMLHeadingElement;
  private readonly meta: HTMLParagraphElement;
  private readonly note: HTMLParagraphElement;
  private readonly readout: HTMLParagraphElement;
  private readonly figureA: HTMLElement;
  private readonly figureB: HTMLElement;
  private readonly imgA: HTMLImageElement;
  private readonly imgB: HTMLImageElement;
  private readonly capA: HTMLElement;
  private readonly capB: HTMLElement;

  constructor(parent: HTMLElement) {
    this.root = document.createElement("aside");
    this.root.className = "place-compare";
    this.root.setAttribute("aria-label", "Place comparison");

    const header = document.createElement("div");
    header.className = "place-compare__header";
    this.title = document.createElement("h2");
    this.title.className = "place-compare__title";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "place-compare__close";
    close.setAttribute("aria-label", "Close comparison");
    close.innerHTML = ICONS.close;
    close.addEventListener("click", () => this.hide());
    header.append(this.title, close);

    this.meta = document.createElement("p");
    this.meta.className = "place-compare__meta";
    this.note = document.createElement("p");
    this.note.className = "place-compare__note";

    const maps = document.createElement("div");
    maps.className = "place-compare__maps";
    this.figureA = document.createElement("figure");
    this.figureB = document.createElement("figure");
    this.imgA = document.createElement("img");
    this.imgB = document.createElement("img");
    this.capA = document.createElement("figcaption");
    this.capB = document.createElement("figcaption");
    this.imgA.alt = "";
    this.imgB.alt = "";
    this.figureA.append(this.imgA, this.capA);
    this.figureB.append(this.imgB, this.capB);
    maps.append(this.figureA, this.figureB);

    this.readout = document.createElement("p");
    this.readout.className = "place-compare__readout";
    this.readout.setAttribute("aria-live", "polite");

    this.root.append(header, this.meta, this.note, maps, this.readout);
    parent.append(this.root);
    onDismissPlaceCompare(() => this.hide());
  }

  show(view: PlaceCompareView): void {
    this.title.textContent = `${view.placeA} vs ${view.placeB}`;
    this.meta.textContent = `${view.layerLabel} · ${view.monthLabel}`;
    this.note.textContent = view.note;
    this.note.hidden = view.note.length === 0;
    this.readout.textContent = view.readout;
    this.capA.textContent = view.placeA;
    this.capB.textContent = view.placeB;
    this.root.classList.add("is-open");
  }

  setImages(urlA: string, urlB: string, altA: string, altB: string): void {
    this.imgA.src = urlA;
    this.imgB.src = urlB;
    this.imgA.alt = altA;
    this.imgB.alt = altB;
  }

  setReadout(text: string): void {
    this.readout.textContent = text;
  }

  hide(): void {
    this.root.classList.remove("is-open");
    this.imgA.removeAttribute("src");
    this.imgB.removeAttribute("src");
  }
}
