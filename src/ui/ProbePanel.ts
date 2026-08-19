import {
  anomalySeries,
  formatProbeValue,
  seriesStats,
  scaleValue,
  uncertaintyText,
  type ProbeScale,
} from "../lib/probe";
import { trendSummary, trendClause, type TrendSummary } from "../lib/trend";
import { probeAbsenceStatusLine } from "../lib/probeAbsenceStatus";
import {
  seasonalSamplingBalance,
  seasonalSamplingClause,
} from "../lib/seasonalSamplingBalance";
import type { ProbeMode } from "../probe/ProbeSampler";

/** The user-toggleable sampling modes (regions are drawn, not toggled). */
export type PanelMode = Exclude<ProbeMode, "region">;
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
  sstTrendCensored,
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
import { averagedLstCensoringNote } from "../lib/probeLstAveragedCensoring";
import type { MarineAveragedSstFootprint } from "../lib/marineAveragedSstSupport";
import { probeRecordGaps, probeRecordGapsClause } from "../lib/probeRecordGaps";
import { probeSstSamplingGateClause } from "../lib/sstObservingConstraints";
import { probeLstSamplingGateClause } from "../lib/lstObservingConstraints";
import {
  lstExtremeBoundPrefix,
  lstExtremeCensoringClause,
  probeLstExtremeCensoring,
} from "../lib/probeLstExtremeCensoring";
import { probeVegetationSamplingGateClause } from "../lib/vegetationObservingConstraints";
import { uncalibratedVegetationAccuracyClause } from "../lib/vegetationIndexRamp";
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
  /**
   * Whatever had focus when the panel opened — the globe, for both gestures
   * that open it (Enter on the aim, or a click). The panel is `display:none`
   * when closed, so dismissing it from a control inside itself destroys the
   * focused element and drops focus on `<body>`; this is where it goes back.
   */
  private opener: HTMLElement | null = null;

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
      this.dismiss();
    });

    header.append(heading, closeBtn);

    // `role="dialog"` promises Escape dismisses this, and it did not — the only
    // way out was to find the close button, 20 Tabs along the ring. The handler
    // sits on the panel, not the document, so it fires only while focus is
    // inside: from the globe, Escape keeps its existing meaning (disarming the
    // region drawer), which a document-level listener would have swallowed.
    this.root.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.dismiss();
    });

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
    // Remember the opener once per opening, not per re-probe: switching mode
    // re-opens the panel for the same visit, and by then focus is on the mode
    // button inside it — which would make the panel its own opener.
    if (!this.isOpen) {
      this.opener =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
    }
    this.root.classList.add("is-open");
    this.root.setAttribute("aria-hidden", "false");
    this.draw();
  }

  /**
   * Close the panel. `restoreFocus` hands focus back to whatever opened it, and
   * belongs to the gestures that dismiss the panel *itself* — its close button
   * and Escape. The programmatic closes (switching layer, taking a search
   * result) pass nothing: focus is on the control the user actually used, and
   * pulling it to the globe would undo their own gesture.
   */
  close({ restoreFocus = false }: { restoreFocus?: boolean } = {}): void {
    if (!this.isOpen) return;
    // Only reclaim focus we are about to destroy. An outside pointerdown is
    // already on its way to focusing its own target; stealing it back would
    // fight the user.
    const hadFocusInside = this.root.contains(document.activeElement);
    this.root.classList.remove("is-open");
    this.root.setAttribute("aria-hidden", "true");
    if (restoreFocus && hadFocusInside) this.opener?.focus();
    this.opener = null;
  }

  /** The panel dismissing itself — close button and Escape share this path. */
  private dismiss(): void {
    this.close({ restoreFocus: true });
    this.onClose?.();
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
   * The replacement is `lib/probeAbsenceStatus.ts`, which also fixes where the
   * two notes rank: this line long said "replaces" while the code joined them,
   * so the sentence a domain note exists to correct led the note correcting it.
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
      // point" — there was no point — and a domain note replaces that sentence
      // outright rather than trailing it. See lib/probeAbsenceStatus.ts.
      this.setStatus(
        probeAbsenceStatusLine(spatialSupportNote, emptySeriesNote)
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
    // Each clause below is silent unless its own layer and record conditions
    // hold — every one returns "" or null otherwise, so an ordinary readout is
    // unchanged and only the applicable clauses reach the line. Each module's
    // own doc comment carries the full argument and its citations; the notes
    // here say only why the call sits where it does.
    //
    // Two accuracy claims, both needed: the quantization step is how finely a
    // gradient position resolves, the measured inversion RMSE whether that
    // position lands on the right value — for SST the second is ~17x the first.
    // Three modules can state that second one, exclusive by construction — each
    // is silent exactly when another speaks — so the line holds ONE accuracy
    // slot: pooled RMSE, else an uncalibrated index's fidelity, else SST's band.
    const inversionAccuracy = this.context
      ? probeInversionAccuracy(this.context.layerId, s)
      : null;
    const wholeRampAccuracy = inversionAccuracy
      ? inversionAccuracyClause(inversionAccuracy) ||
        uncalibratedVegetationAccuracyClause(
          inversionAccuracy.layerId,
          inversionAccuracy.status
        ) ||
        ""
      : "";
    // NASA's SST colormap ends in two OPEN caps, and the months landing in them
    // are the ones that set the extremes, so min, mean and max can be one-sided
    // bounds. The trend rides inside the same clause: it is fitted over the very
    // same series, and an enumeration naming only the three extremes reads as a
    // claim that it escaped the caps. Merged, the caps are described once under
    // the one `source …` attribution all four statistics share.
    const sstCensoring = probeSstExtremeCensoring(
      this.context?.layerId,
      physical
    );
    const sstCensoringClause = sstExtremeCensoringClause(
      sstCensoring,
      sstTrendCensored(probeSstTrendCensoring(sstCensoring, trend))
    );
    // SST's error is not uniform across its ramp (2.8 °C below ~4 °C against
    // 0.1–0.4 °C elsewhere), so a polar reading takes the band figure, which
    // absorbs the pooled clause it corrects rather than printing that ± twice.
    // After the ramp screen: a capped month is always inside this band, and an
    // unqualified ± must not stand over rows whose cold-side error is unbounded.
    const accuracy =
      sstColdEndAccuracyClause(
        probeSstColdEndAccuracy(this.context?.layerId, physical, sstCensoring),
        wholeRampAccuracy
      ) || wholeRampAccuracy;
    // That screen reads the CHARTED values — exact for a point probe, blind on
    // an averaged one, whose value is a mean of per-pixel decodes and so lands
    // inside the finite ramp even when it holds capped pixels. No direction is
    // claimable, only that an unmarked averaged value is not an uncensored one.
    const sstAveragedCensoring = averagedSstCensoringNote(
      averagedFootprint,
      sstCensoring
    );
    // Ramp censoring says which statistics are bounds, not which water or which
    // moments they describe: the cited product composites Aqua's daytime
    // overpass on cloud-screened days only, so this is not a monthly-mean SST.
    const sstSamplingGate = probeSstSamplingGateClause(
      this.context?.layerId,
      stats.count > 0
    );
    // The denominator is the *distributed* record, not the calendar span —
    // monthRangeForLayer drops declared distribution gaps, so a full read prints
    // "M of M months" while months inside the span carry no composite at all.
    const recordGapsClause = probeRecordGapsClause(
      probeRecordGaps(this.context?.layerId, this.months)
    );
    // The aerosol colormap's final bin is `≥ 0.900` and dust and smoke columns
    // routinely sit above it, so max — and, with no opposing cap, mean — are
    // one-sided bounds. Its min stays two-sided (the ramp closes at 0 and AOD
    // cannot be negative), which is why the prefix is asked per statistic.
    const aerosolCensoring = probeAerosolCeilingCensoring(
      this.context?.layerId,
      physical
    );
    // Takes the trend for the reason the SST clause does — it qualifies the
    // trend printed above, so it must know whether one was fitted — and stops
    // the direction there, for the same reason.
    const aerosolCensoringClause = aerosolCeilingCensoringClause(
      aerosolCensoring,
      trend
    );
    // Same averaged-footprint blind spot as SST's, but worse and one-sided:
    // averaging dilutes exactly the plumes the cap marks, so absence says less
    // the bigger the box — while a capped pixel always averages in below the
    // loading it had, because this ramp is open at one end only.
    const aerosolAveragedCensoring = averagedAerosolCensoringNote(
      averagedFootprint,
      aerosolCensoring
    );
    // LST renders MODIS/Terra's DAYTIME composite: mid-morning overpass,
    // clear-sky days only, and a radiometric skin temperature — not the 2 m air
    // temperature offered as a sibling layer, which the same point can be probed
    // on and set side by side without the numbers saying they differ.
    const lstSamplingGate = probeLstSamplingGateClause(
      this.context?.layerId,
      stats.count > 0
    );
    // GIBS closes LST's 200.0–350.0 K legend with a catch-all colour at each
    // end, and — unlike the MERRA-2 air-temperature caps, far enough off-ramp to
    // be rejected — these sit 3–4 RGB units from their adjacent finite bins, so
    // a capped pixel decodes into the terminal bin and prints as a number.
    const lstCensoring = probeLstExtremeCensoring(
      this.context?.layerId,
      physical
    );
    const lstCensoringClause = lstExtremeCensoringClause(lstCensoring);
    // The same averaged-footprint blind spot the two siblings above already
    // correct, and the last of the three capped ramps still missing it: the
    // screen above reads the CHARTED value, a median in point mode but a mean
    // of per-pixel decodes on an area, which lands inside the finite ramp even
    // when the footprint held capped ground. Both caps being open leaves the
    // direction unclaimable, as on the marine ramp and unlike aerosol's.
    const lstAveragedCensoring = averagedLstCensoringNote(
      averagedFootprint,
      lstCensoring
    );
    // The vegetation indices are the sharper case: their monthly value is not an
    // average at all. Only clear, sunlit, snow-free views are eligible, and each
    // window is reduced by a constrained-view MAXIMUM-value composite. So the
    // mean averages selected within-month states. Only NDVI's value carries the
    // not-below-their-average inequality — EVI merely rides the NDVI selection.
    const vegetationSamplingGate = probeVegetationSamplingGateClause(
      this.context?.layerId,
      stats.count > 0
    );
    // At most one of the three ramps can apply — a series belongs to one layer
    // — so the first non-empty prefix is the whole answer.
    const boundPrefix = (statistic: "min" | "mean" | "max"): string =>
      sstExtremeBoundPrefix(sstCensoring, statistic) ||
      aerosolCeilingBoundPrefix(aerosolCensoring, statistic) ||
      lstExtremeBoundPrefix(lstCensoring, statistic);
    // The trend is seasonally corrected; the mean beside it is not, so an
    // unevenly spread record biases it. Computed after the ramp screens because
    // the balanced mean it prints is reduced from the same possibly-capped
    // series, and must carry the same inequality the mean already does rather
    // than stand unqualified between two marked extremes. The offset itself
    // takes none: both means are bounds over the same months.
    const seasonal = seasonalSamplingClause(
      seasonalSamplingBalance(this.months, physical),
      s,
      boundPrefix("mean")
    );
    // The reading first, then its accuracy, then what the product's caps and
    // observing system do to it.
    const stat = [
      `${stats.count} of ${this.months.length} months`,
      recordGapsClause,
      `min ${boundPrefix("min")}${fmt(stats.min)}`,
      `mean ${boundPrefix("mean")}${fmt(stats.mean)}`,
      `max ${boundPrefix("max")}${fmt(stats.max)}`,
      `${uncertaintyText(s)} per value`,
      accuracy,
      trendClause(trend),
      seasonal,
      sstCensoringClause,
      sstAveragedCensoring,
      sstSamplingGate,
      lstSamplingGate,
      lstCensoringClause,
      lstAveragedCensoring,
      vegetationSamplingGate,
      aerosolCensoringClause,
      aerosolAveragedCensoring,
      spatialSupportNote,
    ]
      .filter(Boolean)
      .join(" · ");
    this.setStatus(stat);
    this.appendPeakGreenness(stat, physical);
    this.appendPrecipitationCycle(stat, physical);
    this.appendAerosolObservingEpoch(stat, trend);
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

  /**
   * Append the precipitation calendar clause: which calendar month of the
   * probed record holds the most water on average, which the least, and the
   * depth between the two. The stats above summarize the record as a whole and
   * say nothing seasonal — worse, the trend beside them is deliberately
   * seasonally corrected, so it removes exactly this signal — while a monsoonal
   * site and an evenly-watered one with the same mean print identically today.
   *
   * Loaded on demand for the same reason the greenness clause is: the cycle
   * pulls in per-calendar-month bucketing and the accumulation integrator, and
   * the status line already fills in progressively. A newer series invalidates
   * an in-flight load.
   *
   * This cannot race the greenness append: that clause is NDVI-only and this
   * one precipitation-only, so at most one of the two ever rebuilds the line
   * from `stat`.
   */
  private appendPrecipitationCycle(
    stat: string,
    physical: (number | null)[]
  ): void {
    const context = this.context;
    if (!context) return;
    const months = this.months;
    const token = this.seriesToken;
    void import("../lib/probePrecipitationCycle")
      .then(
        ({
          precipitationCycleClause,
          probePrecipitationCycle,
          probePrecipitationSeasonalTiming,
        }) => {
          if (token !== this.seriesToken) return; // superseded by a newer probe
          const clause = precipitationCycleClause(
            probePrecipitationCycle(context.layerId, months, physical),
            probePrecipitationSeasonalTiming(context.layerId, months, physical)
          );
          if (!clause) return;
          this.setStatus(`${stat} · ${clause}`);
        }
      )
      .catch(() => {
        // A failed chunk load must leave the stats already on screen intact.
      });
  }

  /**
   * Append what the aerosol trend was fitted across.
   *
   * The caps clause above says which VALUES the colormap bounds; this is the
   * separate question of what the SERIES was observed by. MERRA-2 assimilates
   * aerosol optical depth from instruments that came and went, and the probe
   * enumerates aerosol from the layer's first published month in 1980, so
   * every aerosol reading fits its trend straight across the arrival of EOS:
   * before 2000 the only assimilated AOD was AVHRR retrieved over ocean,
   * leaving the column over land to the underlying model.
   *
   * Loaded on demand for the reason the two clauses above are — the epoch
   * table and its readout are dead weight on every other layer, and the status
   * line already fills in progressively. A newer series invalidates an
   * in-flight load.
   *
   * This cannot race either clause above: that pair is NDVI-only and
   * precipitation-only and this one aerosol-only, so at most one of the three
   * ever rebuilds the line from `stat`.
   */
  private appendAerosolObservingEpoch(
    stat: string,
    trend: Pick<TrendSummary, "testable">
  ): void {
    const context = this.context;
    if (!context) return;
    const months = this.months;
    const token = this.seriesToken;
    void import("../lib/aerosolObservingEpoch")
      .then(({ aerosolObservingEpochClause, probeAerosolObservingEpoch }) => {
        if (token !== this.seriesToken) return; // superseded by a newer probe
        const clause = aerosolObservingEpochClause(
          probeAerosolObservingEpoch(context.layerId, months),
          trend
        );
        if (!clause) return;
        this.setStatus(`${stat} · ${clause}`);
      })
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

  /**
   * Adopt a sampling mode without asking for a re-sample. The shared-link
   * restore knows the sender's mode before there is any series to re-run, and
   * runs the probe itself immediately after; going through `selectMode` would
   * fire a second sampling pass over the same point.
   */
  restoreMode(mode: PanelMode): void {
    if (mode === this.modeValue) return;
    this.modeValue = mode;
    this.reflectToggles();
  }

  private selectMode(mode: PanelMode): void {
    if (mode === this.modeValue) return;
    this.restoreMode(mode);
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
