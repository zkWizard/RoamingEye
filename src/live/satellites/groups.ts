/**
 * The six CelesTrak groups the Live menu can turn on.
 *
 * Ids are the GROUP values on
 * https://celestrak.org/NORAD/elements/gp.php
 * The menu, the cache, and the worker all share this list.
 */

export interface SatelliteGroup {
  readonly id: string;
  readonly label: string;
  readonly blurb: string;
  /** CSS color for the points of this class. */
  readonly color: string;
  /** Point size in world units. */
  readonly size: number;
}

export const SATELLITE_GROUPS: readonly SatelliteGroup[] = [
  {
    id: "stations",
    label: "Space stations",
    blurb: "ISS and stations",
    color: "#f5c518",
    size: 0.055,
  },
  {
    id: "starlink",
    label: "Starlink",
    blurb: "Thinned when zoomed out",
    color: "#4aa3ff",
    size: 0.028,
  },
  {
    id: "gps-ops",
    label: "GPS",
    blurb: "Navigation",
    color: "#2fbf71",
    size: 0.042,
  },
  {
    id: "weather",
    label: "Weather satellites",
    blurb: "Weather",
    color: "#ff7a2f",
    size: 0.04,
  },
  {
    id: "resource",
    label: "Imaging satellites",
    blurb: "Earth imaging",
    color: "#a78bfa",
    size: 0.038,
  },
  {
    id: "visual",
    label: "Visible tonight",
    blurb: "Bright passes",
    color: "#ff6b9a",
    size: 0.042,
  },
];

export function satelliteOverlayId(groupId: string): string {
  return `sat-${groupId}`;
}

export function celestrakGroupUrl(groupId: string): string {
  const params = new URLSearchParams({ GROUP: groupId, FORMAT: "json" });
  return `https://celestrak.org/NORAD/elements/gp.php?${params}`;
}

/**
 * Camera distance (Earth radii from the origin) at which the whole disc still
 * fills the view. Starlink drops to every fourth satellite beyond this.
 */
export const WHOLE_EARTH_DISTANCE = 2.2;

export function drawStride(groupId: string, cameraDistance: number): number {
  if (groupId !== "starlink") return 1;
  return cameraDistance >= WHOLE_EARTH_DISTANCE ? 4 : 1;
}

export interface DeviceHints {
  /** Chromium's navigator.deviceMemory, in gigabytes, when the browser sends it. */
  deviceMemoryGb?: number;
  /** A phone or tablet: the primary pointer is coarse. */
  coarsePointer: boolean;
}

/**
 * Phones, and machines that report 2 GB or less, do not draw the full
 * Starlink catalog. A desktop pointer keeps every satellite.
 */
export function isLowTier(hints: DeviceHints): boolean {
  if (hints.coarsePointer) return true;
  return (
    hints.deviceMemoryGb !== undefined &&
    hints.deviceMemoryGb > 0 &&
    hints.deviceMemoryGb <= 2
  );
}

/** How many records of a group to keep. Infinity means the whole feed. */
export function groupCap(groupId: string, lowTier: boolean): number {
  if (!lowTier) return Number.POSITIVE_INFINITY;
  return groupId === "starlink" ? 2500 : 800;
}

export function readDeviceHints(): DeviceHints {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const memory = nav.deviceMemory;
  return {
    deviceMemoryGb: typeof memory === "number" ? memory : undefined,
    coarsePointer:
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: coarse)").matches,
  };
}
