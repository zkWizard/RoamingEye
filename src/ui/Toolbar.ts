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

    // The bar scrolls in both layouts, on different axes. Phone widths turn
    // this column into a horizontally scrolling bottom bar (style.css,
    // "Small-phone layout"), where at 390px three of the nine toggles —
    // Volcanoes, Quakes, My location — start past the right edge. Short
    // desktop windows keep the column but cap and scroll it vertically
    // (style.css, "Short desktop windows"), which hides far more: at
    // 1366x768, the most common laptop resolution, only three toggles are on
    // screen. Tab reaches the rest either way because focus scrolls them into
    // view; a mouse or thumb only finds them by accident. `data-overflow`
    // lets the stylesheet fade whichever edge still has items behind it.
    container.addEventListener("scroll", () => this.updateOverflow(), {
      passive: true,
    });
    if (typeof ResizeObserver !== "undefined") {
      // Catches the breakpoint crossing and orientation changes, both of
      // which resize the bar without scrolling it. Observing the border box
      // rather than the content box matters for `publishHeight`: on a notched
      // phone the home-indicator inset arrives as bottom padding, so rotating
      // the device can change the bar's height without touching its content.
      new ResizeObserver(() => {
        this.updateOverflow();
        this.publishHeight();
      }).observe(container, { box: "border-box" });
    }
    this.updateOverflow();
  }

  /**
   * Publish the bar's measured height as `--toolbar-height` on the document
   * root, for the phone layout to reserve room against.
   *
   * At phone widths the bar is pinned across the bottom of the screen and
   * `.overlay--bottom` moves up to clear it. That reserve used to be a flat
   * `3.6rem`, which was 18px short of the 76px the bar actually measures, so
   * the attribution's last line rendered underneath the bar and the toolbar
   * received the taps meant for the data-providers, repository and feedback
   * links. Measuring instead of guessing keeps the two in step as the bar's
   * contents change, and covers the home indicator for free:
   * `env(safe-area-inset-bottom)` sits in the bar's own padding, so it is
   * already inside this number.
   *
   * The value is published at every width — the desktop column is metadata
   * about the same element — but only the phone layout reads it.
   */
  private publishHeight(): void {
    const height = this.container.getBoundingClientRect().height;
    document.documentElement.style.setProperty(
      "--toolbar-height",
      `${Math.round(height * 100) / 100}px`
    );
  }

  private updateOverflow(): void {
    const el = this.container;
    // Measure whichever axis actually overflows rather than assuming one:
    // the same bar is a horizontal scroller on a phone and a vertical one in
    // a short desktop window. Comparing the two (instead of testing only the
    // larger dimension) keeps the layout's own flex direction out of it.
    const down = el.scrollHeight - el.clientHeight;
    const across = el.scrollWidth - el.clientWidth;
    const vertical = down > across;
    const max = vertical ? down : across;
    // Sub-pixel layout leaves a fractional remainder even with nothing to
    // scroll, so treat anything under 2px as "no hidden items" — a fade over
    // half a pixel of content would be a lie.
    if (max <= 2) {
      el.dataset.overflow = "none";
      return;
    }
    const pos = vertical ? el.scrollTop : el.scrollLeft;
    const atStart = pos <= 2;
    const atEnd = pos >= max - 2;
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
