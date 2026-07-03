/**
 * "Copy link to this view" button. Asks the app for the current shareable URL
 * (main.ts owns the view state), writes it to the clipboard, and flashes a
 * brief confirmation on the button itself.
 */

const LINK_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`;

export class ShareButton {
  private readonly button: HTMLButtonElement;
  private resetTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(container: HTMLElement, getShareUrl: () => string) {
    this.button = document.createElement("button");
    this.button.type = "button";
    this.button.className = "share-button";
    this.button.title = "Copy link to this view";
    this.button.setAttribute("aria-label", "Copy link to this view");
    this.button.innerHTML =
      `<span class="share-button__icon">${LINK_ICON}</span>` +
      `<span class="share-button__label">Share view</span>`;

    this.button.addEventListener("click", () => {
      void this.copy(getShareUrl());
    });

    container.appendChild(this.button);
  }

  private async copy(url: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      this.flash("Link copied!");
    } catch {
      // Clipboard can be blocked (permissions, non-secure context). Show the
      // URL in a prompt as a fallback so the user can still copy it.
      window.prompt("Copy this link:", url);
    }
  }

  private flash(text: string): void {
    const label = this.button.querySelector(".share-button__label");
    if (!label) return;
    const original = "Share view";
    label.textContent = text;
    this.button.classList.add("share-button--copied");
    clearTimeout(this.resetTimer);
    this.resetTimer = setTimeout(() => {
      label.textContent = original;
      this.button.classList.remove("share-button--copied");
    }, 1600);
  }
}
