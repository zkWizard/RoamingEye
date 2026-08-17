import {
  splitFromPointer,
  compareCaption,
  clampSplit,
  MIN_SPLIT,
  MAX_SPLIT,
} from "../lib/compare";
import {
  formatTimelineLabel,
  type LayerConfig,
  type YearMonth,
} from "../lib/timeline";

/**
 * Comparison-mode UI: the toggle button (top-right cluster) and, while
 * comparing, a draggable divider over the globe with a date chip on each side
 * (left = pinned "before", right = the live timeline month).
 *
 * Both chips carry the layer so their dates read at its publishing cadence —
 * an annual product is dated by year, never by the placeholder month its
 * timeline entries are built from (see `compareCaption`).
 *
 * The handle is a WAI-ARIA window splitter: focusable, arrow-operable, and
 * carrying its position as a value. It advertised `role="separator"` and named
 * itself "drag to sweep" from the start, but had no `tabindex`, no key
 * handler, and no `aria-valuenow` — so the seam could only ever be moved by
 * pointer. A keyboard or screen-reader user could enable compare, and then
 * read two months frozen at a 50/50 split with no way to sweep between them:
 * the toggle worked and the workflow it exists for did not. Sweeping IS the
 * comparison — pre/post eruption, drought years, decade-apart snowlines are
 * all read by moving the seam across the feature — so this was the app's core
 * change-detection gesture being pointer-only, not a rough edge on it.
 *
 * Arrows step 1% for placing the seam on a coastline or a caldera rim,
 * Shift/PageUp/PageDown 10% to cross the globe, Home/End go to the clamped
 * extremes. `aria-valuetext` names the months rather than reading a bare
 * percentage, so each step announces which month now holds which side.
 */

/** Arrow-key step, as a fraction of viewport width; Shift and PageUp/Dn take the coarse one. */
const FINE_STEP = 0.01;
const COARSE_STEP = 0.1;

/** ARIA reports the split as a percentage, matching the CSS `left` it drives. */
const toPercent = (fraction: number): number => Math.round(fraction * 100);

const COMPARE_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v18"/><path d="M8 7H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h3"/><path d="M16 7h3a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-3"/></svg>`;

export interface CompareCallbacks {
  /** Try to start comparing; return false if unavailable (static layer). */
  onEnable: () => boolean;
  onDisable: () => void;
  onSplitChange: (fraction: number) => void;
}

export class CompareControls {
  private readonly button: HTMLButtonElement;
  private readonly divider: HTMLElement;
  private readonly pinnedChip: HTMLElement;
  private readonly liveChip: HTMLElement;
  private readonly handle: HTMLElement;
  private active = false;
  private split = 0.5;
  private resetTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    buttonMount: HTMLElement,
    dividerMount: HTMLElement,
    private readonly callbacks: CompareCallbacks
  ) {
    this.button = document.createElement("button");
    this.button.type = "button";
    this.button.className = "compare-button";
    this.button.title = "Compare with another month";
    this.button.setAttribute("aria-pressed", "false");
    this.button.innerHTML =
      `<span class="compare-button__icon">${COMPARE_ICON}</span>` +
      `<span class="compare-button__label">Compare</span>`;
    this.button.addEventListener("click", () => this.toggle());
    buttonMount.appendChild(this.button);

    this.divider = dividerMount;
    this.divider.classList.add("compare-divider");
    this.divider.setAttribute("aria-hidden", "true");

    this.pinnedChip = document.createElement("span");
    this.pinnedChip.className =
      "compare-divider__chip compare-divider__chip--pinned";
    this.liveChip = document.createElement("span");
    this.liveChip.className =
      "compare-divider__chip compare-divider__chip--live";

    const handle = document.createElement("div");
    handle.className = "compare-divider__handle";
    handle.setAttribute("role", "separator");
    handle.setAttribute(
      "aria-label",
      "Comparison divider — drag or use arrow keys to sweep"
    );
    // A separator only counts as a splitter once it is focusable and carries a
    // value; without both, assistive tech reads a static line.
    handle.tabIndex = 0;
    handle.setAttribute("aria-orientation", "vertical");
    handle.setAttribute("aria-valuemin", String(toPercent(MIN_SPLIT)));
    handle.setAttribute("aria-valuemax", String(toPercent(MAX_SPLIT)));
    handle.addEventListener("keydown", (e) => this.onKeyDown(e));
    this.handle = handle;

    this.divider.append(this.pinnedChip, handle, this.liveChip);
    this.applySplit(this.split, false);

    // Drag anywhere on the divider (pointer capture keeps fast drags smooth).
    this.divider.addEventListener("pointerdown", (e) => {
      this.divider.setPointerCapture(e.pointerId);
      this.moveTo(e.clientX);
    });
    this.divider.addEventListener("pointermove", (e) => {
      if (this.divider.hasPointerCapture(e.pointerId)) this.moveTo(e.clientX);
    });
  }

  /** Reflect the timeline month on the live ("after") chip. */
  setLiveMonth(layer: LayerConfig, ym: YearMonth): void {
    this.layer = layer;
    this.liveMonth = ym;
    this.liveChip.textContent = formatTimelineLabel(layer, ym);
    this.updateCaption();
  }

  /** Called by the app once the pinned month is known/loaded. */
  showDivider(layer: LayerConfig, pinned: YearMonth, split: number): void {
    this.layer = layer;
    this.pinnedChip.textContent = `${formatTimelineLabel(layer, pinned)} · pinned`;
    this.pinnedMonth = pinned;
    // The split arrives from the controller (deep links restore one), so this
    // reflects it rather than notifying it back.
    this.applySplit(split, false);
    this.divider.classList.add("is-visible");
    this.divider.setAttribute("aria-hidden", "false");
    this.updateCaption();
  }

  /** Force-exit compare (e.g. on layer switch). No-op when inactive. */
  exit(): void {
    if (this.active) this.setActive(false);
  }

  /**
   * Restore an already-running comparison (deep link): reflect the active
   * state and show the divider without going through the enable callback.
   */
  restore(layer: LayerConfig, pinned: YearMonth, split: number): void {
    this.setActive(true);
    this.showDivider(layer, pinned, split);
  }

  private layer: LayerConfig | undefined;
  private pinnedMonth: YearMonth | undefined;
  private liveMonth: YearMonth | undefined;

  private updateCaption(): void {
    if (this.layer && this.pinnedMonth && this.liveMonth) {
      this.divider.title = compareCaption(
        this.layer,
        this.pinnedMonth,
        this.liveMonth
      );
    }
    this.updateValueText();
  }

  /**
   * What each arrow press announces. A bare "62" tells a screen-reader user
   * nothing about a change-detection view, so the value is read back as the
   * share of the globe each month currently holds — pinned ("before") on the
   * left, the live timeline month on the right, both through the layer's own
   * formatter so an annual product still reads as a year.
   */
  private updateValueText(): void {
    const pct = toPercent(this.split);
    if (this.layer && this.pinnedMonth && this.liveMonth) {
      const pinned = formatTimelineLabel(this.layer, this.pinnedMonth);
      const live = formatTimelineLabel(this.layer, this.liveMonth);
      this.handle.setAttribute(
        "aria-valuetext",
        `${pct}% ${pinned}, ${100 - pct}% ${live}`
      );
    } else {
      this.handle.setAttribute("aria-valuetext", `${pct}%`);
    }
  }

  /** Single writer for the seam: CSS position, ARIA value, and the callback. */
  private applySplit(fraction: number, notify: boolean): void {
    this.split = clampSplit(fraction);
    this.divider.style.left = `${this.split * 100}%`;
    this.handle.setAttribute("aria-valuenow", String(toPercent(this.split)));
    this.updateValueText();
    if (notify) this.callbacks.onSplitChange(this.split);
  }

  private onKeyDown(e: KeyboardEvent): void {
    const step = e.shiftKey ? COARSE_STEP : FINE_STEP;
    let next: number;
    switch (e.key) {
      case "ArrowLeft":
        next = this.split - step;
        break;
      case "ArrowRight":
        next = this.split + step;
        break;
      case "PageDown":
        next = this.split - COARSE_STEP;
        break;
      case "PageUp":
        next = this.split + COARSE_STEP;
        break;
      case "Home":
        next = MIN_SPLIT;
        break;
      case "End":
        next = MAX_SPLIT;
        break;
      default:
        return;
    }
    // Only after a key we actually handle: Tab and Esc must still get out.
    e.preventDefault();
    this.applySplit(next, true);
  }

  private toggle(): void {
    if (this.active) {
      this.setActive(false); // setActive(false) notifies onDisable
      return;
    }
    if (!this.callbacks.onEnable()) {
      this.flash("No time dimension");
      return;
    }
    this.setActive(true);
  }

  private setActive(on: boolean): void {
    this.active = on;
    this.button.setAttribute("aria-pressed", String(on));
    this.button.classList.toggle("compare-button--active", on);
    if (!on) {
      // The divider goes display:none here, so a keyboard user who was
      // sweeping when compare exited (their own toggle, or a layer switch
      // calling exit()) would lose focus to <body>. Hand it back to the
      // button that owns the mode.
      const wasSweeping = this.divider.contains(document.activeElement);
      this.divider.classList.remove("is-visible");
      this.divider.setAttribute("aria-hidden", "true");
      if (wasSweeping) this.button.focus();
      this.callbacks.onDisable();
    }
  }

  private moveTo(clientX: number): void {
    this.applySplit(splitFromPointer(clientX, window.innerWidth), true);
  }

  private flash(text: string): void {
    const label = this.button.querySelector(".compare-button__label");
    if (!label) return;
    label.textContent = text;
    clearTimeout(this.resetTimer);
    this.resetTimer = setTimeout(() => {
      label.textContent = "Compare";
    }, 1600);
  }
}
