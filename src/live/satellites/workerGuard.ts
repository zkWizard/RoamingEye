import { SATELLITE_GROUPS } from "./groups";

/**
 * Chrome reports a dedicated worker's owner as an empty origin. Other
 * engines report the page origin. Any other origin is not our owner.
 */
export function acceptsWorkerOrigin(
  origin: string,
  ownOrigin: string
): boolean {
  return origin === "" || origin === ownOrigin;
}

const BLOCKED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** A CelesTrak group id from our own list, never a message-chosen property. */
export function isAllowedGroup(groupId: string): boolean {
  if (BLOCKED_KEYS.has(groupId)) return false;
  return SATELLITE_GROUPS.some((group) => group.id === groupId);
}

/**
 * Build the position payload. Keys written onto the result come from
 * SATELLITE_GROUPS, not from the message, and the object has no prototype.
 */
export function samplesFromGroups(
  groups: readonly string[],
  take: (groupId: string) => ArrayBuffer | null
): Record<string, ArrayBuffer> {
  const found = new Map<string, ArrayBuffer>();
  for (const groupId of groups) {
    if (!isAllowedGroup(groupId)) continue;
    const buffer = take(groupId);
    if (buffer) found.set(groupId, buffer);
  }
  const samples = Object.create(null) as Record<string, ArrayBuffer>;
  for (const group of SATELLITE_GROUPS) {
    const buffer = found.get(group.id);
    if (!buffer) continue;
    samples[group.id] = buffer;
  }
  return samples;
}
