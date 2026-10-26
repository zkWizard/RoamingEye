import { LAYERS, type LayerId, type YearMonth } from "./timeline";
import type { SearchAction } from "./search/provider";

/**
 * Cross-visit session persistence: the working context (layer, month,
 * enabled overlays) a researcher left off with. Pure serialize/parse (see
 * sessionState.test.ts); main.ts owns the localStorage wiring, and a URL
 * hash always outranks the stored session.
 */

export const SESSION_STORAGE_KEY = "roamingeye:session";

export interface SessionState {
  layer?: LayerId;
  month?: YearMonth;
  /** Overlay ids toggled on. Present (even empty) = authoritative — an
   * explicitly disabled default overlay stays off. */
  overlays?: string[];
  /** Searches this browser has chosen, newest first. */
  recent?: RecentSearch[];
}

/** One chosen search, small enough to keep in localStorage. */
export interface RecentSearch {
  title: string;
  subtitle?: string;
  action: SearchAction;
}

export function serializeSession(state: SessionState): string {
  return JSON.stringify(state);
}

/**
 * Parse a stored session, tolerantly: anything malformed is dropped
 * field-by-field so a corrupt or stale entry degrades to defaults rather
 * than breaking boot.
 */
export function parseSession(raw: unknown): SessionState {
  if (typeof raw !== "string" || raw === "") return {};
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    return {};
  }
  const o = json as Record<string, unknown>;
  const out: SessionState = {};

  // Object.hasOwn, not `in`: `in` walks the prototype chain, so a corrupted
  // session with layer "toString" would pass — same bug class as viewState.
  if (typeof o.layer === "string" && Object.hasOwn(LAYERS, o.layer)) {
    out.layer = o.layer as LayerId;
  }

  if (typeof o.month === "object" && o.month !== null) {
    const m = o.month as Record<string, unknown>;
    // Direct typeof guard rather than Number(): exotic objects (null
    // prototype, symbols) make Number() throw — found by the fuzz suite.
    const year = typeof m.year === "number" ? m.year : NaN;
    const month = typeof m.month === "number" ? m.month : NaN;
    if (
      Number.isInteger(year) &&
      year >= 1900 &&
      year <= 2200 &&
      Number.isInteger(month) &&
      month >= 1 &&
      month <= 12
    ) {
      out.month = { year, month };
    }
  }

  if (Array.isArray(o.overlays)) {
    out.overlays = o.overlays
      .filter((v): v is string => typeof v === "string")
      .slice(0, 32);
  }

  if (Array.isArray(o.recent)) {
    const recent = o.recent
      .map(parseRecent)
      .filter((entry): entry is RecentSearch => entry !== null)
      .slice(0, 8);
    if (recent.length > 0) out.recent = recent;
  }

  return out;
}

function parseRecent(value: unknown): RecentSearch | null {
  if (typeof value !== "object" || value === null) return null;
  const entry = value as Record<string, unknown>;
  if (typeof entry.title !== "string" || entry.title === "") return null;
  const action = parseAction(entry.action);
  if (!action) return null;
  const subtitle =
    typeof entry.subtitle === "string" && entry.subtitle !== ""
      ? entry.subtitle
      : undefined;
  return { title: entry.title.slice(0, 160), subtitle, action };
}

function parseAction(value: unknown): SearchAction | null {
  if (typeof value !== "object" || value === null) return null;
  const action = value as Record<string, unknown>;
  if (action.type === "story" && typeof action.storyId === "string") {
    return { type: "story", storyId: action.storyId };
  }
  if (action.type === "layer" && typeof action.layerId === "string") {
    if (!Object.hasOwn(LAYERS, action.layerId)) return null;
    return { type: "layer", layerId: action.layerId };
  }
  if (action.type === "month") {
    const year = typeof action.year === "number" ? action.year : NaN;
    const month = typeof action.month === "number" ? action.month : NaN;
    if (
      !Number.isInteger(year) ||
      year < 1900 ||
      year > 2200 ||
      !Number.isInteger(month) ||
      month < 1 ||
      month > 12
    ) {
      return null;
    }
    return { type: "month", year, month };
  }
  if (action.type === "hotspot") {
    const lat = typeof action.lat === "number" ? action.lat : NaN;
    const lon = typeof action.lon === "number" ? action.lon : NaN;
    if (typeof action.name !== "string" || action.name === "") return null;
    if (
      typeof action.layerId !== "string" ||
      !Object.hasOwn(LAYERS, action.layerId)
    ) {
      return null;
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    return {
      type: "hotspot",
      name: action.name,
      layerId: action.layerId,
      lat,
      lon,
    };
  }
  if (action.type === "place") {
    const lat = typeof action.lat === "number" ? action.lat : NaN;
    const lon = typeof action.lon === "number" ? action.lon : NaN;
    if (typeof action.name !== "string" || action.name === "") return null;
    if (typeof action.subtitle !== "string") return null;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    return {
      type: "place",
      name: action.name,
      subtitle: action.subtitle,
      lat,
      lon,
      boundingBox: parseBox(action.boundingBox),
      geometry: null,
    };
  }
  return null;
}

function parseBox(value: unknown): [number, number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 4) return null;
  const nums = value.map((item) => (typeof item === "number" ? item : NaN));
  if (nums.some((item) => !Number.isFinite(item))) return null;
  return nums as [number, number, number, number];
}
