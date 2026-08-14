import type { MapOverlay } from "../overlays/types";

/**
 * A vertical toolbar of icon + label toggles, one per map overlay. Reflects and
 * flips each overlay's on/off state.
 */
export class Toolbar {
  private readonly buttons = new Map<string, HTMLButtonElement>();
  private readonly container: HTMLElement;

  constructor(
    container: HTMLElement,
    overlays: MapOverlay[],
    onToggle: (overlay: MapOverlay, on: boolean) => void,
    // Initial pressed state (e.g. a restored session); defaults to defaultOn.
    isOn: (overlay: MapOverlay) => boolean = (o) => Boolean(o.defaultOn)
  ) {
    this.container = container;
    container.classList.add("toolbar");
    container.setAttribute("role", "group");
    container.setAttribute("aria-label", "Map overlays");

    for (const overlay of overlays) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "toolbar__item";
      button.title = overlay.label;
      button.setAttribute("aria-pressed", String(isOn(overlay)));
      button.innerHTML =
        `<span class="toolbar__icon">${overlay.icon}</span>` +
        `<span class="toolbar__label">${overlay.label}</span>`;

      button.addEventListener("click", () => {
        // Still waiting on the last enable's data. A second click here would
        // start a duplicate fetch — or a second geolocation prompt — and leave
        // the pressed state describing something other than what's drawn.
        if (button.dataset.state === "pending") return;
        const on = button.getAttribute("aria-pressed") !== "true";
        button.setAttribute("aria-pressed", String(on));
        onToggle(overlay, on);
      });

      this.buttons.set(overlay.id, button);
      container.appendChild(button);
    }

    // Phone widths turn this column into a horizontally scrolling bottom bar
    // (style.css, "Small-phone layout"), and at 390px three of the nine
    // toggles — Volcanoes, Quakes, My location — start past the right edge.
    // Tab reaches them because focus scrolls them into view; a thumb only
    // finds them by accident. `data-overflow` lets the stylesheet fade
    // whichever edge still has items behind it.
    container.addEventListener("scroll", () => this.updateOverflow(), {
      passive: true,
    });
    if (typeof ResizeObserver !== "undefined") {
      // Catches the breakpoint crossing and orientation changes, both of
      // which resize the bar without scrolling it.
      new ResizeObserver(() => this.updateOverflow()).observe(container);
    }
    this.updateOverflow();
  }

  private updateOverflow(): void {
    const el = this.container;
    const max = el.scrollWidth - el.clientWidth;
    // Sub-pixel layout leaves a fractional remainder even with nothing to
    // scroll, so treat anything under 2px as "no hidden items" — a fade over
    // half a pixel of content would be a lie.
    if (max <= 2) {
      el.dataset.overflow = "none";
      return;
    }
    const atStart = el.scrollLeft <= 2;
    const atEnd = el.scrollLeft >= max - 2;
    el.dataset.overflow = atStart ? "end" : atEnd ? "start" : "both";
  }

  /**
   * Reflect an overlay's pressed state without firing onToggle — for when an
   * enable can't complete (e.g. geolocation denied), so the button snaps back.
   */
  setPressed(overlayId: string, on: boolean): void {
    this.buttons.get(overlayId)?.setAttribute("aria-pressed", String(on));
  }

  /**
   * Mark an overlay's toggle as waiting on its data — the network fetch behind
   * five of these, or the browser's geolocation prompt, which can sit for its
   * full 10s timeout while the visitor decides.
   *
   * Without this the button looked identical the instant it was clicked and
   * once the data had actually landed: same pressed styling, no ARIA state.
   * `aria-busy` gives assistive tech the wait, `data-state` drives the spinner,
   * and the click handler above uses it to swallow impatient double-taps.
   */
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
}
