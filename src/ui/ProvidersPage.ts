import { PROVIDERS, PROVIDER_GROUPS, type ProviderUse } from "../lib/providers";
import { FocusTrap } from "./modal";
import { ICONS } from "./icons";

const USE_LABEL: Record<ProviderUse, string> = {
  core: "Core — used directly",
  underlying: "Underlying — via NASA GIBS",
  ecosystem: "Ecosystem — open community",
};

/**
 * A full-screen "page" (modal overlay) cataloguing the open Earth-observation
 * data ecosystem RoamingEye is built on. Content comes from `src/lib/providers`.
 */
export class ProvidersPage {
  private readonly container: HTMLElement;
  private readonly trap = new FocusTrap();

  constructor(container: HTMLElement) {
    this.container = container;
    container.classList.add("providers");
    container.setAttribute("role", "dialog");
    container.setAttribute("aria-modal", "true");
    container.setAttribute("aria-label", "Open data providers");
    container.innerHTML = `
      <div class="providers__backdrop"></div>
      <div class="providers__panel">
        <header class="providers__header">
          <div>
            <h2 class="providers__title">Open data providers</h2>
            <p class="providers__intro">RoamingEye is built entirely on open
              Earth-observation data. These are the ${PROVIDERS.length} agencies,
              archives, platforms, and projects whose work makes a free, global
              eye on the planet possible.</p>
          </div>
          <button class="providers__close" type="button" aria-label="Close">${ICONS.close}</button>
        </header>
        <div class="providers__body"></div>
        <footer class="providers__legend">
          <span><i class="providers__dot providers__dot--core"></i> ${USE_LABEL.core}</span>
          <span><i class="providers__dot providers__dot--underlying"></i> ${USE_LABEL.underlying}</span>
          <span><i class="providers__dot providers__dot--ecosystem"></i> ${USE_LABEL.ecosystem}</span>
          <span class="providers__version">RoamingEye v${__APP_VERSION__}</span>
        </footer>
      </div>`;

    const body = container.querySelector(".providers__body") as HTMLElement;
    for (const group of PROVIDER_GROUPS) {
      const inGroup = PROVIDERS.filter((p) => p.group === group);
      const section = document.createElement("section");
      section.className = "providers__group";
      const title = document.createElement("h3");
      title.className = "providers__group-title";
      title.textContent = `${group} · ${inGroup.length}`;
      section.appendChild(title);

      const grid = document.createElement("div");
      grid.className = "providers__grid";
      for (const p of inGroup) {
        const card = document.createElement("a");
        card.className = "providers__card";
        card.href = p.url;
        card.target = "_blank";
        card.rel = "noopener";
        card.title = USE_LABEL[p.use];

        const head = document.createElement("div");
        head.className = "providers__card-head";
        const name = document.createElement("span");
        name.className = "providers__name";
        name.textContent = p.name;
        const dot = document.createElement("span");
        dot.className = `providers__dot providers__dot--${p.use}`;
        head.append(name, dot);

        const meta = document.createElement("div");
        meta.className = "providers__meta";
        meta.textContent = `${p.org} · ${p.region} · ${p.license}`;

        const desc = document.createElement("p");
        desc.className = "providers__desc";
        desc.textContent = p.description;

        card.append(head, meta, desc);
        grid.appendChild(card);
      }
      section.appendChild(grid);
      body.appendChild(section);
    }

    (
      container.querySelector(".providers__close") as HTMLButtonElement
    ).addEventListener("click", () => this.close());
    (
      container.querySelector(".providers__backdrop") as HTMLElement
    ).addEventListener("click", () => this.close());
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.close();
    });
  }

  open(): void {
    this.container.classList.add("is-open");
    this.container.setAttribute("aria-hidden", "false");
    this.trap.activate(
      this.container.querySelector(".providers__panel") as HTMLElement
    );
  }

  close(): void {
    if (!this.container.classList.contains("is-open")) return;
    this.container.classList.remove("is-open");
    this.container.setAttribute("aria-hidden", "true");
    this.trap.deactivate();
  }
}
