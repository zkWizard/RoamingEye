/**
 * Same-page test sink. When set before boot, events are delivered here even
 * though the shipped config is off. It does not load a provider script.
 */
interface AnalyticsHost {
  __reAnalytics?: (
    event: string,
    props?: Readonly<Record<string, string>>
  ) => void;
}

interface Queued {
  readonly type: "pageview" | "track" | "record";
  readonly name?: string;
  readonly props?: Readonly<Record<string, string>>;
}

type Runtime = typeof import("./runtime");

const queue: Queued[] = [];
let runtime: Runtime | undefined;
let loading: Promise<void> | undefined;

function testHook(): AnalyticsHost["__reAnalytics"] {
  const host = globalThis as AnalyticsHost;
  return typeof host.__reAnalytics === "function"
    ? host.__reAnalytics
    : undefined;
}

function armed(): boolean {
  return __ANALYTICS_ENABLED__ || testHook() !== undefined;
}

function send(message: Queued): void {
  try {
    if (!armed()) return;
    if (runtime) {
      runtime.handle(message);
      return;
    }
    queue.push(message);
    loading ??= import("./runtime")
      .then((mod) => {
        runtime = mod;
        mod.start(testHook());
        for (const item of queue.splice(0, queue.length)) mod.handle(item);
      })
      .catch(() => {
        queue.length = 0;
      });
  } catch {
    // Analytics must never affect the globe.
  }
}

/** Send one pageview. No-op while analytics is off and no test sink is set. */
export function pageview(): void {
  send({ type: "pageview" });
}

/**
 * Send one event. Props are optional and must be short tokens.
 * With Cloudflare this reaches the test sink only; the beacon has no events.
 */
export function track(
  event: string,
  props?: Readonly<Record<string, string>>
): void {
  send({ type: "track", name: event, props });
}

/**
 * Record a visitor action (`search`, `scrub`, `probe`, `compare`, `share`).
 * The module decides which stable event names to emit, including `activated`.
 */
export function record(action: string): void {
  send({ type: "record", name: action });
}
