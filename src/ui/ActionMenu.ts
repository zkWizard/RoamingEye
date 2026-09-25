/**
 * The actions pill's More menu: a disclosure, not an ARIA menu. The trigger
 * carries `aria-expanded`, and the items are ordinary buttons in tab order, so
 * Tab walks into them straight from the trigger and a screen reader reads them
 * as the buttons they are.
 *
 * It closes on Escape (with focus back on the trigger), on a press outside it,
 * when focus leaves it, and when an item is chosen. Choosing runs in the
 * capture phase, before the item's own handler: an item that opens a panel
 * (Find software, the shortcuts sheet) hands focus into that panel, and the
 * panel's FocusTrap records where focus came from so it can return it on
 * close. Moving focus to the trigger first means the trap records the
 * trigger, which stays on screen, not an item the menu is about to hide.
 *
 * The exports are the exception: they report in place ("Copied!", a download
 * starting), so choosing one leaves the menu open to show it.
 */
export class ActionMenu {
  constructor(
    private readonly trigger: HTMLElement,
    private readonly menu: HTMLElement
  ) {
    trigger.addEventListener("click", () => {
      if (this.isOpen) this.close(false);
      else this.open();
    });

    menu.addEventListener(
      "click",
      (e) => {
        const item = (e.target as Element).closest("button");
        if (item && !item.closest("#export")) this.close(true);
      },
      { capture: true }
    );

    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || !this.isOpen) return;
      e.preventDefault();
      this.close(true);
    });

    document.addEventListener(
      "pointerdown",
      (e) => {
        if (this.isOpen && !this.owns(e.target)) this.close(false);
      },
      { capture: true }
    );

    // Tabbing past the last item, or `?` raising the shortcuts sheet over it.
    menu.addEventListener("focusout", (e) => {
      if (this.isOpen && !this.owns(e.relatedTarget)) this.close(false);
    });
  }

  get isOpen(): boolean {
    return !this.menu.hidden;
  }

  open(): void {
    this.menu.hidden = false;
    this.trigger.setAttribute("aria-expanded", "true");
  }

  close(focusTrigger: boolean): void {
    this.menu.hidden = true;
    this.trigger.setAttribute("aria-expanded", "false");
    if (focusTrigger) this.trigger.focus();
  }

  private owns(target: EventTarget | null): boolean {
    return (
      target instanceof Node &&
      (this.menu.contains(target) || this.trigger.contains(target))
    );
  }
}
