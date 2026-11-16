import { ANALYTICS } from "./config";
import { parseAnalytics, type AnalyticsConfig } from "./parse";
import {
  cloudflareBeacon,
  goatcounterScript,
  outbound,
  plausibleScript,
  sanitizeProps,
  type ScriptTag,
} from "./providers";
import { readPrivacySignals, trackingOptOut } from "./privacy";
import {
  applyAction,
  emptySession,
  formatSession,
  parseSession,
  SESSION_KEY,
  type SessionState,
} from "./session";

export interface AnalyticsMessage {
  readonly type: "pageview" | "track" | "record";
  readonly name?: string;
  readonly props?: Readonly<Record<string, string>>;
}

type Hook = (event: string, props?: Readonly<Record<string, string>>) => void;

type PlausibleFn = (
  name: string,
  options?: { u?: string; props?: Record<string, string> }
) => void;

interface GoatCounterApi {
  count?: (vars: { path?: string; title?: string; event?: boolean }) => void;
}

interface AnalyticsWindow {
  goatcounter?: GoatCounterApi;
  plausible?: PlausibleFn & { q?: unknown[][] };
}

let started = false;
let optedOut = false;
let target: AnalyticsConfig = { provider: "off" };
let hook: Hook | undefined;
let session: SessionState = emptySession();
let providerState: "idle" | "loading" | "ready" | "failed" = "idle";
let beaconInserted = false;
const waiters: Array<() => void> = [];

/** Prepare privacy, the provider, and the session flag. Safe to call once. */
export function start(nextHook: Hook | undefined): void {
  if (started) return;
  started = true;
  hook = nextHook;
  try {
    target = parseAnalytics(ANALYTICS);
    optedOut = trackingOptOut(readPrivacySignals());
    if (!optedOut) session = readSession();
  } catch {
    optedOut = true;
  }
}

/** Handle one queued call. Failures stay inside analytics. */
export function handle(message: AnalyticsMessage): void {
  if (!started || optedOut) return;
  try {
    if (message.type === "pageview") {
      deliver("pageview");
      return;
    }
    if (message.type === "track") {
      if (message.name) deliver(message.name, sanitizeProps(message.props));
      return;
    }
    if (message.type === "record" && message.name) {
      const next = applyAction(session, message.name);
      session = next.state;
      writeSession(session);
      for (const event of next.events) deliver(event);
    }
  } catch {
    // A broken analytics path must leave the globe alone.
  }
}

function deliver(event: string, props?: Record<string, string>): void {
  try {
    hook?.(event, props);
  } catch {
    // The test sink is best-effort.
  }
  if (target.provider === "off") return;
  const message = outbound(
    target.provider,
    event,
    location.pathname,
    location.origin,
    props
  );
  if (message.kind === "drop") return;
  if (message.kind === "beacon") {
    if (target.provider === "cloudflare") insertBeacon(target.site);
    return;
  }
  enqueue(() => {
    if (message.kind === "goatcounter") {
      analyticsWindow().goatcounter?.count?.(message.vars);
      return;
    }
    if (message.kind === "plausible") {
      analyticsWindow().plausible?.(message.name, message.options);
    }
  });
}

function enqueue(send: () => void): void {
  if (providerState === "failed") return;
  if (providerState === "ready") {
    try {
      send();
    } catch {
      // Provider scripts can throw. The app does not.
    }
    return;
  }
  if (waiters.length < 32) waiters.push(send);
  if (providerState === "loading") return;
  providerState = "loading";
  void loadProvider().then((ok) => {
    providerState = ok ? "ready" : "failed";
    const queued = waiters.splice(0);
    if (!ok) return;
    for (const fire of queued) {
      try {
        fire();
      } catch {
        // Keep going through the rest of the queue.
      }
    }
  });
}

async function loadProvider(): Promise<boolean> {
  try {
    if (target.provider === "goatcounter") {
      const tag = goatcounterScript(target.site, localHost());
      const ok = await insertScript(tag);
      return ok && typeof analyticsWindow().goatcounter?.count === "function";
    }
    if (target.provider === "plausible") {
      installPlausibleStub();
      return insertScript(plausibleScript(target.site));
    }
    return false;
  } catch {
    return false;
  }
}

function insertBeacon(token: string): void {
  if (beaconInserted) return;
  beaconInserted = true;
  void insertScript(cloudflareBeacon(token));
}

function insertScript(tag: ScriptTag): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const script = document.createElement("script");
      script.src = tag.src;
      script.async = true;
      script.defer = true;
      for (const [key, value] of Object.entries(tag.attrs)) {
        script.setAttribute(key, value);
      }
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      (document.head ?? document.documentElement).appendChild(script);
    } catch {
      resolve(false);
    }
  });
}

function installPlausibleStub(): void {
  const host = analyticsWindow();
  if (typeof host.plausible === "function") return;
  const queued: unknown[][] = [];
  const stub = ((
    name: string,
    options?: { u?: string; props?: Record<string, string> }
  ) => {
    queued.push([name, options]);
  }) as PlausibleFn & { q: unknown[][] };
  stub.q = queued;
  host.plausible = stub;
}

function analyticsWindow(): AnalyticsWindow {
  return window as Window & AnalyticsWindow;
}

function localHost(): boolean {
  const host = location.hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

function readSession(): SessionState {
  try {
    return parseSession(sessionStorage.getItem(SESSION_KEY));
  } catch {
    return emptySession();
  }
}

function writeSession(state: SessionState): void {
  try {
    sessionStorage.setItem(SESSION_KEY, formatSession(state));
  } catch {
    // Private mode can reject storage. The in-memory session still works.
  }
}
