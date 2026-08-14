import {
  anomalySeries,
  formatProbeValue,
  seriesStats,
  scaleValue,
  uncertaintyText,
  type ProbeScale,
} from "../lib/probe";
import { trendSummary, trendClause } from "../lib/trend";
import {
  seasonalSamplingBalance,
  seasonalSamplingClause,
} from "../lib/seasonalSamplingBalance";
import type { ProbeMode } from "../probe/ProbeSampler";

/** The user-toggleable sampling modes (regions are drawn, not toggled). */
type PanelMode = Exclude<ProbeMode, "region">;
import type { LayerId, YearMonth } from "../lib/timeline";
import {
  inversionAccuracyClause,
  probeInversionAccuracy,
} from "../lib/probeInversionAccuracy";
import {
  probeSstExtremeCensoring,
  sstExtremeBoundPrefix,
  sstExtremeCensoringClause,
} from "../lib/probeSstExtremeCensoring";
import {
  probeSstTrendCensoring,
  sstTrendCensoringClause,
} from "../lib/probeSstTrendCensoring";
import {
  probeSstColdEndAccuracy,
  sstColdEndAccuracyClause,
} from "../lib/sstColdEndAccuracy";
import {
  aerosolCeilingBoundPrefix,
  aerosolCeilingCensoringClause,
  probeAerosolCeilingCensoring,
} from "../lib/probeAerosolCeilingCensoring";
import { averagedSstCensoringNote } from "../lib/marineAveragedSstCensoring";
import { averagedAerosolCensoringNote } from "../lib/probeAerosolAveragedCensoring";
import type { MarineAveragedSstFootprint } from "../lib/marineAveragedSstSupport";
import { probeRecordGaps, probeRecordGapsClause } from "../lib/probeRecordGaps";
import { probeSstSamplingGateClause } from "../lib/sstObservingConstraints";
import { probeLstSamplingGateClause } from "../lib/lstObservingConstraints";
import { probeVegetationSamplingGateClause } from "../lib/vegetationObservingConstraints";
import { ICONS } from "./icons";

/** What the current series is: which layer, and where it was sampled. */
export interface ProbeSeriesContext {
  layerId: LayerId;
  /** Omitted for drawn regions, whose mean spans many latitudes. */
  latitude?: number;
}

/**
 * The probe result card: a time-series chart of the sampled values at a
 * clicked location, a status/stat line, and a CSV download. Fills in
 * progressively as the sampler streams values, so long records feel alive
 * rather than stuck behind a spinner.
 *
 * Two toggles shape the analysis:
 *  - Mode: "Point" (the clicked pixel) vs "Area" (mean over a ~1° box) —
 *    switching re-samples via the onModeChange callback.
 *  - View: "Values" vs "Anomaly" (minus the calendar-month climatology) —
 *    a pure re-render; the anomaly is where droughts and trends stop hiding
 *    behind the seasonal cycle.
 */

type ProbeView = "values" | "anomaly";

export class ProbePanel {
  private readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly subtitle: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly status: HTMLElement;
  private readonly downloadBtn: HTMLButtonElement;
  private readonly copyBtn: HTMLButtonElement;
  private copyResetTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly modeButtons = new Map<PanelMode, HTMLButtonElement>();
  private modeSegment!: HTMLElement;
  private readonly viewButtons = new Map<ProbeView, HTMLButtonElement>();

  private months: YearMonth[] = [];
  private values: (number | null)[] = [];
  private scale: ProbeScale | undefined;
  private context: ProbeSeriesContext | undefined;
  /** Bumped per series so a late lazy summary of an old probe is discarded. */
  private seriesToken = 0;
  private csv: (() => string) | undefined;
  private csvFilename = "probe.csv";
  private view: ProbeView = "values";
  private modeValue: PanelMode = "point";

  constructor(
    container: HTMLElement,
    private readonly onClose?: () => void,
    private readonly onModeChange?: (mode: PanelMode) => void
  ) {
    this.root = container;
    this.root.classList.add("probe");
    this.root.setAttribute("aria-hidden", "true");
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-label", "Time-series probe");

    const header = document.createElement("div");
    header.className = "probe__header";

    const heading = document.createElement("div");
    this.title = document.createElement("h2");
    this.title.className = "probe__title";
    this.subtitle = document.createElement("p");
    this.subtitle.className = "probe__subtitle";
    heading.append(this.title, this.subtitle);

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "probe__close";
    closeBtn.title = "Close probe";
    closeBtn.setAttribute("aria-label", "Close probe");
    closeBtn.innerHTML = ICONS.close;
    closeBtn.addEventListener("click", () => {
      this.close();
      this.onClose?.();
    });

    header.append(heading, closeBtn);

    // Mode (re-samples) and view (re-renders) segmented toggles.
    const options = document.createElement("div");
    options.className = "probe__options";
    this.modeSegment = this.buildSegment(
      "Sampling",
      [
        ["point", "Point"],
        ["area", "Area ~1°"],
      ],
      this.modeButtons,
      (mode) => this.selectMode(mode as PanelMode)
    );
    options.append(
      this.modeSegment,
      this.buildSegment(
        "View",
        [
          ["values", "Values"],
          ["anomaly", "Anomaly"],
        ],
        this.viewButtons,
        (view) => this.selectView(view as ProbeView)
      )
    );

    this.canvas = document.createElement("canvas");
    this.canvas.className = "probe__chart";

    this.status = document.createElement("p");
    this.status.className = "probe__status";
    this.status.setAttribute("aria-live", "polite");

    const footer = document.createElement("div");
    footer.className = "probe__footer";

    this.downloadBtn = document.createElement("button");
    this.downloadBtn.type = "button";
    this.downloadBtn.className = "probe__download";
    this.downloadBtn.textContent = "Download CSV";
    this.downloadBtn.disabled = true;
    this.downloadBtn.addEventListener("click", () => this.downloadCsv());

    this.copyBtn = document.createElement("button");
    this.copyBtn.type = "button";
    this.copyBtn.className = "probe__download";
    this.copyBtn.textContent = "Copy CSV";
    this.copyBtn.disabled = true;
    this.copyBtn.addEventListener("click", () => this.copyCsv());

    const caveat = document.createElement("p");
    caveat.className = "probe__caveat";
    caveat.textContent =
      "Approximate: values reconstructed from imagery colors.";

    footer.append(this.downloadBtn, this.copyBtn, caveat);

    this.root.append(header, options, this.canvas, this.status, footer);
    this.reflectToggles();
  }

  get isOpen(): boolean {
    return this.root.classList.contains("is-open");
  }

  /** The active sampling mode (sticky across probes). */
  get mode(): PanelMode {
    return this.modeValue;
  }

  /**
   * Show/hide the Point/Area sampling toggle. Drawn-region charts hide it —
   * their sampling footprint is the drawn box, not a mode.
   */
  setModeToggleVisible(visible: boolean): void {
    this.modeSegment.hidden = !visible;
  }

  /** Open (or refocus) the panel for a new probe. */
  open(layerLabel: string, locationText: string): void {
    this.title.textContent = layerLabel;
    this.subtitle.textContent = locationText;
    this.months = [];
    this.values = [];
    this.csv = undefined;
    this.downloadBtn.disabled = true;
    this.copyBtn.disabled = true;
    this.copyBtn.textContent = "Copy CSV";
    this.setStatus("Sampling…");
    this.root.classList.add("is-open");
    this.root.setAttribute("aria-hidden", "false");
    this.draw();
  }

  close(): void {
    this.root.classList.remove("is-open");
    this.root.setAttribute("aria-hidden", "true");
  }

  setStatus(text: string): void {
    this.status.textContent = text;
  }

  /** Provide the full month range up front; values stream in via setValue. */
  beginSeries(
    months: YearMonth[],
    scale: ProbeScale,
    // Identifies what is being charted, for layer-specific summaries. A drawn
    // region carries no latitude: its mean spans locations that need not share
    // a hemisphere or a seasonal cycle.
    context?: ProbeSeriesContext
  ): void {
    this.months = months;
    this.values = new Array(months.length).fill(null);
    this.scale = scale;
    this.context = context;
    this.seriesToken++;
    this.draw();
  }

  setValue(index: number, value: number | null): void {
    this.values[index] = value;
  }

  /** Redraw the chart (call at progress intervals, not per-value). */
  refresh(): void {
    this.draw();
  }

  /**
   * Sampling finished: show summary stats and enable CSV download.
   *
   * `emptySeriesNote`, when supplied, replaces the bare "no data" line for a
   * record that came back empty — see lib/atmosphereProbeDomain.ts. A product
   * defined over land only has no value over open water by construction, and
   * saying "no data" there reports a domain boundary as a retrieval failure.
   *
   * `spatialSupportNote`, when supplied, says what share of an averaged
   * footprint actually returned data — see lib/marineAveragedSstSupport.ts.
   * The header names the box that was drawn; the mean covers only the pixels
   * inside it that carried a value, and those are not the same thing whenever
   * the footprint straddles the product's domain. Callers pass null for the
   * ordinary case, so a fully sampled footprint reads exactly as before.
   *
   * `averagedFootprint` names which averaged footprint produced the series, or
   * null for a point probe. It is passed explicitly rather than read from
   * `mode` because a drawn region hides the Point/Area toggle, so the panel's
   * own mode does not describe how a region series was combined. See
   * lib/marineAveragedSstCensoring.ts: the SST end-cap screen is exact over a
   * point probe's median but blind inside an averaged mean.
   */
  finish(
    csv: () => string,
    filename: string,
    emptySeriesNote?: string | null,
    spatialSupportNote?: string | null,
    averagedFootprint?: MarineAveragedSstFootprint | null
  ): void {
    this.csv = csv;
    this.csvFilename = filename;
    this.downloadBtn.disabled = false;
    this.copyBtn.disabled = false;
    this.draw();

    const stats = seriesStats(this.values);
    if (!stats || !this.scale) {
      // An averaged footprint that returned nothing is not "no data at this
      // point" — there was no point. Prefer the support note's own wording
      // when it has one, so the sentence matches what was actually sampled.
      this.setStatus(
        [
          spatialSupportNote
            ? asSentence(spatialSupportNote)
            : "No data at this point for this layer.",
          emptySeriesNote,
        ]
          .filter(Boolean)
          .join(" ")
      );
      return;
    }
    const s = this.scale;
    const fmt = (t: number): string => formatProbeValue(scaleValue(t, s), s);
    // Trend runs on physical values (slope in scale units/year), not the
    // 0..1 gradient positions the chart stores.
    const physical = this.values.map((v) =>
      v === null ? null : scaleValue(v, s)
    );
    const trend = trendSummary(this.months, physical, s);
    // Two different accuracy claims, both needed. The quantization step is how
    // finely a gradient position resolves; the measured inversion RMSE is
    // whether that position lands on the right value — for SST the second is
    // ~17x the first, so quoting only the step overstates precision badly.
    const accuracy = this.context
      ? inversionAccuracyClause(probeInversionAccuracy(this.context.layerId, s))
      : "";
    // That second figure is a whole-ramp RMSE, and for SST the repository has
    // already measured that the error is not uniform across the ramp it
    // summarizes: below ~4 °C it is 2.8 °C, against 0.1–0.4 °C elsewhere,
    // because the legend anchors its cold stop at GIBS's ~2 °C hue so that the
    // black GIBS renders for an absent retrieval stays rejected. Quoting only
    // the pooled number beside a polar reading understates that reading's error
    // roughly threefold, so name the band figure beside it. Silent for every
    // other layer, for an empty record, and for any SST record that stays out
    // of the cold band.
    const sstColdEnd = sstColdEndAccuracyClause(
      probeSstColdEndAccuracy(this.context?.layerId, physical)
    );
    // The trend is seasonally corrected, but the mean beside it is not: it
    // averages whichever months returned data. When those months are unevenly
    // spread across the calendar the mean carries a seasonal-sampling bias,
    // so measure it and say so. Silent whenever the record is balanced or the
    // bias falls below the inversion's own resolution.
    const seasonal = seasonalSamplingClause(
      seasonalSamplingBalance(this.months, physical),
      s
    );
    // NASA's published SST colormap ends in two OPEN caps, and the months that
    // land in them are exactly the ones that set the extremes — so for this one
    // layer `min`, `mean` and `max` can be one-sided bounds rather than
    // estimates. The mean is bounded too because it contains the censored month:
    // it is the statistic a reader carries away, and it sits between two
    // inequality-marked extremes, so leaving it bare reads as the only reliable
    // number on the line. Show the inequality with each number and say which
    // statistics it applies to. Silent for every other layer and for any SST
    // record that stays inside the finite ramp, so an ordinary readout is
    // unchanged.
    const sstCensoring = probeSstExtremeCensoring(
      this.context?.layerId,
      physical
    );
    const sstCensoringClause = sstExtremeCensoringClause(sstCensoring);
    // That clause names min, mean and max — and stops there, while the trend
    // reported a few fields earlier is fitted over the very same series. An
    // enumeration that lists which statistics are bounds reads as a claim that
    // the ones it omits are not, so say the trend inherits the censoring too.
    // Unlike the mean it gets no direction: a capped month sits in some
    // within-season pairs as the earlier member and in others as the later
    // one, so correcting it moves Sen's median whichever way the record's
    // shape decides — which is what the cap destroyed. Silent for every other
    // layer, for a record inside the finite ramp, and for one too short to
    // report a trend at all.
    const sstTrendCensoring = sstTrendCensoringClause(
      probeSstTrendCensoring(sstCensoring, trend)
    );
    // Both clauses above screen the CHARTED values. That is exact for a point
    // probe, whose value is a median of a tight pixel block and so is one of
    // the decoded pixels. An area or drawn-region value is a weighted mean of
    // per-pixel decodes instead, and a mean is not one of its members: a
    // footprint holding both capped and resolved pixels averages to a number
    // inside the finite ramp while still carrying the cap's one-sided error.
    // Nothing the sampler returns can reveal that, so no direction is claimed
    // — only that an unmarked averaged value is not an uncensored one. Silent
    // for the point probe, for every other layer, and for an empty record.
    const sstAveragedCensoring = averagedSstCensoringNote(
      averagedFootprint,
      sstCensoring
    );
    // Ramp censoring says which of these statistics are bounds; it does not say
    // which water, or which moments, they describe. The cited SST product
    // composites Aqua's daytime overpass on cloud-screened days only, so the
    // mean beside it is not a monthly-mean sea-surface temperature and the trend
    // is fitted through daytime clear-sky values — neither recoverable from the
    // numbers. The place panel already states this for a single month; the
    // series surface did not. Silent for every other layer.
    const sstSamplingGate = probeSstSamplingGateClause(
      this.context?.layerId,
      stats.count > 0
    );
    // The denominator above is the *distributed* record, not the calendar span:
    // monthRangeForLayer drops each layer's declared distribution gaps, so for
    // SST, snow, NDVI and EVI a full read prints "M of M months" while months
    // inside the span carry no composite at all. Name them, or the fraction
    // reads as complete coverage. Silent for every layer with no pinned gap.
    const recordGapsClause = probeRecordGapsClause(
      probeRecordGaps(this.context?.layerId, this.months)
    );
    // SST is not the only layer NASA renders with an open terminal bin. The
    // aerosol colormap's final bin is `≥ 0.900`, and dust and smoke columns
    // routinely sit above it, so this layer's max — and, because there is no
    // opposing cap, its mean — are one-sided bounds whenever a sampled month
    // lands there. Its min is genuinely two-sided (the ramp closes at 0 and
    // AOD cannot be negative), which is why the prefix is asked for per
    // statistic rather than applied to the group. Silent for every other layer
    // and for any aerosol record that stays inside the finite ramp.
    const aerosolCensoring = probeAerosolCeilingCensoring(
      this.context?.layerId,
      physical
    );
    const aerosolCensoringClause =
      aerosolCeilingCensoringClause(aerosolCensoring);
    // And that screen has the same blind spot on an averaged footprint that the
    // SST one does, for the same reason: it reads the region's monthly MEANS,
    // and a mean of capped and resolved pixels lands inside the finite ramp.
    // Two things make it worse here. Averaging dilutes exactly the signal the
    // cap marks — the columns reaching 0.9 are dust and smoke plumes, routinely
    // narrower than a drawn box — so a surviving mark means the whole footprint
    // averaged past the ceiling, and its absence says less the bigger the box.
    // But the DIRECTION is knowable, unlike SST's: this ramp is open at one end
    // only, so a capped pixel always averages in below the loading it had. Say
    // both, and still render no inequality — presence stays undetectable.
    // Silent for the point probe, for every other layer, and for an empty record.
    const aerosolAveragedCensoring = averagedAerosolCensoringNote(
      averagedFootprint,
      aerosolCensoring
    );
    // SST is likewise not the only layer whose statistics are gated by when and
    // through what the instrument looked. The land-surface-temperature layer
    // renders MODIS/Terra's DAYTIME monthly composite: mid-morning overpass,
    // clear-sky days only, and a radiometric skin temperature rather than the
    // 2 m air temperature the app offers as a sibling layer in the same
    // category. So the same point can be probed on both and the two series set
    // side by side, and neither the numbers nor the panel's title says they are
    // different quantities. The place panel's LST card states all three limits;
    // the series surface stated none. Silent for every other layer.
    const lstSamplingGate = probeLstSamplingGateClause(
      this.context?.layerId,
      stats.count > 0
    );
    // And SST and LST are not the only layers whose statistics are gated by how
    // the product reduced each month. The two vegetation-index layers are the
    // sharper case: their monthly value is not an average at all. An optical
    // index exists only where the sensor got a clear, sunlit, snow-free view, so
    // cloudy and snow-covered days are left out rather than averaged in; each
    // compositing window is then reduced by a constrained-view MAXIMUM-value
    // composite, which keeps its least-contaminated observation instead of
    // averaging the eligible ones. So the mean printed above averages selected
    // within-month states, and the trend is fitted through them — the one
    // reduction in the app that a reader is most likely to take for a monthly
    // average. The clause distinguishes the two layers: the selection maximizes
    // NDVI, and the observation it keeps merely supplies that window's EVI, so
    // only NDVI's value carries the not-below-their-average inequality. Silent
    // for every other layer and for an empty record.
    const vegetationSamplingGate = probeVegetationSamplingGateClause(
      this.context?.layerId,
      stats.count > 0
    );
    // At most one of the two ramps can apply — a series belongs to one layer —
    // so the first non-empty prefix is the whole answer.
    const boundPrefix = (statistic: "min" | "mean" | "max"): string =>
      sstExtremeBoundPrefix(sstCensoring, statistic) ||
      aerosolCeilingBoundPrefix(aerosolCensoring, statistic);
    const stat =
      `${stats.count} of ${this.months.length} months` +
      (recordGapsClause ? ` · ${recordGapsClause}` : "") +
      ` · min ${boundPrefix("min")}${fmt(stats.min)}` +
      ` · mean ${boundPrefix("mean")}${fmt(stats.mean)}` +
      ` · max ${boundPrefix("max")}${fmt(stats.max)}` +
      ` · ${uncertaintyText(s)} per value` +
      (accuracy ? ` · ${accuracy}` : "") +
      (sstColdEnd ? ` · ${sstColdEnd}` : "") +
      ` · ${trendClause(trend)}` +
      (seasonal ? ` · ${seasonal}` : "") +
      (sstCensoringClause ? ` · ${sstCensoringClause}` : "") +
      (sstTrendCensoring ? ` · ${sstTrendCensoring}` : "") +
      (sstAveragedCensoring ? ` · ${sstAveragedCensoring}` : "") +
      (sstSamplingGate ? ` · ${sstSamplingGate}` : "") +
      (lstSamplingGate ? ` · ${lstSamplingGate}` : "") +
      (vegetationSamplingGate ? ` · ${vegetationSamplingGate}` : "") +
      (aerosolCensoringClause ? ` · ${aerosolCensoringClause}` : "") +
      (aerosolAveragedCensoring ? ` · ${aerosolAveragedCensoring}` : "") +
      (spatialSupportNote ? ` · ${spatialSupportNote}` : "");
    this.setStatus(stat);
    this.appendPeakGreenness(stat, physical);
  }

  /**
   * Append the vegetation-index calendar-timing clause: which month held each
   * year's highest NDVI, how tightly that recurs, and — each only when it is
   * not already true of the whole record — whether that month led the tally
   * outright or shared the lead with another, how many of the probed years
   * actually summarized rather than dropping out, how often that peak was
   * actually flanked by observed months rather than by a MOD13A3 gap, how
   * often it was tied with another month rather than held alone, and whether
   * the year's greenness massed near one month at all. The NDVI phenology
   * helpers pull in per-year summarization and circular statistics, so they
   * load on demand rather than riding in the entry chunk; the clause lands a
   * moment after the stats, which the status line already fills in
   * progressively. A newer series invalidates an in-flight load.
   */
  private appendPeakGreenness(stat: string, physical: (number | null)[]): void {
    const context = this.context;
    // A drawn region has no single latitude, so its seasonal timing is
    // undefined — skip the clause rather than pick a hemisphere.
    const latitude = context?.latitude;
    if (!context || latitude === undefined) return;
    const months = this.months;
    const token = this.seriesToken;
    void import("../lib/probePeakGreenness")
      .then(
        ({
          dominantMonthTieClause,
          peakGreennessClause,
          peakSupportClause,
          peakTieClause,
          peakYearCoverageClause,
          probePeakGreennessTiming,
          probePeakSupport,
          probeSeasonalConcentration,
          seasonalConcentrationClause,
        }) => {
          if (token !== this.seriesToken) return; // superseded by a newer probe
          const timing = probePeakGreennessTiming(
            context.layerId,
            months,
            physical,
            latitude
          );
          const clause = peakGreennessClause(timing);
          if (!clause) return;
          // Whether the named month leads the tally outright or merely shares
          // the lead — the count beside it cannot say which, since it never
          // reports whether another month reached the same total. Silent for a
          // decisive record, so only a shared lead pays for the qualification.
          const modalTie = dominantMonthTieClause(timing);
          // How much of the probed record stood behind that month, and over
          // which years: the clause's own denominator counts only the years
          // that summarized, so a record that mostly dropped out reads like a
          // short but complete one. Silent when every supplied year
          // contributed, so a full record adds no status-line text.
          const yearCoverage = peakYearCoverageClause(timing);
          // How firmly the sampled months stand behind that modal peak month.
          // Silent unless some year's peak sits beside a gap or on the
          // calendar-year edge, so a clean record adds no status-line text.
          const support = peakSupportClause(
            timing,
            probePeakSupport(context.layerId, months, physical, latitude)
          );
          // Whether the named month was the year's peak on its own. Also
          // silent by default, so only a record that actually plateaued pays
          // for the qualification.
          const tied = peakTieClause(timing);
          // Whether the year's greenness massed near one month or sat spread
          // around the calendar with that month merely topping it. Silent for a
          // firmly seasonal record, so only a diffuse one pays for the clause.
          const concentration = seasonalConcentrationClause(
            timing,
            probeSeasonalConcentration(
              context.layerId,
              months,
              physical,
              latitude
            )
          );
          this.setStatus(
            [stat, clause, modalTie, yearCoverage, support, tied, concentration]
              .filter(Boolean)
              .join(" · ")
          );
        }
      )
      .catch(() => {
        // A failed chunk load must leave the stats already on screen intact.
      });
  }

  // --- Toggles -----------------------------------------------------------------

  private buildSegment(
    label: string,
    entries: [string, string][],
    registry: Map<string, HTMLButtonElement>,
    onSelect: (key: string) => void
  ): HTMLElement {
    const group = document.createElement("div");
    group.className = "probe__segment";
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", label);
    for (const [key, text] of entries) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "probe__segment-btn";
      button.textContent = text;
      button.addEventListener("click", () => onSelect(key));
      registry.set(key, button);
      group.appendChild(button);
    }
    return group;
  }

  private selectMode(mode: PanelMode): void {
    if (mode === this.modeValue) return;
    this.modeValue = mode;
    this.reflectToggles();
    this.onModeChange?.(mode); // the app re-runs sampling in the new mode
  }

  private selectView(view: ProbeView): void {
    if (view === this.view) return;
    this.view = view;
    this.reflectToggles();
    this.draw();
  }

  private reflectToggles(): void {
    for (const [key, btn] of this.modeButtons) {
      btn.setAttribute("aria-pressed", String(key === this.modeValue));
    }
    for (const [key, btn] of this.viewButtons) {
      btn.setAttribute("aria-pressed", String(key === this.view));
    }
  }

  private downloadCsv(): void {
    if (!this.csv) return;
    const blob = new Blob([this.csv()], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = this.csvFilename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /** Copy the same provenance-stamped CSV the download produces. */
  private copyCsv(): void {
    if (!this.csv) return;
    navigator.clipboard
      .writeText(this.csv())
      .then(() => this.flashCopyLabel("Copied ✓"))
      // Clipboard access can be denied (permissions policy, insecure context).
      .catch(() => this.flashCopyLabel("Copy failed"));
  }

  private flashCopyLabel(text: string): void {
    this.copyBtn.textContent = text;
    clearTimeout(this.copyResetTimer);
    this.copyResetTimer = setTimeout(() => {
      this.copyBtn.textContent = "Copy CSV";
    }, 1600);
  }

  // --- Chart -----------------------------------------------------------------

  private draw(): void {
    const styles = getComputedStyle(this.root);
    const accent = styles.getPropertyValue("--accent").trim() || "#4ea1ff";
    const fg = styles.getPropertyValue("--fg").trim() || "#e8eef7";

    const cssWidth = this.canvas.clientWidth || 340;
    const cssHeight = this.canvas.clientHeight || 150;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = cssWidth * dpr;
    this.canvas.height = cssHeight * dpr;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    const pad = { left: 40, right: 8, top: 8, bottom: 18 };
    const plotW = cssWidth - pad.left - pad.right;
    const plotH = cssHeight - pad.top - pad.bottom;
    const n = this.months.length;
    ctx.font = "10px system-ui, sans-serif";

    // The plotted series and its 0..1 plot mapping. Values plot the raw
    // gradient position; anomalies plot on a symmetric band around zero.
    const anomaly = this.view === "anomaly";
    const series = anomaly
      ? anomalySeries(this.months, this.values)
      : this.values;
    let toPlot = (v: number): number => v;
    let axisLabel = (t: number): string =>
      this.scale ? formatProbeValue(scaleValue(t, this.scale), this.scale) : "";
    if (anomaly) {
      const maxAbs = Math.max(
        0.05,
        ...series.filter((v): v is number => v !== null).map(Math.abs)
      );
      toPlot = (v) => (v + maxAbs) / (2 * maxAbs);
      axisLabel = (t) => {
        if (!this.scale) return "";
        const scaled = (t * 2 - 1) * maxAbs * (this.scale.max - this.scale.min);
        const sign = scaled > 0 ? "+" : "";
        return `${sign}${formatProbeValue(scaled, this.scale)}`;
      };
    }

    // Axes & gridlines: bottom, middle (zero for anomalies), top.
    ctx.strokeStyle = fg;
    ctx.fillStyle = fg;
    for (const t of [0, 0.5, 1]) {
      const y = pad.top + (1 - t) * plotH;
      ctx.globalAlpha = anomaly && t === 0.5 ? 0.4 : 0.15;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + plotW, y);
      ctx.stroke();
      ctx.globalAlpha = 0.7;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(axisLabel(t), pad.left - 5, y);
    }

    // Year ticks: aim for ~6 labels across the record.
    if (n > 1) {
      const firstYear = this.months[0].year;
      const lastYear = this.months[n - 1].year;
      const step = Math.max(1, Math.ceil((lastYear - firstYear) / 6));
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      for (let year = firstYear; year <= lastYear; year++) {
        if ((year - firstYear) % step !== 0) continue;
        const index = this.months.findIndex((m) => m.year === year);
        if (index < 0) continue;
        const x = pad.left + (index / (n - 1)) * plotW;
        ctx.globalAlpha = 0.7;
        ctx.fillText(String(year), x, pad.top + plotH + 5);
        ctx.globalAlpha = 0.1;
        ctx.beginPath();
        ctx.moveTo(x, pad.top);
        ctx.lineTo(x, pad.top + plotH);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    // The Sen's slope trend line + CI band, under the data line. Drawn only
    // for a significant, testable trend so no misleading line runs through
    // noise. Computed on the *plotted* series (gradient positions or anomaly
    // units), so the line matches the points regardless of view; the
    // seasonal Mann-Kendall p is scale-invariant, and subtracting a
    // per-season climatology (the anomaly view) leaves within-season ranks
    // and Sen's slope unchanged.
    if (n > 1 && this.scale) {
      this.drawTrend(ctx, series, toPlot, pad, plotW, plotH, n, accent);
    }

    // The series itself — line segments broken at no-data gaps.
    if (n > 1) {
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.5;
      ctx.lineJoin = "round";
      let penDown = false;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const v = series[i];
        if (v === null) {
          penDown = false;
          continue;
        }
        const x = pad.left + (i / (n - 1)) * plotW;
        const y = pad.top + (1 - toPlot(v)) * plotH;
        if (penDown) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
        penDown = true;
      }
      ctx.stroke();
    }
  }

  /**
   * Overlay the Sen's slope line and its 95% CI band. The line is anchored
   * at the series' median point (median value at median time — the standard
   * Sen's-line intercept) and is straight in time; endpoints are clipped to
   * the plot so a steep slope can't paint outside the axes.
   */
  private drawTrend(
    ctx: CanvasRenderingContext2D,
    series: (number | null)[],
    toPlot: (v: number) => number,
    pad: { left: number; top: number; right: number; bottom: number },
    plotW: number,
    plotH: number,
    n: number,
    accent: string
  ): void {
    const scale = this.scale;
    if (!scale) return;
    const trend = trendSummary(this.months, series, scale);
    if (!trend.significant) return;

    const times = this.months.map((m) => m.year + (m.month - 1) / 12);
    const validV: number[] = [];
    const validT: number[] = [];
    for (let i = 0; i < n; i++) {
      if (series[i] !== null) {
        validV.push(series[i] as number);
        validT.push(times[i]);
      }
    }
    if (validV.length < 2) return;
    const med = (a: number[]): number => {
      const s = [...a].sort((x, y) => x - y);
      const m = Math.floor(s.length / 2);
      return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    };
    const medT = med(validT);
    const medV = med(validV);

    // y (in plot pixels) of a line with the given per-year slope, evaluated
    // at plot index i (time linear in index for a contiguous monthly series).
    const yAt = (i: number, slopePerYear: number): number => {
      const v = medV + slopePerYear * (times[i] - medT);
      return pad.top + (1 - toPlot(v)) * plotH;
    };
    const x0 = pad.left;
    const x1 = pad.left + plotW;

    ctx.save();
    ctx.beginPath();
    ctx.rect(pad.left, pad.top, plotW, plotH);
    ctx.clip();

    // CI band between the lower- and upper-slope lines.
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.moveTo(x0, yAt(0, trend.lowerPerYear));
    ctx.lineTo(x1, yAt(n - 1, trend.lowerPerYear));
    ctx.lineTo(x1, yAt(n - 1, trend.upperPerYear));
    ctx.lineTo(x0, yAt(0, trend.upperPerYear));
    ctx.closePath();
    ctx.fill();

    // The Sen's slope line itself — dashed, so it reads as a fit, not data.
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.25;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(x0, yAt(0, trend.slopePerYear));
    ctx.lineTo(x1, yAt(n - 1, trend.slopePerYear));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}

/**
 * Render a lower-case clause as a standalone sentence, so a support note can
 * carry the whole status line when there are no stats to lead with.
 */
function asSentence(clause: string): string {
  const text = `${clause.charAt(0).toUpperCase()}${clause.slice(1)}`;
  return /[.!?]$/.test(text) ? text : `${text}.`;
}
