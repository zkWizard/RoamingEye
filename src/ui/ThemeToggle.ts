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
    // After the attribute, so `--bg` already resolves to the new palette.
    syncThemeColor();

    // The name is the ACTION — the theme this press moves you to, which is
    // also the tooltip and what the icon draws — so it already carries the
    // current theme truthfully, and there is deliberately no `aria-pressed`
    // beside it. Keyed to `theme === "light"`, it contradicted the name it sat
    // on: in light theme the control read "Switch to dark theme, pressed".
    // The app's other toggles take the other branch (static name +
    // `aria-pressed`); this one can't, because its name is its visible label.
    // See e2e/theme-toggle-state.spec.ts.
    const target = nextTheme(this.theme);
    this.button.innerHTML = this.theme === "dark" ? SUN_ICON : MOON_ICON;
    this.button.setAttribute("aria-label", `Switch to ${target} theme`);
    this.button.title = `Switch to ${target} theme`;

    this.onChange?.(this.theme);
  }
}

/**
 * Point the browser's own chrome — a phone's address bar, the desktop tab strip
 * — at the theme the user is actually in.
 *
 * index.html ships two `theme-color` tags keyed to `prefers-color-scheme` so the
 * bar is right on the very first paint, before any script runs. That guess only
 * holds while the OS and the app agree: pick light on a dark-preferring phone
 * and the bar stays near-black above a pale page. It is the one piece of UA
 * chrome `color-scheme` can't reach, because it is painted outside the page.
 *
 * So once the real theme is known we take ownership: collapse those tags to a
 * single one and colour it from `--bg`, the same custom property that paints the
 * page — the bar then follows the stylesheet instead of drifting from it.
 */
function syncThemeColor(): void {
  const bg = getComputedStyle(document.documentElement)
    .getPropertyValue("--bg")
    .trim();
  // No stylesheet resolved yet: leave the static tags alone rather than
  // blanking the colour outright.
  if (!bg) return;

  const tags = [
    ...document.head.querySelectorAll<HTMLMetaElement>(
      'meta[name="theme-color"]'
    ),
  ];
  // The browser honours the FIRST tag whose media matches, so the media-keyed
  // pair would outrank a new one on document order alone — keep one, drop the
  // rest, and strip the media query off the survivor.
  const owned =
    tags.shift() ?? document.head.appendChild(document.createElement("meta"));
  for (const stale of tags) stale.remove();

  owned.name = "theme-color";
  owned.removeAttribute("media");
  owned.content = bg;
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
