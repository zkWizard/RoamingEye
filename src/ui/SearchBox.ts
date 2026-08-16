import { geocode, type GeoResult } from "../lib/geocoding";
import { ICONS } from "./icons";

/** Stable ids so the input can point at the popup and its active option. */
const LIST_ID = "search-results";
const optionId = (index: number): string => `${LIST_ID}-option-${index}`;

interface Entry {
  readonly result: GeoResult;
  readonly primary: string;
}

/**
 * A search field (top-right) that geocodes place names via Nominatim and lists
 * matches. Selecting a result hands it to the caller (which flies the globe to
 * it and highlights its border).
 *
 * The popup is an ARIA 1.2 combobox rather than a bare list. That pattern is
 * what makes the results operable without a mouse: the `<li>`s are not
 * focusable, so before this the only way to choose a match was to click one —
 * Tab skipped the popup entirely and went to the next chrome button, leaving a
 * keyboard-only user able to search but never to pick. Keeping focus on the
 * input and pointing `aria-activedescendant` at the highlighted option (rather
 * than moving focus into the list) is what lets typing, arrowing and selecting
 * stay one uninterrupted gesture.
 */
export class SearchBox {
  private readonly input: HTMLInputElement;
  private readonly results: HTMLUListElement;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private controller: AbortController | undefined;
  private options: HTMLLIElement[] = [];
  private entries: Entry[] = [];
  private activeIndex = -1;

  constructor(
    container: HTMLElement,
    private readonly onSelect: (result: GeoResult) => void
  ) {
    container.classList.add("search");
    // A <label>, not a <div>: the input is only ~20px tall, so on a phone the
    // icon and the field's padding — roughly half its visible height — were
    // dead pixels that swallowed the tap. Implicit label association makes the
    // whole field focus the input, at no cost to the accessible name (the icon
    // is aria-hidden, and the input's own aria-label still wins).
    container.innerHTML = `
      <label class="search__field">
        <span class="search__icon">${ICONS.search}</span>
        <input class="search__input" type="search" placeholder="Search a place…"
          autocomplete="off" autocapitalize="off" spellcheck="false"
          aria-label="Search for a place" role="combobox"
          aria-autocomplete="list" aria-expanded="false"
          aria-controls="${LIST_ID}" />
      </label>
      <ul class="search__results" id="${LIST_ID}" role="listbox"></ul>`;

    this.input = container.querySelector(".search__input") as HTMLInputElement;
    this.results = container.querySelector(
      ".search__results"
    ) as HTMLUListElement;

    this.input.addEventListener("input", () => this.onInput());
    this.input.addEventListener("keydown", (e) => this.onKeydown(e));
    document.addEventListener("pointerdown", (e) => {
      if (!container.contains(e.target as Node)) this.closeResults();
    });
  }

  /**
   * Arrows move the highlight (wrapping, as the layer listbox does), Home/End
   * jump, Enter takes the highlighted match, Escape clears the field. Enter is
   * only intercepted when something is highlighted, so a plain Enter on a typed
   * query still falls through to the browser's default.
   */
  private onKeydown(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      this.clear();
      return;
    }
    const count = this.options.length;
    if (count === 0) return;

    let next: number;
    switch (e.key) {
      case "ArrowDown":
        next = this.activeIndex < 0 ? 0 : (this.activeIndex + 1) % count;
        break;
      case "ArrowUp":
        next =
          this.activeIndex < 0
            ? count - 1
            : (this.activeIndex - 1 + count) % count;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = count - 1;
        break;
      case "Enter":
        if (this.activeIndex < 0) return;
        e.preventDefault();
        this.choose(this.activeIndex);
        return;
      default:
        return;
    }
    e.preventDefault();
    this.setActive(next);
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
    this.options = [];
    this.entries = [];

    results.forEach((result, index) => {
      const primary = result.name || result.displayName.split(",")[0];
      const secondary = result.displayName
        .replace(`${primary}, `, "")
        .replace(primary, "");

      const li = document.createElement("li");
      li.className = "search__result";
      li.id = optionId(index);
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", "false");
      li.innerHTML =
        `<span class="search__result-name">${escapeHtml(primary)}</span>` +
        `<span class="search__result-sub">${escapeHtml(secondary)}</span>`;
      li.addEventListener("click", () => this.choose(index));
      // Track the pointer with the same highlight the arrows move, so hovering
      // and arrowing cannot leave two rows looking equally chosen.
      li.addEventListener("pointerenter", () => this.setActive(index));
      this.results.appendChild(li);
      this.options.push(li);
      this.entries.push({ result, primary });
    });

    this.setActive(-1);
    this.setOpen(results.length > 0);
  }

  /** A single non-interactive status row (failure / no matches). */
  private renderMessage(text: string): void {
    this.results.innerHTML = "";
    this.options = [];
    this.entries = [];
    this.activeIndex = -1;
    this.input.removeAttribute("aria-activedescendant");

    const li = document.createElement("li");
    li.className = "search__message";
    // Not an option: it cannot be chosen, so it must not be counted as one by
    // anything walking the listbox.
    li.setAttribute("role", "presentation");
    li.setAttribute("aria-live", "polite");
    li.textContent = text;
    this.results.appendChild(li);
    this.setOpen(true);
  }

  /** Move the highlight; `-1` clears it. Focus stays on the input throughout. */
  private setActive(index: number): void {
    this.activeIndex = index;
    this.options.forEach((li, i) => {
      const on = i === index;
      li.classList.toggle("is-active", on);
      li.setAttribute("aria-selected", String(on));
    });
    const active = this.options[index];
    if (active) {
      this.input.setAttribute("aria-activedescendant", active.id);
      // The popup scrolls at 50vh, so a wrapped highlight can land off-screen.
      active.scrollIntoView({ block: "nearest" });
    } else {
      this.input.removeAttribute("aria-activedescendant");
    }
  }

  private choose(index: number): void {
    const entry = this.entries[index];
    if (!entry) return;
    this.input.value = entry.primary;
    this.closeResults();
    this.onSelect(entry.result);
  }

  private setOpen(open: boolean): void {
    this.results.classList.toggle("is-open", open);
    this.input.setAttribute("aria-expanded", String(open));
  }

  private closeResults(): void {
    this.results.innerHTML = "";
    this.options = [];
    this.entries = [];
    this.activeIndex = -1;
    this.input.removeAttribute("aria-activedescendant");
    this.setOpen(false);
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
