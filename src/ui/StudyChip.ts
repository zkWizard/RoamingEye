import { ICONS } from "./icons";

/**
 * A small indicator shown while a high-resolution study region is active. Shows
 * the place and the resolved scene (instrument · date), with an exit control.
 * The timeline drives the region's month.
 */
export class StudyChip {
  private readonly nameEl: HTMLElement;
  private readonly detailEl: HTMLElement;

  constructor(
    private readonly container: HTMLElement,
    onClose: () => void
  ) {
    container.classList.add("study-chip");
    container.innerHTML =
      `<span class="study-chip__dot" aria-hidden="true"></span>` +
      `<span class="study-chip__text">Studying ` +
      `<strong class="study-chip__name"></strong> · ` +
      `<span class="study-chip__detail"></span></span>` +
      `<button class="study-chip__close" type="button" aria-label="Exit study region">${ICONS.close}</button>`;

    this.nameEl = container.querySelector(".study-chip__name") as HTMLElement;
    this.detailEl = container.querySelector(
      ".study-chip__detail"
    ) as HTMLElement;
    const close = container.querySelector(
      ".study-chip__close"
    ) as HTMLButtonElement;
    close.addEventListener("click", () => {
      onClose();
      this.hide();
    });
    this.hide();
  }

  show(name: string): void {
    this.nameEl.textContent = name;
    this.detailEl.textContent = "high-res · scrub the timeline";
    this.container.classList.add("is-visible");
  }

  /** Update the trailing detail (e.g. resolved instrument + date). */
  setDetail(text: string): void {
    this.detailEl.textContent = text;
  }

  hide(): void {
    this.container.classList.remove("is-visible");
  }
}
