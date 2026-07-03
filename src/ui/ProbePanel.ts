import {
  formatProbeValue,
  seriesStats,
  scaleValue,
  type ProbeScale,
} from "../lib/probe";
import type { YearMonth } from "../lib/timeline";
import { ICONS } from "./icons";

/**
 * The point-probe result card: a time-series chart of the sampled values at a
 * clicked location, a status/stat line, and a CSV download. Fills in
 * progressively as the sampler streams values, so long records feel alive
 * rather than stuck behind a spinner.
 */
export class ProbePanel {
  private readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly subtitle: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly status: HTMLElement;
  private readonly downloadBtn: HTMLButtonElement;

  private months: YearMonth[] = [];
  private values: (number | null)[] = [];
  private scale: ProbeScale | undefined;
  private csv: (() => string) | undefined;
  private csvFilename = "probe.csv";

  constructor(
    container: HTMLElement,
    private readonly onClose?: () => void
  ) {
    this.root = container;
    this.root.classList.add("probe");
    this.root.setAttribute("aria-hidden", "true");
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-label", "Point time-series probe");

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

    const caveat = document.createElement("p");
    caveat.className = "probe__caveat";
    caveat.textContent =
      "Approximate: values reconstructed from imagery colors.";

    footer.append(this.downloadBtn, caveat);

    this.root.append(header, this.canvas, this.status, footer);
  }

  get isOpen(): boolean {
    return this.root.classList.contains("is-open");
  }

  /** Open (or refocus) the panel for a new probe. */
  open(layerLabel: string, locationText: string): void {
    this.title.textContent = layerLabel;
    this.subtitle.textContent = locationText;
    this.months = [];
    this.values = [];
    this.csv = undefined;
    this.downloadBtn.disabled = true;
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
  beginSeries(months: YearMonth[], scale: ProbeScale): void {
    this.months = months;
    this.values = new Array(months.length).fill(null);
    this.scale = scale;
    this.draw();
  }

  setValue(index: number, value: number | null): void {
    this.values[index] = value;
  }

  /** Redraw the chart (call at progress intervals, not per-value). */
  refresh(): void {
    this.draw();
  }

  /** Sampling finished: show summary stats and enable CSV download. */
  finish(csv: () => string, filename: string): void {
    this.csv = csv;
    this.csvFilename = filename;
    this.downloadBtn.disabled = false;
    this.draw();

    const stats = seriesStats(this.values);
    if (!stats || !this.scale) {
      this.setStatus("No data at this point for this layer.");
      return;
    }
    const s = this.scale;
    const fmt = (t: number): string => formatProbeValue(scaleValue(t, s), s);
    this.setStatus(
      `${stats.count} of ${this.months.length} months · ` +
        `min ${fmt(stats.min)} · mean ${fmt(stats.mean)} · max ${fmt(stats.max)}`
    );
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

    const pad = { left: 34, right: 8, top: 8, bottom: 18 };
    const plotW = cssWidth - pad.left - pad.right;
    const plotH = cssHeight - pad.top - pad.bottom;
    const n = this.months.length;

    ctx.font = "10px system-ui, sans-serif";

    // Axes & gridlines: 0, ½ and full scale.
    ctx.strokeStyle = fg;
    ctx.fillStyle = fg;
    for (const t of [0, 0.5, 1]) {
      const y = pad.top + (1 - t) * plotH;
      ctx.globalAlpha = 0.15;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + plotW, y);
      ctx.stroke();
      ctx.globalAlpha = 0.7;
      if (this.scale) {
        const label = formatProbeValue(scaleValue(t, this.scale), this.scale);
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillText(label, pad.left - 5, y);
      }
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

    // The series itself — line segments broken at no-data gaps.
    if (n > 1) {
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.5;
      ctx.lineJoin = "round";
      let penDown = false;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const v = this.values[i];
        if (v === null) {
          penDown = false;
          continue;
        }
        const x = pad.left + (i / (n - 1)) * plotW;
        const y = pad.top + (1 - v) * plotH;
        if (penDown) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
        penDown = true;
      }
      ctx.stroke();
    }
  }
}
