/**
 * A single polite live region for outcomes that are otherwise only visible.
 *
 * Some state changes report themselves to everyone: an error gets a toast
 * (`role="alert"`), a pressed toggle gets `aria-pressed`. Others land purely on
 * the globe — markers appearing after a fetch — where the only confirmation is
 * pixels. This is the voice for those: text written here is announced without
 * moving focus or painting anything.
 *
 * Two constraints shape the implementation:
 *
 * - The region is rendered at all times and starts empty. A live region hidden
 *   with `hidden`/`display: none` is outside the accessibility tree, so text
 *   written into it changes nothing an assistive technology can observe — the
 *   same trap the toast and the offline banner were caught by.
 * - Each announcement is a FRESH child element rather than a rewrite of the
 *   same text node, so repeating an outcome still announces. Assigning an
 *   identical string is easily treated as "nothing changed", which would make
 *   the second of two identical results silent — exactly when a user is most
 *   likely to be checking whether their retry did anything.
 */
export class Announcer {
  private readonly root: HTMLDivElement;

  constructor(parent: HTMLElement = document.body) {
    this.root = document.createElement("div");
    this.root.className = "announcer sr-only";
    this.root.setAttribute("role", "status");
    parent.appendChild(this.root);
  }

  announce(message: string): void {
    const line = document.createElement("p");
    line.textContent = message;
    this.root.replaceChildren(line);
  }
}
