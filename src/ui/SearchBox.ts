import {
  collectInstant,
  collectSuggestions,
  enterTarget,
  groupHits,
} from "../lib/search/query";
import type { SearchHit, SearchProvider } from "../lib/search/provider";
import type { ResultRow } from "../lib/search/query";
import { ICONS } from "./icons";
import { ThinkingOrb } from "./ThinkingOrb";

/** Stable ids so the input can point at the popup and its active option. */
const LIST_ID = "search-results";
const optionId = (index: number): string => `${LIST_ID}-option-${index}`;

/** Local providers answer from memory; this only keeps the popup from flashing. */
const DEBOUNCE_MS = 60;
/** Show "Searching…" only when a provider is still working after this. */
const SLOW_MS = 70;

/**
 * A search field (top-right). Instant providers fill the popup while the user
 * types; an explicit provider (Nominatim) is one row, and runs only when that
 * row is chosen or Enter is pressed with no instant hit. The box never reads
 * a hit's `data` — the caller does. See `docs/search-providers.md`.
 *
 * The popup is an ARIA 1.2 combobox. The rows are not focusable, so focus
 * stays on the input and `aria-activedescendant` points at the highlighted
 * option. That is what lets typing, arrowing, and selecting stay one gesture.
 *
 * What came back is spoken through the shared announcer. A live region that
 * arrives already holding its message has not changed, so a status row cannot
 * announce itself.
 */
export class SearchBox {
  private readonly root: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly results: HTMLUListElement;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private suggestTimer: ReturnType<typeof setTimeout> | undefined;
  private pendingTimer: ReturnType<typeof setTimeout> | undefined;
  private options: HTMLLIElement[] = [];
  private rows: ResultRow[] = [];
  private activeIndex = -1;
  private generation = 0;
  private query = "";
  /** Enter arrived before the rows did: take the top hit once they land. */
  private submitOnArrival = false;
  private pendingAnnounce: ReturnType<typeof setTimeout> | undefined;
  // One orb for the life of the box, moved into each "Searching…" row: the
  // rows are rebuilt on every keystroke, and it stops with the row it is in.
  private readonly orb = new ThinkingOrb("searching", 20, "search__orb");

  constructor(
    container: HTMLElement,
    private readonly providers: readonly SearchProvider[],
    private readonly onSelect: (hit: SearchHit) => void,
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
        <input class="search__input" type="search" placeholder="Search places, layers, dates…"
          autocomplete="off" autocapitalize="off" spellcheck="false"
          aria-label="Search places, layers, and dates" role="combobox"
          aria-autocomplete="list" aria-expanded="false"
          aria-controls="${LIST_ID}" />
      </label>
      <ul class="search__results" id="${LIST_ID}" role="listbox"></ul>`;

    this.input = container.querySelector(".search__input") as HTMLInputElement;
    this.results = container.querySelector(
      ".search__results"
    ) as HTMLUListElement;

    this.input.addEventListener("input", () => this.onInput());
    this.input.addEventListener("focus", () => this.onFocus());
    this.input.addEventListener("keydown", (e) => this.onKeydown(e));
    document.addEventListener("pointerdown", (e) => {
      if (!container.contains(e.target as Node)) this.closeResults();
    });
  }

  /** Focus the field. "/" and Ctrl+K call this. */
  focus(): void {
    this.input.focus();
    this.input.select();
  }

  /**
   * Arrows move the highlight (wrapping, as the layer listbox does), Home/End
   * jump, Enter takes the highlighted row — or the top instant hit, when
   * nothing is highlighted yet — and Escape clears the field.
   */
  private onKeydown(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      this.clear();
      return;
    }
    const count = this.options.length;
    if (count === 0) {
      if (e.key === "Enter") {
        e.preventDefault();
        this.queueSubmit();
      }
      return;
    }

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
        e.preventDefault();
        this.commitEnter();
        return;
      default:
        return;
    }
    e.preventDefault();
    this.setActive(next);
  }

  /** Enter before the popup exists: resolve, then take the top row. */
  private queueSubmit(): void {
    const query = this.input.value.trim();
    if (query.length < 2) return;
    this.submitOnArrival = true;
    this.query = query;
    clearTimeout(this.debounceTimer);
    void this.run(query);
  }

  private commitEnter(): void {
    const target = enterTarget(this.rows, this.activeIndex);
    if (target === null) return;
    if (target === "explicit") {
      const highlighted =
        this.activeIndex >= 0 ? this.rows[this.activeIndex] : undefined;
      const row =
        highlighted?.kind === "explicit"
          ? highlighted
          : this.rows.find((item) => item.kind === "explicit");
      if (row?.provider) void this.runExplicit(row.provider, this.query);
      return;
    }
    this.activate(target);
  }

  private onFocus(): void {
    clearTimeout(this.suggestTimer);
    // fill() focuses the empty field and only then inserts the text. Wait a
    // turn so that text is searched, while a field that stays empty suggests.
    this.suggestTimer = setTimeout(() => {
      this.suggestTimer = undefined;
      if (this.input.value.trim() !== "") return;
      void this.showSuggestions();
    }, 0);
  }

  private onInput(): void {
    const query = this.input.value.trim();
    this.query = query;
    this.submitOnArrival = false;
    clearTimeout(this.debounceTimer);
    clearTimeout(this.suggestTimer);
    this.suggestTimer = undefined;
    // Drop a suggestion load still in flight. It must not paint over this
    // query, and it must not be the thing that cancels the search below.
    this.generation += 1;
    if (query.length < 2) {
      if (query.length === 0) void this.showSuggestions();
      else this.closeResults();
      return;
    }
    this.debounceTimer = setTimeout(() => void this.run(query), DEBOUNCE_MS);
  }

  /** Stories, recent searches, and change places. No geocoder. */
  private async showSuggestions(): Promise<void> {
    const pending = this.input.value.trim();
    if (pending.length >= 2) {
      void this.run(pending);
      return;
    }
    const generation = ++this.generation;
    clearTimeout(this.pendingTimer);
    try {
      const hits = await collectSuggestions(this.providers);
      if (generation !== this.generation) return;
      const typed = this.input.value.trim();
      // The field was filled while the suggestion lists were loading. A
      // focus-time load used to clear the keystroke timer and then return,
      // so the empty-field rows stayed up under a date or a place name.
      if (typed.length >= 2) {
        void this.run(typed);
        return;
      }
      if (typed.length === 1) {
        this.closeResults();
        return;
      }
      if (hits.length === 0) {
        this.closeResults();
        return;
      }
      this.renderList(hits, [], "", "suggestions");
      this.watchTypedOverSuggestions(generation);
    } catch (err) {
      if (generation !== this.generation) return;
      console.warn("RoamingEye: suggestions failed", err);
      const typed = this.input.value.trim();
      if (typed.length >= 2) void this.run(typed);
      else this.closeResults();
    }
  }

  /**
   * Suggestions paint while the field is still empty. fill() can set the
   * value on the next turn; if that write does not produce an input event
   * the rows would stay. One later look is enough — a real keystroke has
   * already bumped the generation and scheduled its own search.
   */
  private watchTypedOverSuggestions(generation: number): void {
    setTimeout(() => {
      if (generation !== this.generation) return;
      const typed = this.input.value.trim();
      if (typed.length >= 2) void this.run(typed);
      else if (typed.length === 1) this.closeResults();
    }, 0);
  }

  private async run(query: string): Promise<void> {
    const generation = ++this.generation;
    this.armSlow(generation);
    try {
      const hits = await collectInstant(this.providers, query);
      if (generation !== this.generation) return;
      clearTimeout(this.pendingTimer);
      const explicit = this.providers.filter(
        (provider) => provider.when === "explicit"
      );
      this.renderList(hits, explicit, query);
    } catch (err) {
      if (generation !== this.generation) return;
      clearTimeout(this.pendingTimer);
      console.warn("RoamingEye: search failed", err);
      this.renderMessage("Search unavailable — check connection");
    }
  }

  private async runExplicit(
    provider: SearchProvider,
    query: string
  ): Promise<void> {
    const generation = ++this.generation;
    this.submitOnArrival = false;
    this.armSlow(generation);
    try {
      const hits = await provider.search(query);
      if (generation !== this.generation) return;
      clearTimeout(this.pendingTimer);
      if (hits.length === 0) this.renderMessage("No matches");
      else this.renderList(hits, [], query);
    } catch (err) {
      if (generation !== this.generation) return;
      clearTimeout(this.pendingTimer);
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.warn("RoamingEye: search failed", err);
      this.renderMessage("Search unavailable — check connection");
    }
  }

  /** Speak the wait only if the provider is still going. */
  private armSlow(generation: number): void {
    clearTimeout(this.pendingTimer);
    this.pendingTimer = setTimeout(() => {
      if (generation === this.generation) this.renderPending();
    }, SLOW_MS);
  }

  private renderList(
    hits: readonly SearchHit[],
    explicit: readonly SearchProvider[],
    query: string,
    mode: "matches" | "suggestions" = "matches"
  ): void {
    this.clearPending();
    this.results.innerHTML = "";
    this.options = [];
    this.rows = [];

    for (const group of groupHits(hits)) {
      const header = document.createElement("li");
      header.className = "search__group";
      header.setAttribute("role", "presentation");
      header.textContent = group.group;
      this.results.appendChild(header);
      for (const hit of group.hits) this.appendRow({ kind: "hit", hit });
    }
    for (const provider of explicit) {
      this.appendRow({ kind: "explicit", provider }, query);
    }

    this.setActive(-1);
    this.setOpen(this.rows.length > 0);
    if (mode === "suggestions") {
      if (hits.length === 1) this.announce("1 suggestion");
      else if (hits.length > 1) this.announce(`${hits.length} suggestions`);
    } else if (hits.length === 1) this.announce("1 match");
    else if (hits.length > 1) this.announce(`${hits.length} matches`);
    else if (explicit.length > 0) {
      this.announce(explicit[0].label?.(query) ?? "Search all places");
    }

    if (!this.submitOnArrival) return;
    this.submitOnArrival = false;
    const target = enterTarget(this.rows, -1);
    if (target === "explicit") {
      const row = this.rows.find((item) => item.kind === "explicit");
      if (row?.provider) void this.runExplicit(row.provider, query);
    } else if (typeof target === "number") {
      this.activate(target);
    }
  }

  private appendRow(row: ResultRow, query = this.query): void {
    const index = this.rows.length;
    const hit = row.hit;
    const title =
      hit?.title ?? row.provider?.label?.(query) ?? "Search all places";
    const subtitle =
      hit?.subtitle ?? (row.kind === "explicit" ? "OpenStreetMap places" : "");

    const li = document.createElement("li");
    li.className =
      row.kind === "explicit"
        ? "search__result search__result--world"
        : "search__result";
    li.id = optionId(index);
    li.setAttribute("role", "option");
    li.setAttribute("aria-selected", "false");
    li.innerHTML =
      `<span class="search__result-name">${escapeHtml(title)}</span>` +
      (subtitle
        ? `<span class="search__result-sub">${escapeHtml(subtitle)}</span>`
        : "");
    li.addEventListener("click", () => this.activate(index));
    // Track the pointer with the same highlight the arrows move, so hovering
    // and arrowing cannot leave two rows looking equally chosen.
    li.addEventListener("pointerenter", () => this.setActive(index));
    this.results.appendChild(li);
    this.options.push(li);
    this.rows.push(row);
  }

  /**
   * The in-flight state. A local query usually resolves before this timer, so
   * the popup is not replaced by "Searching…" on every keystroke. An explicit
   * world search, or the first load of the place lists, still reports itself.
   *
   * `aria-busy` marks the listbox as updating rather than empty. The row is
   * not announced on arrival: a fast answer resolves before a paint, and
   * speaking here would talk over its own result. The announcement is
   * deferred, and only a wait long enough to be worth reporting reaches it.
   */
  private renderPending(): void {
    this.renderMessage("Searching…", false, true);
    this.results.lastElementChild?.prepend(this.orb.canvas);
    this.orb.start();
    this.results.setAttribute("aria-busy", "true");
    clearTimeout(this.pendingAnnounce);
    this.pendingAnnounce = setTimeout(() => this.announce("Searching…"), 600);
  }

  /** Drop the in-flight marks — every terminal path passes through here. */
  private clearPending(): void {
    this.orb.stop();
    clearTimeout(this.pendingAnnounce);
    this.pendingAnnounce = undefined;
    this.results.removeAttribute("aria-busy");
  }

  /**
   * A single non-interactive status row (in flight / failure / no matches).
   * `speak` is false only for the in-flight row, which defers its own
   * announcement rather than making one on arrival. `keepSubmit` holds an
   * Enter that arrived before the rows, so the pending row does not drop it.
   */
  private renderMessage(text: string, speak = true, keepSubmit = false): void {
    this.clearPending();
    if (!keepSubmit) this.submitOnArrival = false;
    this.results.innerHTML = "";
    this.options = [];
    this.rows = [];
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

  private activate(index: number): void {
    const row = this.rows[index];
    if (!row) return;
    if (row.kind === "explicit" && row.provider) {
      void this.runExplicit(row.provider, this.query);
      return;
    }
    const hit = row.hit;
    if (!hit) return;
    this.input.value = hit.title;
    this.closeResults();
    this.onSelect(hit);
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
   * A result that lands afterwards must not reopen the popup: the generation
   * bump drops it.
   */
  private closeResults(): void {
    this.generation += 1;
    this.submitOnArrival = false;
    clearTimeout(this.debounceTimer);
    clearTimeout(this.suggestTimer);
    this.suggestTimer = undefined;
    clearTimeout(this.pendingTimer);
    this.clearPending();
    this.results.innerHTML = "";
    this.options = [];
    this.rows = [];
    this.activeIndex = -1;
    this.input.removeAttribute("aria-activedescendant");
    this.setOpen(false);
  }

  private clear(): void {
    this.input.value = "";
    this.query = "";
    this.closeResults();
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
