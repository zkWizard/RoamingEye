import {
  catalogFacets,
  filterSoftware,
  parseSoftwareCatalog,
  type SoftwareCatalog,
  type SoftwareTool,
} from "../lib/softwareCatalog";
import { ICONS } from "./icons";
import { FocusTrap } from "./modal";

/**
 * A static, evidence-led software finder. It never calls a model or a third
 * party at runtime: public recommendations are the reviewed catalog artifact.
 */
export class SoftwareFinder {
  private readonly container: HTMLElement;
  private readonly trap = new FocusTrap();
  private readonly query: HTMLInputElement;
  private readonly domain: HTMLSelectElement;
  private readonly platform: HTMLSelectElement;
  private readonly access: HTMLSelectElement;
  private readonly status: HTMLElement;
  private readonly results: HTMLElement;
  private catalog: SoftwareCatalog | null = null;
  private loading: Promise<void> | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    container.classList.add("providers", "software");
    container.setAttribute("role", "dialog");
    container.setAttribute("aria-modal", "true");
    container.setAttribute("aria-label", "Find open Earth science software");
    container.innerHTML = `
      <div class="providers__backdrop"></div>
      <div class="providers__panel software__panel">
        <header class="providers__header">
          <div>
            <h2 class="providers__title software__title">Find open software</h2>
            <p class="providers__intro">Reviewed Earth-science projects with
              repository, documentation, license evidence, and a current
              verification date.</p>
          </div>
          <button class="providers__close" type="button" aria-label="Close">${ICONS.close}</button>
        </header>
        <div class="providers__body software__body">
          <form class="software__filters">
            <label class="software__field software__field--query">
              <span>Search</span>
              <input class="software__query" type="search" placeholder="Tool, workflow, or format" autocomplete="off" />
            </label>
            <label class="software__field">
              <span>Domain</span>
              <select class="software__domain"><option value="">All domains</option></select>
            </label>
            <label class="software__field">
              <span>Platform</span>
              <select class="software__platform"><option value="">All platforms</option></select>
            </label>
            <label class="software__field">
              <span>Access</span>
              <select class="software__access"><option value="">All access paths</option></select>
            </label>
          </form>
          <p class="software__status" aria-live="polite">Loading reviewed catalog...</p>
          <section class="software__results" aria-label="Software results"></section>
        </div>
        <footer class="providers__legend">
          <span>Every result links to its evidence.</span>
          <span class="providers__version">RoamingEye v${__APP_VERSION__}</span>
        </footer>
      </div>`;

    this.query = container.querySelector(
      ".software__query"
    ) as HTMLInputElement;
    this.domain = container.querySelector(
      ".software__domain"
    ) as HTMLSelectElement;
    this.platform = container.querySelector(
      ".software__platform"
    ) as HTMLSelectElement;
    this.access = container.querySelector(
      ".software__access"
    ) as HTMLSelectElement;
    this.status = container.querySelector(".software__status") as HTMLElement;
    this.results = container.querySelector(".software__results") as HTMLElement;

    (
      container.querySelector(".software__filters") as HTMLFormElement
    ).addEventListener("submit", (event) => event.preventDefault());
    for (const control of [
      this.query,
      this.domain,
      this.platform,
      this.access,
    ]) {
      control.addEventListener("input", () => this.render());
      control.addEventListener("change", () => this.render());
    }
    (
      container.querySelector(".providers__close") as HTMLButtonElement
    ).addEventListener("click", () => this.close());
    (
      container.querySelector(".providers__backdrop") as HTMLElement
    ).addEventListener("click", () => this.close());
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") this.close();
    });
  }

  open(): void {
    this.container.classList.add("is-open");
    this.container.setAttribute("aria-hidden", "false");
    this.trap.activate(
      this.container.querySelector(".software__panel") as HTMLElement
    );
    void this.ensureCatalog();
  }

  close(): void {
    if (!this.container.classList.contains("is-open")) return;
    this.container.classList.remove("is-open");
    this.container.setAttribute("aria-hidden", "true");
    this.trap.deactivate();
  }

  private async ensureCatalog(): Promise<void> {
    if (this.catalog) return;
    if (!this.loading) {
      this.loading = fetch("data/software-catalog.json")
        .then((response) => {
          if (!response.ok)
            throw new Error(`Catalog request failed (${response.status})`);
          return response.json();
        })
        .then((data) => {
          this.catalog = parseSoftwareCatalog(data);
          this.populateFacets();
          this.render();
        })
        .catch(() => {
          this.status.textContent =
            "The reviewed catalog is unavailable right now.";
        });
    }
    await this.loading;
  }

  private populateFacets(): void {
    if (!this.catalog) return;
    this.addOptions(this.domain, catalogFacets(this.catalog.tools, "domains"));
    this.addOptions(
      this.platform,
      catalogFacets(this.catalog.tools, "platforms")
    );
    this.addOptions(this.access, catalogFacets(this.catalog.tools, "access"));
  }

  private addOptions(select: HTMLSelectElement, values: string[]): void {
    for (const value of values) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    }
  }

  private render(): void {
    if (!this.catalog) return;
    const tools = filterSoftware(this.catalog.tools, {
      query: this.query.value,
      domain: this.domain.value,
      platform: this.platform.value,
      access: this.access.value,
    });
    this.status.textContent = `${tools.length} verified project${tools.length === 1 ? "" : "s"}`;
    this.results.replaceChildren();
    if (tools.length === 0) {
      const empty = document.createElement("p");
      empty.className = "software__empty";
      empty.textContent = "No reviewed projects match these filters.";
      this.results.appendChild(empty);
      return;
    }
    for (const tool of tools) this.results.appendChild(this.toolCard(tool));
  }

  private toolCard(tool: SoftwareTool): HTMLElement {
    const card = document.createElement("article");
    card.className = "software__card";

    const head = document.createElement("div");
    head.className = "software__card-head";
    const name = document.createElement("h3");
    name.className = "software__name";
    name.textContent = tool.name;
    const license = document.createElement("span");
    license.className = "software__license";
    license.textContent = tool.license;
    head.append(name, license);

    const summary = document.createElement("p");
    summary.className = "software__summary";
    summary.textContent = tool.summary;

    const tags = document.createElement("div");
    tags.className = "software__tags";
    for (const tag of [
      ...tool.domains,
      ...tool.workflows,
      ...tool.formats,
    ].slice(0, 6)) {
      const item = document.createElement("span");
      item.textContent = tag;
      tags.appendChild(item);
    }

    const access = document.createElement("p");
    access.className = "software__access";
    access.textContent = `${tool.access.join(" · ")} · ${tool.platforms.join(" / ")}`;

    const note = document.createElement("p");
    note.className = "software__note";
    note.textContent =
      tool.accessNotes[0] ?? "Read the project guide before installing.";

    const actions = document.createElement("div");
    actions.className = "software__actions";
    for (const [label, url] of [
      ["Documentation", tool.documentation],
      ["Source", tool.repository],
      ["Evidence", tool.evidence.repositoryApi],
    ] as const) {
      const link = document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = label;
      actions.appendChild(link);
    }

    const verified = document.createElement("p");
    verified.className = "software__verified";
    verified.textContent = `Verified ${tool.verifiedAt}`;
    card.append(head, summary, tags, access, note, actions, verified);
    return card;
  }
}
