import { ICONS } from "./icons";

/** How long a toast lingers before dismissing itself. */
const AUTO_HIDE_MS = 8000;

/**
 * A single, dismissible error toast for uncaught failures — a researcher
 * mid-session should see that something broke instead of a silently wedged
 * UI. Only one shows at a time; repeats of the visible message are ignored
 * rather than stacked.
 *
 * The auto-hide is suspended while the reader is inside the toast. The box is
 * removed from the DOM to dismiss it, so a timer that fires while focus sits on
 * the close button deletes the focused node and drops focus to <body> — the
 * reader loses their place in a 30-tab document because a clock ran out. It is
 * also the one control here, so the timer would be pulling the target out from
 * under the only gesture that reaches it. Focus entering the box pauses the
 * clock; focus leaving restarts it, so an untouched toast still clears itself.
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
  /** Last element focused OUTSIDE the box — where dismissal hands focus back. */
  private lastOutside: HTMLElement | null = null;

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

    // Remember where the reader was before they stepped into the toast, so
    // dismissing it can hand focus back there instead of to <body>. Capture
    // phase on the document: focusin does not bubble from every source, and
    // this has to see focus land anywhere on the page, not just in the box.
    document.addEventListener(
      "focusin",
      (e) => {
        const target = e.target;
        if (target instanceof HTMLElement && !this.box.contains(target)) {
          this.lastOutside = target;
        }
      },
      true
    );

    // Suspend the clock while the reader is inside. Without this the timer
    // deletes the node focus is sitting on.
    this.box.addEventListener("focusin", () => clearTimeout(this.hideTimer));
    this.box.addEventListener("focusout", (e) => {
      // Still inside (or the box is already gone): nothing to restart.
      if (this.box.contains(e.relatedTarget as Node) || !this.box.isConnected) {
        return;
      }
      clearTimeout(this.hideTimer);
      this.hideTimer = setTimeout(() => this.hide(), AUTO_HIDE_MS);
    });
    // The root goes up empty: at rest it has no box, so it paints nothing.
    parent.appendChild(this.root);
  }

  show(message: string): void {
    if (this.box.isConnected && message === this.currentMessage) return;
    this.currentMessage = message;
    this.text.textContent = message;
    this.root.appendChild(this.box);
    clearTimeout(this.hideTimer);
    // A second failure while the reader is inside must not re-arm the clock
    // they are standing on; focusout arms it when they leave.
    if (this.box.contains(document.activeElement)) return;
    this.hideTimer = setTimeout(() => this.hide(), AUTO_HIDE_MS);
  }

  hide(): void {
    // Removing a focused node sends focus to <body>, which in a document this
    // deep is indistinguishable from losing your place. Hand it back instead.
    const heldFocus = this.box.contains(document.activeElement);
    this.box.remove();
    this.currentMessage = "";
    clearTimeout(this.hideTimer);
    if (heldFocus && this.lastOutside?.isConnected) this.lastOutside.focus();
  }
}
