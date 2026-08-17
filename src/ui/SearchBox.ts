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
 *
 * What came back is spoken through the shared announcer. Every search makes the
 * user wait — a 300 ms debounce and then a network round trip — and the only
 * thing that reported the ending was `aria-expanded`, which flips to true for
 * all three outcomes alike: matches, "No matches", and an unreachable geocoder.
 * "Expanded" over an empty popup is worse than silence, and the status row that
 * was meant to cover the empty cases could not: it was built with its text
 * already inside it and then inserted, and a live region that arrives holding
 * its message has not changed, so there was nothing for a screen reader to
 * observe.
 */
export class SearchBox {
  private readonly root: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly results: HTMLUListElement;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private controller: AbortController | undefined;
  private options: HTMLLIElement[] = [];
  private entries: Entry[] = [];
  private activeIndex = -1;
  private pendingAnnounce: ReturnType<typeof setTimeout> | undefined;

  constructor(
    container: HTMLElement,
    private readonly onSelect: (result: GeoResult) => void,
    private readonly announce: (message: string) => void = () => {}
  ) {
    container.classList.add("search");
    this.root = container;
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
    this.renderPending();
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
    this.clearPending();
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
    this.announce(
      results.length === 1 ? "1 match" : `${results.length} matches`
    );
  }

  /**
   * The in-flight state. Every search makes the user wait — a 300 ms debounce,
   * then a rate gate that spaces Nominatim hits ≥1 s apart, then the round trip
   * itself — and until this the popup stayed shut for all of it: no row, and
   * `aria-expanded` still false. A slow network showed nothing for ~2.5 s, and
   * an unreachable geocoder showed nothing for as long as `fetchJson` takes to
   * exhaust a 12 s timeout and its one retry, so the "Search unavailable" row
   * that does exist could be ~24 s behind the keystroke that earned it. Silence
   * that long reads as a dead control, and retyping to check restarts the whole
   * wait, which is the one thing that cannot help.
   *
   * `aria-busy` marks the listbox as updating rather than empty. The row itself
   * is not announced on arrival: a cache hit resolves within microtasks, before
   * a paint, so speaking here would talk over its own result. The announcement
   * is deferred instead, and only a wait long enough to be worth reporting ever
   * reaches it — after which the outcome replaces it as it always did.
   */
  private renderPending(): void {
    this.renderMessage("Searching…", false);
    this.results.setAttribute("aria-busy", "true");
    clearTimeout(this.pendingAnnounce);
    this.pendingAnnounce = setTimeout(() => this.announce("Searching…"), 600);
  }

  /** Drop the in-flight marks — every terminal path passes through here. */
  private clearPending(): void {
    clearTimeout(this.pendingAnnounce);
    this.pendingAnnounce = undefined;
    this.results.removeAttribute("aria-busy");
  }

  /**
   * A single non-interactive status row (in flight / failure / no matches).
   * `speak` is false only for the in-flight row, which defers its own
   * announcement rather than making one on arrival.
   */
  private renderMessage(text: string, speak = true): void {
    this.clearPending();
    this.results.innerHTML = "";
    this.options = [];
    this.entries = [];
    this.activeIndex = -1;
    this.input.removeAttribute("aria-activedescendant");

    const li = document.createElement("li");
    li.className = "search__message";
    // Not an option: it cannot be chosen, so it must not be counted as one by
    // anything walking the listbox. Nor is it a live region — it is created
    // holding its text, which announces nothing; the shared announcer speaks
    // it instead, and a second copy here would say it twice.
    li.setAttribute("role", "presentation");
    li.textContent = text;
    this.results.appendChild(li);
    this.setOpen(true);
    if (speak) this.announce(text);
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
    // The popup overhangs the share and export buttons stacked below the field.
    // Those are siblings at the same z-index, and `.search` is first in the DOM,
    // so an equal-priority tie handed the overlap to them: a click on the right
    // end of the FIRST match landed on "Share view". The list cannot win that on
    // its own — `.search` is a stacking context, so a child's z-index is sealed
    // inside it — hence the lift belongs on the root, and only while it is open,
    // which keeps the collapsed field in its usual place in the stack.
    this.root.classList.toggle("is-open", open);
    this.input.setAttribute("aria-expanded", String(open));
  }

  /**
   * Dismissal — Escape, a click outside, or backspacing under two characters.
   * It abandons the request too. Closing only the popup left the flight running
   * against a `signal.aborted` check that a dismissal never tripped, so a query
   * the user had already walked away from reopened the list on top of a field
   * they had just cleared. Aborting a settled controller is a no-op, so the one
   * caller that closes AFTER a result (`choose`) is unaffected.
   */
  private closeResults(): void {
    this.controller?.abort();
    this.clearPending();
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
