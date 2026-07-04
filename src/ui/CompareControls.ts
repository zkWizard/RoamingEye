import { splitFromPointer, compareCaption } from "../lib/compare";
import { formatYm, type YearMonth } from "../lib/timeline";

/**
 * Comparison-mode UI: the toggle button (top-right cluster) and, while
 * comparing, a draggable divider over the globe with a date chip on each side
 * (left = pinned "before", right = the live timeline month).
 */

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
  private active = false;
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
    handle.setAttribute("aria-label", "Comparison divider — drag to sweep");

    this.divider.append(this.pinnedChip, handle, this.liveChip);

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
  setLiveMonth(ym: YearMonth): void {
    this.liveMonth = ym;
    this.liveChip.textContent = formatYm(ym);
    this.updateCaption();
  }

  /** Called by the app once the pinned month is known/loaded. */
  showDivider(pinned: YearMonth, split: number): void {
    this.pinnedChip.textContent = `${formatYm(pinned)} · pinned`;
    this.pinnedMonth = pinned;
    this.divider.style.left = `${split * 100}%`;
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
  restore(pinned: YearMonth, split: number): void {
    this.setActive(true);
    this.showDivider(pinned, split);
  }

  private pinnedMonth: YearMonth | undefined;
  private liveMonth: YearMonth | undefined;

  private updateCaption(): void {
    if (this.pinnedMonth && this.liveMonth) {
      this.divider.title = compareCaption(this.pinnedMonth, this.liveMonth);
    }
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
      this.divider.classList.remove("is-visible");
      this.divider.setAttribute("aria-hidden", "true");
      this.callbacks.onDisable();
    }
  }

  private moveTo(clientX: number): void {
    const fraction = splitFromPointer(clientX, window.innerWidth);
    this.divider.style.left = `${fraction * 100}%`;
    this.callbacks.onSplitChange(fraction);
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
