/**
 * Focus management for modal overlays: trap Tab/Shift-Tab inside the panel
 * while open, and hand focus back to whatever had it when the modal closes.
 * Shared by ProvidersPage, ShortcutsOverlay, SoftwareFinder and FleetDashboard.
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Open traps, oldest first. Only the last one acts.
 *
 * Two overlays can be open at once — pressing `?` raises the shortcuts sheet
 * over whichever panel the reader already had open — and every trap listens on
 * `document` in the capture phase, so without this both of them handle the same
 * Tab. Each sees focus sitting outside its own panel and pulls it back in, so
 * the two cancel: the reader presses Tab and lands on the button they started
 * from, every time, with no way into either panel's content. Escape was the
 * only way out. Deferring to the topmost trap makes the sheet on top behave
 * exactly as it does when it is the only thing open.
 */
const openTraps: FocusTrap[] = [];

/** Keypresses a trap has already acted on — see `claims`. */
const claimed = new WeakSet<Event>();

export class FocusTrap {
  private previous: HTMLElement | null = null;
  private panel: HTMLElement | null = null;
  private readonly onKeydown = (e: KeyboardEvent): void => {
    if (e.key !== "Tab" || !this.panel) return;
    // Covered by the overlay above us: let it own the key.
    if (!this.isTopmost()) return;
    const focusables = Array.from(
      this.panel.querySelectorAll<HTMLElement>(FOCUSABLE)
    ).filter((el) => el.offsetParent !== null);
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    // Cycle at the edges (and pull strays back in if focus escaped).
    if (e.shiftKey && (active === first || !this.panel.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (
      !e.shiftKey &&
      (active === last || !this.panel.contains(active))
    ) {
      e.preventDefault();
      first.focus();
    }
  };

  /** True while this trap is the topmost open one. */
  private isTopmost(): boolean {
    return openTraps[openTraps.length - 1] === this;
  }

  /**
   * True when this trap should act on `event` — it is on top, and no trap has
   * already claimed this same keypress.
   *
   * Escape needs the second half. Every overlay listens on `document`, so one
   * press runs all of their handlers in turn, and "am I on top?" is not stable
   * across that: the topmost overlay closes first and pops itself off the
   * stack, so the panel underneath finds *itself* on top while the same event
   * is still being dispatched, and closes too. Claiming the event settles the
   * question once, whatever order the listeners happen to run in.
   */
  claims(event: Event): boolean {
    if (!this.isTopmost() || claimed.has(event)) return false;
    claimed.add(event);
    return true;
  }

  /** Start trapping inside `panel`; focuses its first control. */
  activate(panel: HTMLElement): void {
    // Already trapping: a second activate would stack this trap twice and
    // overwrite the element focus has to return to.
    if (this.panel) return;
    this.previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    this.panel = panel;
    openTraps.push(this);
    document.addEventListener("keydown", this.onKeydown, true);
    panel.querySelector<HTMLElement>(FOCUSABLE)?.focus();
  }

  /** Stop trapping and restore focus to the pre-open element. */
  deactivate(): void {
    if (!this.panel) return;
    this.panel = null;
    const index = openTraps.lastIndexOf(this);
    if (index !== -1) openTraps.splice(index, 1);
    document.removeEventListener("keydown", this.onKeydown, true);
    this.previous?.focus();
    this.previous = null;
  }
}
