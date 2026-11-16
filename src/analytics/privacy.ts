/** Browser signals that mean "do not track". */
export interface PrivacySignals {
  doNotTrack: string | null;
  globalPrivacyControl: boolean;
}

/**
 * True when the visitor has opted out via Do Not Track or Global Privacy
 * Control. `1` and `yes` are the historical DNT values that mean opt out.
 */
export function trackingOptOut(signals: PrivacySignals): boolean {
  const dnt = signals.doNotTrack;
  return dnt === "1" || dnt === "yes" || signals.globalPrivacyControl;
}

/** Read DNT and GPC from the browser. Missing APIs count as no signal. */
export function readPrivacySignals(): PrivacySignals {
  if (typeof navigator === "undefined") {
    return { doNotTrack: null, globalPrivacyControl: false };
  }
  const nav = navigator as Navigator & {
    globalPrivacyControl?: boolean;
    msDoNotTrack?: string;
  };
  const win = globalThis as { doNotTrack?: string | null };
  const raw = nav.doNotTrack ?? win.doNotTrack ?? nav.msDoNotTrack ?? null;
  return {
    doNotTrack: raw === undefined || raw === "" ? null : raw,
    globalPrivacyControl: nav.globalPrivacyControl === true,
  };
}
