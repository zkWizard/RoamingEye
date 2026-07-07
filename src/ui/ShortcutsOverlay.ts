import { SHORTCUT_GROUPS } from "../lib/shortcuts";
import { ICONS } from "./icons";

/**
 * A compact keyboard-shortcuts overlay (the ProvidersPage modal pattern):
 * press ? — or the ? button in the header hint — to open, Esc / backdrop /
 * close button to dismiss. Content comes from `src/lib/shortcuts`.
 */
export class ShortcutsOverlay {
  private readonly container: HTMLElement;
  private readonly closeButton: HTMLButtonElement;

  constructor(container: HTMLElement) {
    this.container = container;
    container.classList.add("shortcuts");
    container.setAttribute("role", "dialog");
    container.setAttribute("aria-modal", "true");
    container.setAttribute("aria-label", "Keyboard shortcuts");
    container.innerHTML = `
      <div class="shortcuts__backdrop"></div>
      <div class="shortcuts__panel">
        <header class="shortcuts__header">
          <h2 class="shortcuts__title">Keyboard shortcuts</h2>
          <button class="shortcuts__close" type="button" aria-label="Close">${ICONS.close}</button>
        </header>
        <div class="shortcuts__body"></div>
      </div>`;

    const body = container.querySelector(".shortcuts__body") as HTMLElement;
    for (const group of SHORTCUT_GROUPS) {
      const section = document.createElement("section");
      section.className = "shortcuts__group";
      const title = document.createElement("h3");
      title.className = "shortcuts__group-title";
      title.textContent = group.title;
      section.appendChild(title);

      for (const item of group.items) {
        const row = document.createElement("div");
        row.className = "shortcuts__row";
        const keys = document.createElement("span");
        keys.className = "shortcuts__keys";
        for (const key of item.keys) {
          const kbd = document.createElement("kbd");
          kbd.textContent = key;
          keys.appendChild(kbd);
        }
        const does = document.createElement("span");
        does.className = "shortcuts__does";
        does.textContent = item.does;
        row.append(keys, does);
        section.appendChild(row);
      }
      body.appendChild(section);
    }

    this.closeButton = container.querySelector(
      ".shortcuts__close"
    ) as HTMLButtonElement;
    this.closeButton.addEventListener("click", () => this.close());
    (
      container.querySelector(".shortcuts__backdrop") as HTMLElement
    ).addEventListener("click", () => this.close());
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.close();
    });
  }

  get isOpen(): boolean {
    return this.container.classList.contains("is-open");
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  open(): void {
    this.container.classList.add("is-open");
    this.container.setAttribute("aria-hidden", "false");
    this.closeButton.focus();
  }

  close(): void {
    this.container.classList.remove("is-open");
    this.container.setAttribute("aria-hidden", "true");
  }
}
