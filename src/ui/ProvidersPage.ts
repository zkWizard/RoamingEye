import {
  PROVIDERS,
  PROVIDER_GROUPS,
  GIBS_ACKNOWLEDGMENT,
  citedDatasets,
  type ProviderUse,
} from "../lib/providers";
import { citationBundle, type CitationFormat } from "../lib/citation";
import { datasetArchive } from "../lib/datasetArchives";
import { citedVectorSources } from "../lib/citedVectorSources";
import { dataAvailabilityStatement } from "../lib/dataAvailability";
import { doiResolverUrl } from "../lib/doiLink";
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

    // "Citing the data" — the datasets a publication must cite (each DOI
    // links to its landing page, which carries the full citation), plus
    // GIBS's requested acknowledgment. CSV exports carry the same DOIs in
    // their # data_doi headers.
    const citing = document.createElement("section");
    citing.className = "providers__group providers__citing";
    const citingTitle = document.createElement("h3");
    citingTitle.className = "providers__group-title";
    citingTitle.textContent = "Citing the data";
    const citingIntro = document.createElement("p");
    citingIntro.className = "providers__desc";
    citingIntro.textContent =
      "Publishing work made with RoamingEye? Cite every source dataset you " +
      "used — the imagery products and the volcano, earthquake, " +
      "plate-boundary and basemap sources alike (a DOI resolves to its own " +
      "citation; the two sources without one say what to add) — and " +
      "acknowledge the " +
      "imagery service:";
    const list = document.createElement("ul");
    list.className = "providers__datasets";
    for (const { dataset, usedBy } of citedDatasets()) {
      const item = document.createElement("li");
      const link = document.createElement("a");
      link.href = doiResolverUrl(dataset.doi);
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = `${dataset.shortName} v${dataset.version}`;
      const rest = document.createElement("span");
      // The publishing archive, so this list names a publisher like the vector
      // list below it does. It is the DAAC that issued the DOI — not GIBS, the
      // service the pictures are streamed from, which is acknowledged
      // separately just below. A dataset with no verified archive shows none
      // rather than borrowing one (see datasetArchives.ts).
      const archive = datasetArchive(dataset.doi);
      const publisher = archive ? ` · ${archive.abbreviation}` : "";
      rest.textContent = ` — ${dataset.title}${publisher} (${usedBy.join(", ")})`;
      item.append(link, rest);
      list.appendChild(item);
    }
    // The vector overlays are rendered just as prominently as the imagery but
    // are not CMR products, so they are listed from their own registry. Two of
    // them have no DOI: each is linked by its landing page and carries the
    // note saying what the reader must add (see citedVectorSources.ts).
    for (const source of citedVectorSources()) {
      const item = document.createElement("li");
      const link = document.createElement("a");
      link.href = source.doi ? doiResolverUrl(source.doi) : source.url;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent =
        source.version === undefined
          ? source.title
          : `${source.title} v${source.version}`;
      const rest = document.createElement("span");
      // A paper names its journal instead of a publisher; an entry with
      // neither still lists the surfaces it powers rather than "undefined".
      const attribution = source.publisher ?? source.containerTitle;
      rest.textContent = attribution
        ? ` — ${attribution} (${source.usedBy.join(", ")})`
        : ` — ${source.usedBy.join(", ")}`;
      item.append(link, rest);
      if (source.note) {
        const note = document.createElement("span");
        note.className = "providers__dataset-note";
        note.textContent = ` ${source.note}`;
        item.appendChild(note);
      }
      list.appendChild(item);
    }
    const ack = document.createElement("blockquote");
    ack.className = "providers__ack";
    ack.textContent = `“${GIBS_ACKNOWLEDGMENT}”`;

    // One-click machine-readable export for a reference manager (ESIP
    // guidelines): the tool + every source dataset, DOIs and all.
    const actions = document.createElement("div");
    actions.className = "providers__cite-actions";
    // `compose` is read at click time, not now: the statement and the bundles
    // are built from the same registries this list just rendered, so composing
    // eagerly would put four full strings on the clipboard path for a reader
    // who copies none of them.
    const makeCopyBtn = (label: string, compose: () => string): void => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "providers__cite-btn";
      btn.textContent = label;
      btn.addEventListener("click", () => {
        navigator.clipboard
          .writeText(compose())
          .then(() => {
            const was = btn.textContent;
            btn.textContent = "Copied ✓";
            setTimeout(() => (btn.textContent = was), 1600);
          })
          .catch(() => {
            btn.textContent = "Copy failed";
          });
      });
      actions.appendChild(btn);
    };
    const makeBundleBtn = (label: string, format: CitationFormat): void =>
      makeCopyBtn(label, () => citationBundle(format));
    makeBundleBtn("Copy BibTeX", "bibtex");
    makeBundleBtn("Copy RIS", "ris");
    makeBundleBtn("Copy CSL-JSON", "csljson");
    // A reference list is not a Data Availability Statement: most journals now
    // require the statement in its own right, and it is the one artifact that
    // says where the data can be obtained and on whose terms. Every input it
    // needs was already here — the DOIs above, the GIBS access path, the
    // acknowledgment — but nothing composed them, so a reader had to write it
    // by hand from this page. No access date is passed: only the reader knows
    // when they pulled the imagery, and the statement says so rather than
    // stamping today's date onto a figure made last month.
    makeCopyBtn("Copy availability statement", () =>
      dataAvailabilityStatement()
    );

    citing.append(citingTitle, citingIntro, list, ack, actions);
    body.appendChild(citing);

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
