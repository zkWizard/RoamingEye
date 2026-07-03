/**
 * Research export actions: download the current view as a PNG (for figures
 * and slides) and copy the raw GIBS imagery URL for the active layer + month
 * (for pipelines and citations). main.ts supplies both via callbacks.
 */

const DOWNLOAD_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>`;
const URL_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 17V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"/><path d="M8 9h8M8 13h5"/></svg>`;

export interface ExportActions {
  /** Trigger a PNG download of the current canvas. */
  downloadPng: () => void;
  /** The GIBS WMS URL for the active layer + month. */
  imageryUrl: () => string;
}

export class ExportControls {
  private resetTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(container: HTMLElement, actions: ExportActions) {
    container.classList.add("export");

    const png = this.makeButton(
      DOWNLOAD_ICON,
      "Save PNG",
      "Download this view as a PNG"
    );
    png.addEventListener("click", () => actions.downloadPng());

    const url = this.makeButton(
      URL_ICON,
      "Imagery URL",
      "Copy the GIBS imagery URL for this layer and month"
    );
    url.addEventListener("click", () => {
      void this.copy(url, actions.imageryUrl());
    });

    container.append(png, url);
  }

  private makeButton(
    icon: string,
    label: string,
    title: string
  ): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "export__button";
    button.title = title;
    button.setAttribute("aria-label", title);
    button.innerHTML =
      `<span class="export__icon">${icon}</span>` +
      `<span class="export__label">${label}</span>`;
    return button;
  }

  private async copy(button: HTMLButtonElement, text: string): Promise<void> {
    const label = button.querySelector(".export__label");
    try {
      await navigator.clipboard.writeText(text);
      if (label) {
        label.textContent = "Copied!";
        clearTimeout(this.resetTimer);
        this.resetTimer = setTimeout(() => {
          label.textContent = "Imagery URL";
        }, 1600);
      }
    } catch {
      // Clipboard can be blocked (permissions, non-secure context) — fall back
      // to a prompt so the URL is still reachable.
      window.prompt("Copy this imagery URL:", text);
    }
  }
}
