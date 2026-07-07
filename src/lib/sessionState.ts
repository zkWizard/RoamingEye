import { LAYERS, type LayerId, type YearMonth } from "./timeline";

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

  if (typeof o.layer === "string" && o.layer in LAYERS) {
    out.layer = o.layer as LayerId;
  }

  if (typeof o.month === "object" && o.month !== null) {
    const m = o.month as Record<string, unknown>;
    const year = Number(m.year);
    const month = Number(m.month);
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

  return out;
}
