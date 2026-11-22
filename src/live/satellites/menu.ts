import type { MapOverlay } from "../../overlays/types";

/**
 * Satellite toggles join the Live fold the weather layer already built.
 * If that fold is missing, this creates it above Settings. The buttons
 * themselves stay in this chunk.
 */
export function mountLiveMenu(
  toolbar: HTMLElement,
  overlays: readonly MapOverlay[],
  onToggle: (overlay: MapOverlay, on: boolean) => void,
  isOn: (overlay: MapOverlay) => boolean
): void {
  const body = toolbar.querySelector("#toolbar-body");
  if (!body) return;

  let list = body.querySelector<HTMLElement>(
    ".toolbar__fold--live .toolbar__list"
  );
  if (!list) {
    const fold = document.createElement("details");
    fold.className = "toolbar__fold toolbar__fold--live";
    const summary = document.createElement("summary");
    summary.textContent = "Live";
    list = document.createElement("div");
    list.className = "toolbar__list";
    list.setAttribute("role", "group");
    list.setAttribute("aria-label", "Live");
    fold.append(summary, list);
    const settings = body.querySelector(".toolbar__fold--settings");
    if (settings) body.insertBefore(fold, settings);
    else body.append(fold);
  }
  for (const overlay of overlays) {
    list.append(buildToggle(overlay, onToggle, isOn(overlay)));
  }
}

export function setLiveDetail(overlayId: string, detail: string): void {
  const button = document.querySelector<HTMLButtonElement>(
    `.toolbar__item[data-overlay="${cssEscape(overlayId)}"]`
  );
  if (!button) return;
  const label = button.querySelector(".toolbar__label")?.textContent ?? "";
  let detailEl = button.querySelector(".toolbar__detail");
  if (!detailEl) {
    detailEl = document.createElement("span");
    detailEl.className = "toolbar__detail";
    button.querySelector(".toolbar__text")?.append(detailEl);
  }
  if (detailEl.textContent === detail) return;
  detailEl.textContent = detail;
  button.title = detail ? `${label}: ${detail}` : label;
}

export function setLivePressed(overlayId: string, on: boolean): void {
  document
    .querySelector<HTMLButtonElement>(
      `.toolbar__item[data-overlay="${cssEscape(overlayId)}"]`
    )
    ?.setAttribute("aria-pressed", String(on));
}

function buildToggle(
  overlay: MapOverlay,
  onToggle: (overlay: MapOverlay, on: boolean) => void,
  on: boolean
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "toolbar__item";
  button.dataset.overlay = overlay.id;
  button.title = overlay.detail
    ? `${overlay.label}: ${overlay.detail}`
    : overlay.label;
  button.setAttribute("aria-pressed", String(on));
  const text = overlay.detail
    ? `<span class="toolbar__text"><span class="toolbar__label">${overlay.label}</span><span class="toolbar__detail">${overlay.detail}</span></span>`
    : `<span class="toolbar__text"><span class="toolbar__label">${overlay.label}</span></span>`;
  button.innerHTML = `<span class="toolbar__icon">${overlay.icon}</span>${text}`;
  button.addEventListener("click", () => {
    if (button.dataset.state === "pending") return;
    const next = button.getAttribute("aria-pressed") !== "true";
    button.setAttribute("aria-pressed", String(next));
    onToggle(overlay, next);
  });
  return button;
}

function cssEscape(value: string): string {
  return value.replace(/["\\]/g, "");
}
