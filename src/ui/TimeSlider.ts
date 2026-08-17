import {
  type YearMonth,
  fractionToIndex,
  indexToFraction,
  formatYm,
} from "../lib/timeline";
import { ICONS } from "./icons";

/**
 * A horizontal ruler-style time scrubber: one major tick per year (labelled),
 * twelve minor ticks per year (months), and a draggable handle. Supports mouse,
 * touch (Pointer Events), and keyboard. A prev/next button pair steps one
 * entry at a time — precise where the drag handle is coarse.
 */
export class TimeSlider {
  private readonly months: YearMonth[];
  private readonly onChange: (index: number, ym: YearMonth) => void;

  private readonly track: HTMLDivElement;
  private readonly handle: HTMLDivElement;
  private readonly readout: HTMLDivElement;
  private readonly prevBtn: HTMLButtonElement;
  private readonly nextBtn: HTMLButtonElement;

  private index: number;
  private dragging = false;
  /** Base label for the forward stepper, before the end-of-record suffix. */
  private readonly nextStepLabel: string;

  constructor(
    container: HTMLElement,
    months: YearMonth[],
    initialIndex: number,
    onChange: (index: number, ym: YearMonth) => void,
    // Annual layers label entries "2024" rather than "Jan 2024".
    private readonly formatLabel: (ym: YearMonth) => string = formatYm,
    // Annual layers step by year, so the buttons say so.
    stepUnit: "month" | "year" = "month"
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
    this.track.setAttribute(
      "aria-label",
      stepUnit === "year" ? "Year" : "Month"
    );
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

    const steps = document.createElement("div");
    steps.className = "timeline__steps";
    this.prevBtn = this.makeStep(
      ICONS.chevronLeft,
      `Previous ${stepUnit} (←)`,
      -1
    );
    this.nextStepLabel = `Next ${stepUnit} (→)`;
    this.nextBtn = this.makeStep(ICONS.chevronRight, this.nextStepLabel, 1);
    steps.append(this.prevBtn, this.nextBtn);
    container.appendChild(steps);

    this.attachEvents();
    this.update(this.index, false);
  }

  private makeStep(
    icon: string,
    label: string,
    delta: number
  ): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "timeline__step";
    btn.innerHTML = icon;
    btn.setAttribute("aria-label", label);
    btn.title = label;
    btn.addEventListener("click", () => {
      // At the ends the button is aria-disabled rather than disabled, so it
      // still receives the press — and has to decline it here.
      if (btn.getAttribute("aria-disabled") === "true") return;
      const next = this.index + delta;
      this.update(Math.min(this.months.length - 1, Math.max(0, next)), true);
    });
    return btn;
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
    this.readout.textContent = this.formatLabel(ym);
    this.track.setAttribute("aria-valuenow", String(index));
    this.track.setAttribute("aria-valuetext", this.formatLabel(ym));
    // `disabled` would drop the stepper out of the tab ring at the very moment
    // the user's own press reached the end of the record: the browser blurs a
    // control it disables, so focus fell to <body> and the explanation below
    // went with it — unreachable, since Tab skips disabled buttons. Grey it out
    // with `aria-disabled` instead: same announced state, but the button keeps
    // focus and the reason stays where the user just pressed.
    this.prevBtn.setAttribute("aria-disabled", String(index === 0));
    const atRecordEnd = index === this.months.length - 1;
    this.nextBtn.setAttribute("aria-disabled", String(atRecordEnd));
    // A stepper that greys out with no reason reads as a broken control —
    // the end of the scrubber is where "why is there no July?" starts. Say
    // that the record simply stops here, on the control the user just pressed.
    const nextLabel = atRecordEnd
      ? `${this.nextStepLabel} — ${this.formatLabel(ym)} is the newest published`
      : this.nextStepLabel;
    this.nextBtn.setAttribute("aria-label", nextLabel);
    this.nextBtn.title = nextLabel;

    if (emit && changed) this.onChange(index, ym);
  }
}
