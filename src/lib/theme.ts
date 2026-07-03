/**
 * Theme model for the light/dark toggle.
 *
 * Pure, DOM-free logic: resolving which theme to show on load and flipping
 * between them. Kept dependency-free so it's deterministic to unit-test (see
 * theme.test.ts). The DOM/localStorage wiring lives in ui/ThemeToggle.ts.
 */

export type Theme = "light" | "dark";

/** localStorage key holding the user's explicit choice, if any. */
export const THEME_STORAGE_KEY = "roamingeye:theme";

/** Narrow an unknown value (e.g. a localStorage string) to a Theme. */
export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

/**
 * Decide the theme to show on load. An explicit saved choice wins; otherwise
 * fall back to the OS preference. Dark is the app's native look, so it's the
 * default when the OS preference is unknown or not "light".
 *
 * @param stored      Raw value read from storage (may be null/garbage).
 * @param prefersDark Whether the OS prefers a dark color scheme.
 */
export function resolveInitialTheme(
  stored: string | null,
  prefersDark: boolean
): Theme {
  if (isTheme(stored)) return stored;
  return prefersDark ? "dark" : "light";
}

/** The theme you'd switch to from `theme`. */
export function nextTheme(theme: Theme): Theme {
  return theme === "dark" ? "light" : "dark";
}
