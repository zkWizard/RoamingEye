import type { WebGLRenderer } from "three";
import { LookCompositor } from "./compositor";
import { LOOKS, type LookId } from "./looks";

export interface LookHandle {
  present(draw: (renderer: WebGLRenderer) => void): void;
  dispose(): void;
}

/**
 * The one-tap row in Settings, and the pass behind it. The row is plain
 * buttons: the name of the look is the whole control.
 */
export function mountLooks(options: {
  renderer: WebGLRenderer;
  host: HTMLElement | null;
  initial: LookId;
  onChange: (id: LookId) => void;
}): LookHandle {
  const compositor = new LookCompositor(options.renderer);
  let current = options.initial;
  compositor.setLook(current);
  document.documentElement.dataset.look = current;

  const buttons: HTMLButtonElement[] = [];
  if (options.host) {
    const row = document.createElement("div");
    row.className = "look-row";
    row.setAttribute("role", "group");
    row.setAttribute("aria-label", "Look");
    const label = document.createElement("span");
    label.className = "look-row__label";
    label.textContent = "Look";
    row.append(label);
    for (const look of LOOKS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "look-row__button";
      button.dataset.look = look.id;
      button.textContent = look.label;
      button.setAttribute("aria-pressed", String(look.id === current));
      button.addEventListener("click", () => {
        if (look.id === current) return;
        current = look.id;
        compositor.setLook(current);
        document.documentElement.dataset.look = current;
        for (const other of buttons) {
          other.setAttribute(
            "aria-pressed",
            String(other.dataset.look === current)
          );
        }
        options.onChange(current);
      });
      buttons.push(button);
      row.append(button);
    }
    options.host.prepend(row);
  }

  return {
    present(draw) {
      compositor.present(draw);
    },
    dispose() {
      compositor.dispose();
      delete document.documentElement.dataset.look;
    },
  };
}
