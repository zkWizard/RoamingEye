/**
 * Research export actions: download the current view as a PNG (for figures
 * and slides) and copy the raw GIBS imagery URL for every month the view is
 * built from — one normally, one per side while comparing (for pipelines and
 * citations). main.ts supplies both via callbacks.
 *
 * The copy button's confirmation needs a voice for the same reason the share
 * button's does: a copy flips no state, the accessible name is pinned by
 * `aria-label`, and the clipboard is silent, so the "Copied!" swap reaches
 * sighted users only. The announcement names what was copied — once the label
 * is not the accessible name, a bare "Copied!" has lost its subject.
 */

const DOWNLOAD_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>`;
const URL_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 17V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"/><path d="M8 9h8M8 13h5"/></svg>`;

export interface ExportActions {
  /** Trigger a PNG download of the current canvas. */
  downloadPng: () => void;
  /** GIBS WMS URLs for the active layer, one per month on screen, newline-separated. */
  imageryUrl: () => string;
}

export class ExportControls {
  private resetTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    container: HTMLElement,
    actions: ExportActions,
    private readonly announce?: (message: string) => void
  ) {
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
      "Copy the GIBS imagery URL for each month on screen"
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
      this.announce?.("Imagery URL copied");
      if (label) {
        label.textContent = "Copied!";
        clearTimeout(this.resetTimer);
        this.resetTimer = setTimeout(() => {
          label.textContent = "Imagery URL";
        }, 1600);
      }
    } catch {
      // Clipboard can be blocked (permissions, non-secure context) — fall back
      // to a prompt so the URL is still reachable. A comparison copies one URL
      // per month, and a prompt's single-line input would swallow the newline
      // between them, so each URL gets its own prompt rather than one that
      // silently hands back half the pair.
      const urls = text.split("\n");
      urls.forEach((url, i) => {
        const which = urls.length > 1 ? ` (${i + 1} of ${urls.length})` : "";
        window.prompt(`Copy this imagery URL${which}:`, url);
      });
    }
  }
}
