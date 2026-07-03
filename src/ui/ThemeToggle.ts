import {
  resolveInitialTheme,
  nextTheme,
  THEME_STORAGE_KEY,
  type Theme,
} from "../lib/theme";

/**
 * A single icon button that toggles the page between light and dark themes.
 *
 * It owns the `data-theme` attribute on <html> (which drives the CSS variables
 * in style.css), persists the user's choice to localStorage, and notifies the
 * caller via `onChange` — including once on construction, so the scene can sync
 * its WebGL backdrop to the initial theme.
 */

// Inline icons so there's no extra network request. The button shows the
// theme you'd switch *to*: a sun while dark, a moon while light.
const SUN_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>`;
const MOON_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;

export class ThemeToggle {
  private theme: Theme;
  private readonly button: HTMLButtonElement;
  private readonly onChange?: (theme: Theme) => void;

  constructor(container: HTMLElement, onChange?: (theme: Theme) => void) {
    this.onChange = onChange;

    const prefersDark =
      window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true;
    this.theme = resolveInitialTheme(readStored(), prefersDark);

    this.button = document.createElement("button");
    this.button.type = "button";
    this.button.className = "theme-toggle";
    this.button.addEventListener("click", () => this.toggle());
    container.appendChild(this.button);

    this.apply(); // sync <html>, button UI, and notify the caller of the initial theme
  }

  private toggle(): void {
    this.theme = nextTheme(this.theme);
    writeStored(this.theme);
    this.apply();
  }

  /** Reflect the current theme everywhere: <html>, the button, and the caller. */
  private apply(): void {
    document.documentElement.setAttribute("data-theme", this.theme);

    const target = nextTheme(this.theme);
    this.button.innerHTML = this.theme === "dark" ? SUN_ICON : MOON_ICON;
    this.button.setAttribute("aria-label", `Switch to ${target} theme`);
    this.button.title = `Switch to ${target} theme`;
    this.button.setAttribute("aria-pressed", String(this.theme === "light"));

    this.onChange?.(this.theme);
  }
}

// localStorage can throw (private mode, disabled cookies); never let that break
// the toggle — fall back to no persistence.
function readStored(): string | null {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStored(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* ignore — persistence is best-effort */
  }
}
