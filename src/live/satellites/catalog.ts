import { loadGroup, type GroupStore } from "./cache";
import { parseGpList, type GpRecord } from "./elements";
import {
  celestrakGroupUrl,
  groupCap,
  isLowTier,
  readDeviceHints,
} from "./groups";
import { openGroupStore } from "./idb";
import type { WorkerResponse } from "./messages";

export interface SatSample {
  timeMs: number;
  /** Lat, lon, altKm, speedKmS, one satellite per four floats. */
  values: Float32Array;
}

interface Pending {
  resolve: (value: number) => void;
  reject: (err: Error) => void;
}

const TICK_MS = 400;

async function fetchGpGroup(group: string): Promise<GpRecord[]> {
  const response = await fetch(celestrakGroupUrl(group));
  if (!response.ok) {
    throw new Error(`CelesTrak ${group} returned ${response.status}`);
  }
  return parseGpList(await response.json());
}

/**
 * One worker and one two-hour cache for every satellite class. Propagation
 * runs off the main thread. The render loop only reads the latest samples.
 */
export class SatelliteCatalog {
  private worker: Worker | null = null;
  private storePromise: Promise<GroupStore> | null = null;
  private readonly records = new Map<string, GpRecord[]>();
  private readonly loading = new Map<string, Promise<GpRecord[]>>();
  private readonly pendingLoads = new Map<string, Pending>();
  private readonly pendingTicks = new Map<
    number,
    { resolve: () => void; reject: (err: Error) => void }
  >();
  private tickId = 0;
  private tickInFlight = false;
  private readonly jobs = new Map<
    number,
    { resolve: (message: WorkerResponse) => void; reject: (err: Error) => void }
  >();
  private readonly visible = new Set<string>();
  private readonly latest = new Map<string, SatSample>();
  private readonly previous = new Map<string, SatSample>();
  private lowTier: boolean | null = null;

  async ensureGroup(groupId: string): Promise<GpRecord[]> {
    const ready = this.records.get(groupId);
    if (ready) return ready;
    const pending = this.loading.get(groupId);
    if (pending) return pending;
    const job = this.fetchAndLoad(groupId);
    this.loading.set(groupId, job);
    try {
      return await job;
    } finally {
      this.loading.delete(groupId);
    }
  }

  hide(groupId: string): void {
    this.visible.delete(groupId);
  }

  /** Ask for a fresh sample when the newest one is older than the tick. */
  noteVisible(groupId: string, now: number): void {
    this.visible.add(groupId);
    if (!this.records.has(groupId) || this.tickInFlight) return;
    let newest = 0;
    for (const id of this.visible) {
      const sample = this.latest.get(id);
      if (sample && sample.timeMs > newest) newest = sample.timeMs;
    }
    if (newest !== 0 && now < newest + TICK_MS) return;
    const groups = [...this.visible].filter((id) => this.records.has(id));
    if (groups.length === 0) return;
    void this.tick(groups, now).catch((err: unknown) => {
      console.warn("RoamingEye: satellite propagation failed", err);
    });
  }

  sample(
    groupId: string
  ): { previous: SatSample | null; current: SatSample } | null {
    const current = this.latest.get(groupId);
    if (!current) return null;
    return { previous: this.previous.get(groupId) ?? null, current };
  }

  paths(
    groupId: string,
    index: number,
    timeMs: number
  ): Promise<{ orbit: Float32Array; ground: Float32Array } | null> {
    return this.job({ type: "paths", group: groupId, index, timeMs }).then(
      (message) => {
        if (message.type !== "paths" || message.orbit.byteLength === 0)
          return null;
        return {
          orbit: new Float32Array(message.orbit),
          ground: new Float32Array(message.ground),
        };
      }
    );
  }

  nextPass(
    groupId: string,
    index: number,
    timeMs: number,
    lat: number,
    lon: number
  ): Promise<{
    startMs: number;
    durationMin: number;
    peakElevationDeg: number;
  } | null> {
    return this.job({
      type: "pass",
      group: groupId,
      index,
      timeMs,
      lat,
      lon,
    }).then((message) => (message.type === "pass" ? message : null));
  }

  private job(message: {
    type: "paths" | "pass";
    group: string;
    index: number;
    timeMs: number;
    lat?: number;
    lon?: number;
  }): Promise<WorkerResponse> {
    const worker = this.ensureWorker();
    const id = ++this.tickId;
    return new Promise((resolve, reject) => {
      this.jobs.set(id, { resolve, reject });
      worker.postMessage({ ...message, id });
    });
  }

  private async fetchAndLoad(groupId: string): Promise<GpRecord[]> {
    const store = await this.store();
    const records = await loadGroup(groupId, {
      now: () => Date.now(),
      store,
      fetchRecords: fetchGpGroup,
    });
    const cap = groupCap(groupId, this.tier());
    const capped = Number.isFinite(cap) ? records.slice(0, cap) : records;
    await this.postLoad(groupId, capped);
    this.records.set(groupId, capped);
    await this.tick([groupId], Date.now());
    return capped;
  }

  private tier(): boolean {
    if (this.lowTier === null) this.lowTier = isLowTier(readDeviceHints());
    return this.lowTier;
  }

  private store(): Promise<GroupStore> {
    return (this.storePromise ??= openGroupStore());
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      this.onWorker(event.data);
    };
    worker.onerror = (event) => {
      const message = event.message || "Satellite worker failed";
      this.failAll(new Error(message));
    };
    this.worker = worker;
    return worker;
  }

  private failAll(err: Error): void {
    for (const pending of this.pendingLoads.values()) pending.reject(err);
    this.pendingLoads.clear();
    for (const pending of this.pendingTicks.values()) pending.reject(err);
    this.pendingTicks.clear();
    for (const pending of this.jobs.values()) pending.reject(err);
    this.jobs.clear();
    this.tickInFlight = false;
  }

  private postLoad(groupId: string, records: GpRecord[]): Promise<number> {
    const worker = this.ensureWorker();
    return new Promise((resolve, reject) => {
      this.pendingLoads.set(groupId, { resolve, reject });
      worker.postMessage({ type: "load", group: groupId, records });
    });
  }

  private tick(groups: string[], timeMs: number): Promise<void> {
    const worker = this.ensureWorker();
    const id = ++this.tickId;
    this.tickInFlight = true;
    return new Promise((resolve, reject) => {
      this.pendingTicks.set(id, { resolve, reject });
      worker.postMessage({ type: "tick", id, timeMs, groups });
    });
  }

  private onWorker(message: WorkerResponse): void {
    if (message.type === "loaded") {
      this.pendingLoads.get(message.group)?.resolve(message.count);
      this.pendingLoads.delete(message.group);
      return;
    }
    if (message.type === "failed") {
      const pending = this.pendingLoads.get(message.group);
      this.pendingLoads.delete(message.group);
      pending?.reject(new Error(message.message));
      return;
    }
    if (
      message.type === "paths" ||
      message.type === "pass" ||
      message.type === "pass-none"
    ) {
      const job = this.jobs.get(message.id);
      this.jobs.delete(message.id);
      job?.resolve(message);
      return;
    }
    if (message.type !== "positions") return;
    for (const [group, buffer] of Object.entries(message.samples)) {
      const values = new Float32Array(buffer);
      const prev = this.latest.get(group);
      if (prev && prev.values.length === values.length)
        this.previous.set(group, prev);
      else this.previous.delete(group);
      this.latest.set(group, { timeMs: message.timeMs, values });
    }
    const pending = this.pendingTicks.get(message.id);
    this.pendingTicks.delete(message.id);
    this.tickInFlight = false;
    pending?.resolve();
  }
}

let catalog: SatelliteCatalog | null = null;

export function satelliteCatalog(): SatelliteCatalog {
  return (catalog ??= new SatelliteCatalog());
}
