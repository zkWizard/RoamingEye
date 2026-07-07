import {
  type YearMonth,
  fractionToIndex,
  indexToFraction,
  formatYm,
} from "../lib/timeline";

/**
 * A horizontal ruler-style time scrubber: one major tick per year (labelled),
 * twelve minor ticks per year (months), and a draggable handle. Supports mouse,
 * touch (Pointer Events), and keyboard.
 */
export class TimeSlider {
  private readonly months: YearMonth[];
  private readonly onChange: (index: number, ym: YearMonth) => void;

  private readonly track: HTMLDivElement;
  private readonly handle: HTMLDivElement;
  private readonly readout: HTMLDivElement;

  private index: number;
  private dragging = false;

  constructor(
    container: HTMLElement,
    months: YearMonth[],
    initialIndex: number,
    onChange: (index: number, ym: YearMonth) => void
  ) {
    this.months = months;
    this.onChange = onChange;
    this.index = Math.min(months.length - 1, Math.max(0, initialIndex));

    container.classList.add("timeline");
    container.innerHTML = "";

    this.readout = document.createElement("div");
    this.readout.className = "timeline__readout";
    container.appendChild(this.readout);

    this.track = document.createElement("div");
    this.track.className = "timeline__track";
    this.track.tabIndex = 0;
    this.track.setAttribute("role", "slider");
    this.track.setAttribute("aria-label", "Month");
    this.track.setAttribute("aria-valuemin", "0");
    this.track.setAttribute("aria-valuemax", String(months.length - 1));
    container.appendChild(this.track);

    const line = document.createElement("div");
    line.className = "timeline__line";
    this.track.appendChild(line);

    this.renderTicks();

    this.handle = document.createElement("div");
    this.handle.className = "timeline__handle";
    this.track.appendChild(this.handle);

    this.attachEvents();
    this.update(this.index, false);
  }

  private renderTicks(): void {
    const count = this.months.length;
    // Ranges spanning decades thin out: month ticks only while they're
    // readable, and year labels sized to the track's actual width so they
    // never collide — a 360px phone gets far fewer labels than a desktop.
    const showMonthTicks = count <= 120;
    const years = Math.ceil(count / 12);
    const trackWidth = this.track.clientWidth || 640;
    const labelBudget = Math.max(2, Math.floor(trackWidth / 40));
    const labelEvery = Math.max(1, Math.ceil(years / labelBudget));

    this.months.forEach((ym, i) => {
      const fraction = indexToFraction(i, count);
      const isYear = ym.month === 1 || i === 0;
      if (!isYear && !showMonthTicks) return;

      const tick = document.createElement("div");
      tick.className = `timeline__tick ${isYear ? "timeline__tick--year" : "timeline__tick--month"}`;
      tick.style.left = `${fraction * 100}%`;
      this.track.appendChild(tick);

      if (isYear && (i === 0 || ym.year % labelEvery === 0)) {
        const label = document.createElement("span");
        label.className = "timeline__year";
        label.style.left = `${fraction * 100}%`;
        label.textContent = String(ym.year);
        this.track.appendChild(label);
      }
    });
  }

  private attachEvents(): void {
    this.track.addEventListener("pointerdown", (e) => {
      this.dragging = true;
      this.track.setPointerCapture(e.pointerId);
      this.setFromClientX(e.clientX);
    });
    this.track.addEventListener("pointermove", (e) => {
      if (this.dragging) this.setFromClientX(e.clientX);
    });
    const end = (e: PointerEvent) => {
      if (!this.dragging) return;
      this.dragging = false;
      if (this.track.hasPointerCapture(e.pointerId)) {
        this.track.releasePointerCapture(e.pointerId);
      }
    };
    this.track.addEventListener("pointerup", end);
    this.track.addEventListener("pointercancel", end);

    this.track.addEventListener("keydown", (e) => {
      let next: number;
      switch (e.key) {
        case "ArrowLeft":
        case "ArrowDown":
          next = this.index - 1;
          break;
        case "ArrowRight":
        case "ArrowUp":
          next = this.index + 1;
          break;
        case "PageDown":
          next = this.index - 12;
          break;
        case "PageUp":
          next = this.index + 12;
          break;
        case "Home":
          next = 0;
          break;
        case "End":
          next = this.months.length - 1;
          break;
        default:
          return;
      }
      e.preventDefault();
      this.update(Math.min(this.months.length - 1, Math.max(0, next)), true);
    });
  }

  private setFromClientX(clientX: number): void {
    const rect = this.track.getBoundingClientRect();
    const fraction = (clientX - rect.left) / rect.width;
    this.update(fractionToIndex(fraction, this.months.length), true);
  }

  /** Programmatically move the handle without firing onChange. */
  setIndex(index: number): void {
    this.update(Math.min(this.months.length - 1, Math.max(0, index)), false);
  }

  private update(index: number, emit: boolean): void {
    const changed = index !== this.index;
    this.index = index;
    const ym = this.months[index];
    const fraction = indexToFraction(index, this.months.length);

    this.handle.style.left = `${fraction * 100}%`;
    this.readout.textContent = formatYm(ym);
    this.track.setAttribute("aria-valuenow", String(index));
    this.track.setAttribute("aria-valuetext", formatYm(ym));

    if (emit && changed) this.onChange(index, ym);
  }
}
