import type { GpRecord } from "./elements";
import type { WorkerRequest } from "./messages";
import {
  nextVisiblePass,
  propagateGroup,
  satrecsFromRecords,
  trackPaths,
} from "./propagate";
import type { SatRec } from "../../../node_modules/satellite.js/dist/propagation/SatRec.js";
import { isAllowedGroup, samplesFromGroups } from "./workerGuard";

interface WorkerScope {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
  location: { origin: string };
}

interface LoadedGroup {
  satrecs: (SatRec | null)[];
  records: GpRecord[];
}

const scope = self as unknown as WorkerScope;
const loaded = new Map<string, LoadedGroup>();

scope.onmessage = (event: MessageEvent<WorkerRequest>) => {
  // Chrome reports a dedicated worker's owner as an empty origin. Other
  // engines report the page origin. Any other origin is not our owner.
  // The comparisons stay in this handler so the origin check is local.
  // acceptsWorkerOrigin is the same rule, covered by the unit test.
  const ownOrigin = scope.location.origin;
  if (event.origin !== "" && event.origin !== ownOrigin) {
    scope.postMessage({
      type: "failed",
      group: "",
      message: "Satellite worker rejected an unexpected origin",
    });
    return;
  }

  const message = event.data;
  if (message.type === "load") {
    if (!isAllowedGroup(message.group)) {
      scope.postMessage({
        type: "failed",
        group: message.group,
        message: "Unknown satellite group",
      });
      return;
    }
    try {
      loaded.set(message.group, {
        satrecs: satrecsFromRecords(message.records),
        records: message.records,
      });
      scope.postMessage({
        type: "loaded",
        group: message.group,
        count: message.records.length,
      });
    } catch (err) {
      scope.postMessage({
        type: "failed",
        group: message.group,
        message: err instanceof Error ? err.message : "Could not read elements",
      });
    }
    return;
  }

  if (message.type === "paths") {
    const group = isAllowedGroup(message.group)
      ? loaded.get(message.group)
      : undefined;
    const record = group?.records[message.index];
    const paths = record ? trackPaths(record, message.timeMs) : null;
    if (!paths) {
      scope.postMessage({
        type: "paths",
        id: message.id,
        orbit: new ArrayBuffer(0),
        ground: new ArrayBuffer(0),
      });
      return;
    }
    const orbit = paths.orbit.buffer as ArrayBuffer;
    const ground = paths.ground.buffer as ArrayBuffer;
    scope.postMessage({ type: "paths", id: message.id, orbit, ground }, [
      orbit,
      ground,
    ]);
    return;
  }

  if (message.type === "pass") {
    const group = isAllowedGroup(message.group)
      ? loaded.get(message.group)
      : undefined;
    const record = group?.records[message.index];
    const pass = record
      ? nextVisiblePass(record, message.timeMs, message.lat, message.lon)
      : null;
    if (!pass) {
      scope.postMessage({ type: "pass-none", id: message.id });
      return;
    }
    scope.postMessage({ type: "pass", id: message.id, ...pass });
    return;
  }

  const transfer: ArrayBuffer[] = [];
  const samples = samplesFromGroups(message.groups, (groupId) => {
    const group = loaded.get(groupId);
    if (!group) return null;
    const values = propagateGroup(group.satrecs, message.timeMs);
    const buffer = values.buffer as ArrayBuffer;
    transfer.push(buffer);
    return buffer;
  });
  scope.postMessage(
    {
      type: "positions",
      id: message.id,
      timeMs: message.timeMs,
      samples,
    },
    transfer
  );
};
