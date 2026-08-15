import { ICONS } from "./icons";

/** How long a toast lingers before dismissing itself. */
const AUTO_HIDE_MS = 8000;

/**
 * A single, dismissible error toast for uncaught failures — a researcher
 * mid-session should see that something broke instead of a silently wedged
 * UI. Only one shows at a time; repeats of the visible message are ignored
 * rather than stacked.
 *
 * The `role="alert"` root stays in the DOM and rendered at all times, and the
 * message box is what gets inserted and removed. A live region hidden with
 * `hidden`/`display: none` is absent from the accessibility tree, so text
 * written into it while hidden changes nothing an assistive technology can
 * observe — the toast would be seen but never heard. Inserting the box into
 * an already-rendered region is the mutation screen readers announce.
 */
export class ErrorToast {
  private readonly root: HTMLDivElement;
  private readonly box: HTMLDivElement;
  private readonly text: HTMLSpanElement;
  private hideTimer: ReturnType<typeof setTimeout> | undefined;
  private currentMessage = "";

  constructor(parent: HTMLElement = document.body) {
    this.root = document.createElement("div");
    this.root.className = "error-toast";
    this.root.setAttribute("role", "alert");

    this.box = document.createElement("div");
    this.box.className = "error-toast__box";

    this.text = document.createElement("span");
    this.text.className = "error-toast__text";

    const close = document.createElement("button");
    close.type = "button";
    close.className = "error-toast__close";
    close.setAttribute("aria-label", "Dismiss");
    close.innerHTML = ICONS.close;
    close.addEventListener("click", () => this.hide());

    this.box.append(this.text, close);
    // The root goes up empty: at rest it has no box, so it paints nothing.
    parent.appendChild(this.root);
  }

  show(message: string): void {
    if (this.box.isConnected && message === this.currentMessage) return;
    this.currentMessage = message;
    this.text.textContent = message;
    this.root.appendChild(this.box);
    clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => this.hide(), AUTO_HIDE_MS);
  }

  hide(): void {
    this.box.remove();
    this.currentMessage = "";
    clearTimeout(this.hideTimer);
  }
}
