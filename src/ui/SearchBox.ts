import { geocode, type GeoResult } from "../lib/geocoding";
import { ICONS } from "./icons";

/**
 * A search field (top-right) that geocodes place names via Nominatim and lists
 * matches. Selecting a result hands it to the caller (which flies the globe to
 * it and highlights its border).
 */
export class SearchBox {
  private readonly input: HTMLInputElement;
  private readonly results: HTMLUListElement;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private controller: AbortController | undefined;

  constructor(
    container: HTMLElement,
    private readonly onSelect: (result: GeoResult) => void
  ) {
    container.classList.add("search");
    container.innerHTML = `
      <div class="search__field">
        <span class="search__icon">${ICONS.search}</span>
        <input class="search__input" type="search" placeholder="Search a place…"
          autocomplete="off" autocapitalize="off" spellcheck="false"
          aria-label="Search for a place" />
      </div>
      <ul class="search__results" role="listbox"></ul>`;

    this.input = container.querySelector(".search__input") as HTMLInputElement;
    this.results = container.querySelector(
      ".search__results"
    ) as HTMLUListElement;

    this.input.addEventListener("input", () => this.onInput());
    this.input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.clear();
    });
    document.addEventListener("pointerdown", (e) => {
      if (!container.contains(e.target as Node)) this.closeResults();
    });
  }

  private onInput(): void {
    const query = this.input.value.trim();
    clearTimeout(this.debounceTimer);
    if (query.length < 2) {
      this.closeResults();
      return;
    }
    this.debounceTimer = setTimeout(() => void this.run(query), 300);
  }

  private async run(query: string): Promise<void> {
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    try {
      const results = await geocode(query, controller.signal);
      if (controller.signal.aborted) return;
      if (results.length === 0) this.renderMessage("No matches");
      else this.render(results);
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        console.warn("RoamingEye: search failed", err);
        this.renderMessage("Search unavailable — check connection");
      }
    }
  }

  private render(results: GeoResult[]): void {
    this.results.innerHTML = "";
    for (const result of results) {
      const primary = result.name || result.displayName.split(",")[0];
      const secondary = result.displayName
        .replace(`${primary}, `, "")
        .replace(primary, "");

      const li = document.createElement("li");
      li.className = "search__result";
      li.setAttribute("role", "option");
      li.innerHTML =
        `<span class="search__result-name">${escapeHtml(primary)}</span>` +
        `<span class="search__result-sub">${escapeHtml(secondary)}</span>`;
      li.addEventListener("click", () => {
        this.input.value = primary;
        this.closeResults();
        this.onSelect(result);
      });
      this.results.appendChild(li);
    }
    this.results.classList.toggle("is-open", results.length > 0);
  }

  /** A single non-interactive status row (failure / no matches). */
  private renderMessage(text: string): void {
    this.results.innerHTML = "";
    const li = document.createElement("li");
    li.className = "search__message";
    li.setAttribute("aria-live", "polite");
    li.textContent = text;
    this.results.appendChild(li);
    this.results.classList.add("is-open");
  }

  private closeResults(): void {
    this.results.innerHTML = "";
    this.results.classList.remove("is-open");
  }

  private clear(): void {
    this.input.value = "";
    this.closeResults();
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
