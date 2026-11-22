/** NORAD catalog ids in a shared link. Parsing stays out of the entry chunk. */
const NORAD_MAX = 999999;

export function trackFromHash(hash: string): number | undefined {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(hash.replace(/^#/, ""));
  } catch {
    return undefined;
  }
  const value = Number(params.get("track"));
  if (!Number.isInteger(value) || value < 1 || value > NORAD_MAX)
    return undefined;
  return value;
}

/**
 * Put or drop `track=` on the current hash without touching the other fields
 * main already wrote. Returns true when the hash changed.
 */
export function writeTrackHash(noradId: number | undefined): boolean {
  const params = new URLSearchParams(location.hash.replace(/^#/, ""));
  const next = noradId === undefined ? null : String(noradId);
  const current = params.get("track");
  if ((current ?? null) === next) return false;
  if (next) params.set("track", next);
  else params.delete("track");
  const query = params.toString();
  const nextHash = query ? `#${query}` : "";
  if (location.hash === nextHash) return false;
  history.replaceState(
    null,
    "",
    `${location.pathname}${location.search}${nextHash}`
  );
  return true;
}
