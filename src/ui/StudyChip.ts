import { ICONS } from "./icons";

/**
 * A small indicator shown while a high-resolution study region is active, with
 * a control to exit it. The timeline itself drives the region's date.
 */
export class StudyChip {
  private readonly nameEl: HTMLElement;

  constructor(
    private readonly container: HTMLElement,
    onClose: () => void
  ) {
    container.classList.add("study-chip");
    container.innerHTML =
      `<span class="study-chip__dot" aria-hidden="true"></span>` +
      `<span class="study-chip__text">Studying ` +
      `<strong class="study-chip__name"></strong> · High-res · scrub the timeline</span>` +
      `<button class="study-chip__close" type="button" aria-label="Exit study region">${ICONS.close}</button>`;

    this.nameEl = container.querySelector(".study-chip__name") as HTMLElement;
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
    this.container.classList.add("is-visible");
  }

  hide(): void {
    this.container.classList.remove("is-visible");
  }
}
