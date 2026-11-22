/**
 * Who should see the first-visit welcome. A returning session, a shared
 * link, or a visitor who already closed the welcome goes straight to the
 * view they asked for.
 */

/** Story that plays itself on a first visit. Seasons on the default layer. */
export const WELCOME_STORY_ID = "sahel-monsoon-2024";

/** Set once the visitor moves the timeline themselves. */
export const TIME_HINT_KEY = "roamingeye:time-hint";

export interface WelcomeSignals {
  /** lib/storiesWelcome.ts already recorded a close or a play. */
  welcomed: boolean;
  /** A stored session has a layer, so this browser has been here. */
  hasSessionLayer: boolean;
  /** `location.hash`, with or without the leading `#`. */
  hash: string;
  /** `location.search`, with or without the leading `?`. */
  search: string;
}

function carried(value: string, mark: string): boolean {
  return value.replace(new RegExp(`^${mark}`), "").trim().length > 0;
}

/**
 * True when the page should offer the welcome. A hash or a query string is
 * a shared or deep link, even when this browser has never been here.
 */
export function shouldOfferWelcome(signals: WelcomeSignals): boolean {
  if (signals.welcomed || signals.hasSessionLayer) return false;
  if (carried(signals.hash, "#")) return false;
  if (carried(signals.search, "\\?")) return false;
  return true;
}
