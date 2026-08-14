import { doiResolverUrl } from "../lib/doiLink";
import { LAYERS, type LayerId } from "../lib/timeline";
import {
  LEGENDS,
  gradientCss,
  legendProvenance,
  legendTicks,
  overlayKeyFor,
  type LegendProvenance,
  type OverlayKeyChannel,
} from "../lib/legend";
import {
  terrainLayerContext,
  terrainTileAvailability,
  terrainTileAvailabilityNotice,
} from "../lib/terrainContext";
import { vegetationRampTickCaveat } from "../lib/vegetationIndexRamp";

/**
 * A compact key for the active data layer: a color-scale bar with end labels
 * and a one-line plain-language description, so first-time visitors know what
 * the colors on the globe mean without hunting for tooltips. Overlays with
 * color-coded markers (quakes, volcanoes) contribute their own key rows
 * while toggled on.
 */
export class Legend {
  private readonly measures: HTMLSpanElement;
  private readonly bar: HTMLDivElement;
  private readonly minLabel: HTMLSpanElement;
  private readonly maxLabel: HTMLSpanElement;
  private values!: HTMLDivElement;
  private readonly valueTicks: Partial<
    Record<"min" | "mid" | "max", HTMLSpanElement>
  > = {};
  private readonly caption: HTMLParagraphElement;
  private readonly sourceNote: HTMLParagraphElement;
  private readonly keys: HTMLDivElement;
  /** Rendered rows per overlay id — one per channel that overlay encodes. */
  private readonly keyRows = new Map<string, HTMLElement[]>();
  private readonly classes: HTMLDivElement;
  private scaleRow!: HTMLElement;
  /**
   * The layer the source note currently describes. Terrain tile coverage
   * arrives asynchronously and independently of the selected layer, so the
   * note's owner has to be tracked rather than inferred from its visibility.
   */
  private activeLayer!: LayerId;
  private terrainCoverageNotice = terrainTileAvailabilityNotice(
    terrainTileAvailability(0, 0, 0)
  );

  constructor(container: HTMLElement, initial: LayerId) {
    container.classList.add("legend");

    const scale = document.createElement("div");
    scale.className = "legend__scale";

    this.minLabel = document.createElement("span");
    this.minLabel.className = "legend__end";

    this.bar = document.createElement("div");
    this.bar.className = "legend__bar";
    this.bar.setAttribute("role", "img");

    // Numeric min/mid/max under the gradient (calibrated layers only) —
    // the values that turn the color bar from illustration into an axis.
    this.values = document.createElement("div");
    this.values.className = "legend__values";
    for (const key of ["min", "mid", "max"] as const) {
      const tick = document.createElement("span");
      tick.className = "legend__value";
      this.valueTicks[key] = tick;
      this.values.append(tick);
    }

    const barWrap = document.createElement("div");
    barWrap.className = "legend__bar-wrap";
    barWrap.append(this.bar, this.values);

    this.maxLabel = document.createElement("span");
    this.maxLabel.className = "legend__end";

    scale.append(this.minLabel, barWrap, this.maxLabel);

    this.measures = document.createElement("span");
    this.measures.className = "legend__measures";

    this.caption = document.createElement("p");
    this.caption.className = "legend__caption";

    this.sourceNote = document.createElement("p");
    this.sourceNote.className = "legend__source-note";
    this.sourceNote.setAttribute("role", "note");

    const row = document.createElement("div");
    row.className = "legend__row";
    row.append(this.measures, scale);

    this.classes = document.createElement("div");
    this.classes.className = "legend__classes";

    this.keys = document.createElement("div");
    this.keys.className = "legend__keys";

    container.append(
      row,
      this.classes,
      this.keys,
      this.caption,
      this.sourceNote
    );
    this.scaleRow = scale;
    this.setLayer(initial);
  }

  /**
   * Show or hide the color key for an overlay (driven by its toolbar
   * toggle). Overlays without a key are ignored.
   */
  setOverlayKey(id: string, on: boolean): void {
    const existing = this.keyRows.get(id);
    if (!on) {
      for (const row of existing ?? []) row.remove();
      this.keyRows.delete(id);
      return;
    }
    if (existing) return;
    const spec = overlayKeyFor(id);
    if (!spec) return;

    // One row per channel. `.legend__keys` already stacks its children, so an
    // overlay encoding both color and size renders as two rows with no new
    // layout rules; both are tracked together so one toggle removes both.
    // The population note rides the first row's title only: it describes the
    // marker set, not one channel, so repeating it on the size row would say
    // the same thing about the same markers twice.
    const channels = spec.secondary ? [spec, spec.secondary] : [spec];
    const rows = channels.map((channel, index) => {
      const key = buildKeyRow(
        channel,
        index === 0 ? spec.population : undefined
      );
      this.keys.append(key);
      return key;
    });
    this.keyRows.set(id, rows);
  }

  /** Point the legend at a different data layer. */
  setLayer(id: LayerId): void {
    const spec = LEGENDS[id];
    this.activeLayer = id;
    this.measures.textContent = spec.measures;
    this.caption.textContent = LAYERS[id].description;
    // Every layer that names a source product cites it here, not only the ones
    // whose colours also need a caveat (lib/legend legendProvenance).
    const provenance = id === "terrain" ? null : legendProvenance(id);
    this.sourceNote.hidden = id !== "terrain" && provenance === null;
    this.sourceNote.replaceChildren();
    if (id === "terrain") {
      this.renderTerrainSourceNote();
    } else if (provenance) {
      this.renderSourceNote(provenance);
    }

    // Categorical layers get named class swatches instead of a gradient bar.
    const categorical = spec.kind === "classes";
    this.scaleRow.hidden = categorical;
    this.classes.hidden = !categorical;
    this.classes.replaceChildren();
    if (categorical) {
      for (const entry of spec.classes) {
        const item = document.createElement("span");
        item.className = "legend__key-item";
        const swatch = document.createElement("span");
        swatch.className = "legend__swatch";
        swatch.style.background = entry.color;
        const label = document.createElement("span");
        label.textContent = entry.label;
        item.append(swatch, label);
        this.classes.append(item);
      }
      return;
    }

    this.bar.style.background = gradientCss(spec.stops);
    this.minLabel.textContent = spec.minLabel;
    this.maxLabel.textContent = spec.maxLabel;

    // Physical-value ticks (nothing rather than fake numbers for
    // uncalibrated layers); the bar's accessible name carries them too.
    const ticks = legendTicks(id);
    this.values.hidden = ticks === null;
    this.valueTicks.min!.textContent = ticks?.min ?? "";
    this.valueTicks.mid!.textContent = ticks?.mid ?? "";
    this.valueTicks.max!.textContent = ticks?.max ?? "";

    // The vegetation indices are read off our gradient, not GIBS's ramp, and
    // that ramp is non-linear — so the interior tick is an approximation while
    // the end labels are exact. Say so on the number itself rather than growing
    // the legend, which sits over the globe.
    const caveat = ticks === null ? null : vegetationRampTickCaveat(id);
    const mid = this.valueTicks.mid!;
    if (caveat) {
      mid.title = caveat;
      mid.setAttribute("aria-label", `${ticks!.mid} — ${caveat}`);
    } else {
      mid.removeAttribute("title");
      mid.removeAttribute("aria-label");
    }
    this.bar.setAttribute(
      "aria-label",
      ticks
        ? `Color scale from ${spec.minLabel} (${ticks.min}) to ${spec.maxLabel} (${ticks.max})`
        : `Color scale from ${spec.minLabel} to ${spec.maxLabel}`
    );
  }

  setTerrainTileCoverage(
    requested: number,
    loaded: number,
    failed: number
  ): void {
    this.terrainCoverageNotice = terrainTileAvailabilityNotice(
      terrainTileAvailability(requested, loaded, failed)
    );
    // Only terrain's own note carries this notice. The previous guard was the
    // note's visibility, which is true for every layer that names a source, so
    // a terrain tile batch — they keep arriving whatever layer is selected —
    // overwrote the active layer's citation and interpretation guardrail with
    // terrain's. Every data layer therefore rendered "Source: ASTGTM v003",
    // miscrediting the product on screen and hiding its DOI and caveat.
    if (this.activeLayer === "terrain") this.renderTerrainSourceNote();
  }

  private renderTerrainSourceNote(): void {
    const context = terrainLayerContext();
    const source = document.createElement("a");
    source.href = context.provenance.datasetUrl;
    source.target = "_blank";
    source.rel = "noreferrer";
    source.textContent = `${context.provenance.dataset.shortName} v${context.provenance.dataset.version}`;
    source.setAttribute("aria-label", "ASTER GDEM V003 dataset DOI");
    this.sourceNote.replaceChildren();
    this.sourceNote.append(
      "Source: NASA GIBS rendering ",
      source,
      `. ${context.accessibleNotice} ${this.terrainCoverageNotice}`
    );
  }

  private renderSourceNote(provenance: LegendProvenance): void {
    const source = document.createElement("a");
    source.href = doiResolverUrl(provenance.doi);
    source.target = "_blank";
    source.rel = "noreferrer";
    source.textContent = provenance.label;
    source.setAttribute("aria-label", `${provenance.label} dataset DOI`);
    // The guardrail follows the citation when the layer has one; a layer
    // without one still states its source rather than staying silent.
    this.sourceNote.append(
      "Source: ",
      source,
      provenance.note ? `. ${provenance.note}` : "."
    );
  }
}

/**
 * The key's default swatch diameter, in rem — the value `.legend__swatch`
 * carries in the stylesheet. Scaled entries are sized against it here rather
 * than in CSS, because the ratios come from the overlay's own bucket sizes.
 */
const SWATCH_REM = 0.55;

/**
 * Build one channel's row: a title and its swatch/label pairs.
 *
 * A scaled entry is drawn at the overlay's own size ratio, anchored so the
 * largest swatch matches the unscaled default — the row shows the real
 * relationship between markers without becoming taller than the rows beside it.
 *
 * `population` — which records were eligible to be drawn — is attached to the
 * title rather than added as visible copy, the same way the vegetation tick
 * caveat rides its number: `.legend__key` wraps, so a sentence in the row
 * would push the swatches onto another line and grow the legend, which sits
 * over the globe. The title keeps its own text as the accessible name so the
 * note extends the row for screen readers instead of replacing it.
 */
function buildKeyRow(
  channel: OverlayKeyChannel,
  population?: string
): HTMLDivElement {
  const key = document.createElement("div");
  key.className = "legend__key";

  const title = document.createElement("span");
  title.className = "legend__key-title";
  title.textContent = channel.title;
  if (population) {
    title.title = population;
    title.setAttribute("aria-label", `${channel.title} — ${population}`);
  }
  key.append(title);

  for (const entry of channel.entries) {
    const item = document.createElement("span");
    item.className = "legend__key-item";
    const swatch = document.createElement("span");
    swatch.className = "legend__swatch";
    swatch.style.background = entry.color;
    if (entry.scale !== undefined) {
      const diameter = `${(SWATCH_REM * entry.scale).toFixed(3)}rem`;
      swatch.style.width = diameter;
      swatch.style.height = diameter;
      // Keeps the smaller swatches on the same baseline as their labels once
      // they no longer fill the row's default height.
      swatch.style.flex = "0 0 auto";
    }
    const label = document.createElement("span");
    label.textContent = entry.label;
    item.append(swatch, label);
    key.append(item);
  }

  return key;
}
