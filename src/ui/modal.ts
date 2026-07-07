/**
 * Focus management for modal overlays: trap Tab/Shift-Tab inside the panel
 * while open, and hand focus back to whatever had it when the modal closes.
 * Shared by ProvidersPage and ShortcutsOverlay.
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

export class FocusTrap {
  private previous: HTMLElement | null = null;
  private panel: HTMLElement | null = null;
  private readonly onKeydown = (e: KeyboardEvent): void => {
    if (e.key !== "Tab" || !this.panel) return;
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

  /** Start trapping inside `panel`; focuses its first control. */
  activate(panel: HTMLElement): void {
    this.previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    this.panel = panel;
    document.addEventListener("keydown", this.onKeydown, true);
    panel.querySelector<HTMLElement>(FOCUSABLE)?.focus();
  }

  /** Stop trapping and restore focus to the pre-open element. */
  deactivate(): void {
    if (!this.panel) return;
    this.panel = null;
    document.removeEventListener("keydown", this.onKeydown, true);
    this.previous?.focus();
    this.previous = null;
  }
}
