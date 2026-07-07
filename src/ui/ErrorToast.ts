import { ICONS } from "./icons";

/** How long a toast lingers before dismissing itself. */
const AUTO_HIDE_MS = 8000;

/**
 * A single, dismissible error toast for uncaught failures — a researcher
 * mid-session should see that something broke instead of a silently wedged
 * UI. Only one shows at a time; repeats of the visible message are ignored
 * rather than stacked.
 */
export class ErrorToast {
  private readonly root: HTMLDivElement;
  private readonly text: HTMLSpanElement;
  private hideTimer: ReturnType<typeof setTimeout> | undefined;
  private currentMessage = "";

  constructor(parent: HTMLElement = document.body) {
    this.root = document.createElement("div");
    this.root.className = "error-toast";
    this.root.setAttribute("role", "alert");
    this.root.hidden = true;

    this.text = document.createElement("span");
    this.text.className = "error-toast__text";

    const close = document.createElement("button");
    close.type = "button";
    close.className = "error-toast__close";
    close.setAttribute("aria-label", "Dismiss");
    close.innerHTML = ICONS.close;
    close.addEventListener("click", () => this.hide());

    this.root.append(this.text, close);
    parent.appendChild(this.root);
  }

  show(message: string): void {
    if (!this.root.hidden && message === this.currentMessage) return;
    this.currentMessage = message;
    this.text.textContent = message;
    this.root.hidden = false;
    clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => this.hide(), AUTO_HIDE_MS);
  }

  hide(): void {
    this.root.hidden = true;
    this.currentMessage = "";
    clearTimeout(this.hideTimer);
  }
}
