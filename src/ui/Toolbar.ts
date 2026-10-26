import type { MapOverlay } from "../overlays/types";
import type { ViewCard } from "./viewCards";
import type { LayerId } from "../lib/timeline";

export interface ToolbarHandlers {
  /** Switch the globe to this card's layer and overlays. */
  onView?: (card: ViewCard) => void;
  /** Same view, with the then-and-now comparison turned on. */
  onThenNow?: (card: ViewCard) => void;
  onShare?: (card: ViewCard) => void;
  onClip?: (card: ViewCard) => void;
  /** Play a curated story by id. The list itself loads on first open. */
  onStory?: (id: string) => void;
}

const PHONE_QUERY = "(max-width: 540px), (max-height: 460px)";

/**
 * The right-hand panel: picture cards for a first visit, a labeled list of
 * map details, and a settings fold for the two switches that don't change
 * what you're looking at. On a phone it is a bottom sheet, collapsed until
 * the visitor pulls it up.
 */
export class Toolbar {
  private readonly buttons = new Map<string, HTMLButtonElement>();
  private readonly cards = new Map<string, HTMLElement>();
  private readonly container: HTMLElement;
  private readonly body: HTMLElement;
  private readonly handle: HTMLButtonElement;
  private readonly phone = window.matchMedia(PHONE_QUERY);
  private sheetOpen = false;
  private storiesLoaded = false;
  private activeLayer: LayerId | undefined;

  constructor(
    container: HTMLElement,
    overlays: MapOverlay[],
    onToggle: (overlay: MapOverlay, on: boolean) => void,
    isOn: (overlay: MapOverlay) => boolean = (o) => Boolean(o.defaultOn),
    private readonly handlers: ToolbarHandlers = {}
  ) {
    this.container = container;
    container.classList.add("toolbar");
    container.setAttribute("role", "region");
    container.setAttribute("aria-label", "Map");
    container.replaceChildren();

    this.handle = document.createElement("button");
    this.handle.type = "button";
    this.handle.className = "toolbar__handle";
    this.handle.setAttribute("aria-controls", "toolbar-body");
    this.handle.innerHTML =
      `<span class="toolbar__grab" aria-hidden="true"></span>` +
      `<span class="toolbar__handle-label">Map</span>`;
    this.wireSheet();

    this.body = document.createElement("div");
    this.body.className = "toolbar__body";
    this.body.id = "toolbar-body";

    this.body.appendChild(this.buildViews());
    this.body.appendChild(
      this.buildFold("Map details", overlays, onToggle, isOn, "details", true)
    );
    this.body.appendChild(
      this.buildFold("Settings", overlays, onToggle, isOn, "settings", false)
    );
    if (handlers.onStory) this.body.appendChild(this.buildStories());

    container.append(this.handle, this.body);

    this.body.addEventListener("scroll", () => this.updateOverflow(), {
      passive: true,
    });
    if (typeof ResizeObserver !== "undefined") {
      new ResizeObserver(() => {
        this.updateOverflow();
        this.publishHeight();
      }).observe(container, { box: "border-box" });
    }
    this.phone.addEventListener("change", () => this.applySheetMode());
    this.applySheetMode();
  }

  /** Highlight the card for the layer the globe is showing. */
  setActiveLayer(id: LayerId): void {
    this.activeLayer = id;
    for (const el of this.cards.values()) {
      el.classList.toggle("is-current", el.dataset.layer === id);
    }
  }

  press(overlayId: string, on: boolean): boolean {
    const button = this.buttons.get(overlayId);
    if (!button || (button.getAttribute("aria-pressed") === "true") === on) {
      return false;
    }
    button.click();
    return true;
  }

  setPressed(overlayId: string, on: boolean): void {
    this.buttons.get(overlayId)?.setAttribute("aria-pressed", String(on));
  }

  setPending(overlayId: string, pending: boolean): void {
    const button = this.buttons.get(overlayId);
    if (!button) return;
    if (pending) {
      button.dataset.state = "pending";
      button.setAttribute("aria-busy", "true");
    } else {
      delete button.dataset.state;
      button.removeAttribute("aria-busy");
    }
  }

  private buildViews(): HTMLElement {
    const section = document.createElement("section");
    section.className = "toolbar__views";
    const heading = document.createElement("h2");
    heading.className = "toolbar__heading";
    heading.textContent = "What do you want to see?";
    section.appendChild(heading);

    const grid = document.createElement("div");
    grid.className = "view-cards";
    // The card list and its thumbnail URLs stay out of the entry chunk.
    void import("./viewCards").then(({ VIEW_CARDS, viewCardThumbnail }) => {
      for (const card of VIEW_CARDS)
        this.mountCard(grid, card, viewCardThumbnail);
      if (this.activeLayer) this.setActiveLayer(this.activeLayer);
      this.updateOverflow();
    });
    section.appendChild(grid);
    return section;
  }

  private mountCard(
    grid: HTMLElement,
    card: ViewCard,
    thumbnail: (layerId: LayerId) => string
  ): void {
    const article = document.createElement("article");
    article.className = "view-card";
    article.dataset.card = card.id;
    if (card.layer) article.dataset.layer = card.layer;

    const open = document.createElement("button");
    open.type = "button";
    open.className = "view-card__open";
    const img = document.createElement("img");
    img.className = "view-card__thumb";
    img.alt = "";
    img.width = 280;
    img.height = 150;
    img.loading = "lazy";
    img.decoding = "async";
    img.src = thumbnail(card.thumbnailLayer);
    img.addEventListener("error", () => img.classList.add("is-missing"));
    const title = document.createElement("span");
    title.className = "view-card__title";
    title.textContent = card.title;
    const blurb = document.createElement("span");
    blurb.className = "view-card__blurb";
    blurb.textContent = card.blurb;
    open.append(img, title, blurb);
    open.addEventListener("click", () => this.handlers.onView?.(card));

    const actions = document.createElement("div");
    actions.className = "view-card__actions";
    actions.append(
      this.cardAction("Then & now", card.title, () =>
        this.handlers.onThenNow?.(card)
      ),
      this.cardAction("Share", card.title, () => this.handlers.onShare?.(card)),
      this.cardAction("Clip", card.title, () => this.handlers.onClip?.(card))
    );

    article.append(open, actions);
    this.cards.set(card.id, article);
    grid.appendChild(article);
  }

  private cardAction(
    label: string,
    cardTitle: string,
    onClick: () => void
  ): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "view-card__action";
    button.textContent = label;
    // Eight cards would otherwise share one accessible name.
    button.setAttribute("aria-label", `${label}, ${cardTitle}`);
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      onClick();
    });
    return button;
  }

  private buildFold(
    title: string,
    overlays: MapOverlay[],
    onToggle: (overlay: MapOverlay, on: boolean) => void,
    isOn: (overlay: MapOverlay) => boolean,
    group: "details" | "settings",
    open: boolean
  ): HTMLElement {
    const fold = document.createElement("details");
    fold.className = "toolbar__fold";
    if (group === "settings") fold.classList.add("toolbar__fold--settings");
    fold.open = open;
    const summary = document.createElement("summary");
    summary.textContent = title;
    fold.appendChild(summary);
    const list = document.createElement("div");
    list.className = "toolbar__list";
    list.setAttribute("role", "group");
    list.setAttribute("aria-label", title);
    for (const overlay of overlays) {
      if ((overlay.group ?? "details") !== group) continue;
      list.appendChild(this.buildToggle(overlay, onToggle, isOn));
    }
    fold.appendChild(list);
    fold.addEventListener("toggle", () => this.updateOverflow());
    return fold;
  }

  private buildToggle(
    overlay: MapOverlay,
    onToggle: (overlay: MapOverlay, on: boolean) => void,
    isOn: (overlay: MapOverlay) => boolean
  ): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "toolbar__item";
    button.dataset.overlay = overlay.id;
    button.title = overlay.detail
      ? `${overlay.label} — ${overlay.detail}`
      : overlay.label;
    button.setAttribute("aria-pressed", String(isOn(overlay)));
    const text = overlay.detail
      ? `<span class="toolbar__text"><span class="toolbar__label">${overlay.label}</span><span class="toolbar__detail">${overlay.detail}</span></span>`
      : `<span class="toolbar__text"><span class="toolbar__label">${overlay.label}</span></span>`;
    button.innerHTML = `<span class="toolbar__icon">${overlay.icon}</span>${text}`;
    button.addEventListener("click", () => {
      if (button.dataset.state === "pending") return;
      const on = button.getAttribute("aria-pressed") !== "true";
      button.setAttribute("aria-pressed", String(on));
      onToggle(overlay, on);
    });
    this.buttons.set(overlay.id, button);
    return button;
  }

  private buildStories(): HTMLElement {
    const fold = document.createElement("details");
    fold.className = "toolbar__fold toolbar__stories";
    const summary = document.createElement("summary");
    summary.textContent = "Stories";
    fold.appendChild(summary);
    const note = document.createElement("p");
    note.className = "toolbar__note";
    note.textContent = "Short tours of a place changing over a few months.";
    const list = document.createElement("div");
    list.className = "toolbar__story-list";
    fold.append(note, list);
    fold.addEventListener("toggle", () => {
      this.updateOverflow();
      if (!fold.open || this.storiesLoaded) return;
      this.storiesLoaded = true;
      void import("../lib/stories").then(
        ({ STORIES }) => {
          for (const story of STORIES) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "toolbar__story";
            const title = document.createElement("span");
            title.className = "toolbar__story-title";
            title.textContent = story.title;
            const blurb = document.createElement("span");
            blurb.className = "toolbar__story-blurb";
            blurb.textContent = story.blurb;
            button.append(title, blurb);
            button.addEventListener("click", () =>
              this.handlers.onStory?.(story.id)
            );
            list.appendChild(button);
          }
          this.updateOverflow();
        },
        () => {
          this.storiesLoaded = false;
          note.textContent = "Stories didn't load. Open this again to retry.";
        }
      );
    });
    return fold;
  }

  private wireSheet(): void {
    let startY = 0;
    let dy = 0;
    this.handle.addEventListener("pointerdown", (event) => {
      startY = event.clientY;
      dy = 0;
    });
    this.handle.addEventListener("pointermove", (event) => {
      if (event.buttons === 0 && event.pointerType === "mouse") return;
      dy = event.clientY - startY;
    });
    this.handle.addEventListener("click", () => {
      if (dy < -28) this.setSheetOpen(true);
      else if (dy > 28) this.setSheetOpen(false);
      else this.setSheetOpen(!this.sheetOpen);
      dy = 0;
    });
  }

  private applySheetMode(): void {
    const phone = this.phone.matches;
    this.handle.hidden = !phone;
    this.container.classList.toggle("is-collapsed", phone && !this.sheetOpen);
    this.handle.setAttribute("aria-expanded", String(!phone || this.sheetOpen));
    this.updateOverflow();
    this.publishHeight();
  }

  private setSheetOpen(open: boolean): void {
    this.sheetOpen = open;
    this.applySheetMode();
  }

  /**
   * Phone layout reserves this against the bottom dock. An open sheet covers
   * the dock on purpose, so the reserve stays the handle height and the dock
   * does not jump.
   */
  private publishHeight(): void {
    const source =
      this.phone.matches && this.sheetOpen ? this.handle : this.container;
    const height = source.getBoundingClientRect().height;
    document.documentElement.style.setProperty(
      "--toolbar-height",
      `${Math.round(height * 100) / 100}px`
    );
  }

  private updateOverflow(): void {
    const el = this.body;
    if (this.container.classList.contains("is-collapsed")) {
      this.container.dataset.overflow = "none";
      return;
    }
    const down = el.scrollHeight - el.clientHeight;
    if (down <= 2) {
      this.container.dataset.overflow = "none";
      return;
    }
    const pos = el.scrollTop;
    const atStart = pos <= 2;
    const atEnd = pos >= down - 2;
    this.container.dataset.overflow = atStart
      ? "end"
      : atEnd
        ? "start"
        : "both";
  }
}
