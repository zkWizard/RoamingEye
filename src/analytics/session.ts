/**
 * Activation events. `first_*` fire once per browser tab session.
 * `compare` and `share` fire on every use. `activated` fires once, when the
 * visitor has done a search or a scrub and at least one other action.
 */

export const SESSION_KEY = "re.ax";

const SEARCH = 1;
const SCRUB = 2;
const PROBE = 4;
const ANCHOR = 8;
const ACTIVATED = 16;

const FIRST_EVENT = {
  search: "first_search",
  scrub: "first_scrub",
  probe: "first_probe",
} as const;

export interface SessionState {
  readonly sent: number;
  readonly actions: number;
}

export function emptySession(): SessionState {
  return { sent: 0, actions: 0 };
}

/** Restore a session flag. A corrupt value starts a fresh session. */
export function parseSession(raw: string | null): SessionState {
  if (raw === null) return emptySession();
  const match = /^(\d+)\.(\d+)$/.exec(raw);
  if (!match) return emptySession();
  const sent = Number(match[1]);
  const actions = Number(match[2]);
  if (!Number.isSafeInteger(sent) || !Number.isSafeInteger(actions)) {
    return emptySession();
  }
  if (sent < 0 || sent > 31 || actions < 0) return emptySession();
  return { sent, actions: Math.min(actions, 1_000_000) };
}

export function formatSession(state: SessionState): string {
  return `${state.sent}.${state.actions}`;
}

/**
 * Fold one visitor action into the session.
 *
 * A search, scrub, or probe emits its `first_*` event the first time only.
 * Compare and share emit their own name every time. `activated` is appended
 * once the session contains a search or a scrub and at least two actions.
 * A repeated search or scrub counts as another action.
 */
export function applyAction(
  state: SessionState,
  action: string
): { readonly state: SessionState; readonly events: readonly string[] } {
  if (
    action !== "search" &&
    action !== "scrub" &&
    action !== "probe" &&
    action !== "compare" &&
    action !== "share"
  ) {
    return { state, events: [] };
  }

  const events: string[] = [];
  let sent = state.sent;
  const actions = Math.min(state.actions + 1, 1_000_000);

  if (action === "search" || action === "scrub" || action === "probe") {
    const bit =
      action === "search" ? SEARCH : action === "scrub" ? SCRUB : PROBE;
    if ((sent & bit) === 0) {
      sent |= bit;
      events.push(FIRST_EVENT[action]);
    }
  } else {
    events.push(action);
  }

  if (action === "search" || action === "scrub") sent |= ANCHOR;
  if ((sent & ACTIVATED) === 0 && (sent & ANCHOR) !== 0 && actions >= 2) {
    sent |= ACTIVATED;
    events.push("activated");
  }

  return { state: { sent, actions }, events };
}
