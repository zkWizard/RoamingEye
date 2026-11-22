import type { SatRec } from "satellite.js";
import type { WorkerRequest } from "./messages";
import { propagateGroup, satrecsFromRecords } from "./propagate";
import { isAllowedGroup, samplesFromGroups } from "./workerGuard";

interface WorkerScope {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
  location: { origin: string };
}

const scope = self as unknown as WorkerScope;
const loaded = new Map<string, (SatRec | null)[]>();

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
      loaded.set(message.group, satrecsFromRecords(message.records));
      const count = loaded.get(message.group)?.length ?? 0;
      scope.postMessage({ type: "loaded", group: message.group, count });
    } catch (err) {
      scope.postMessage({
        type: "failed",
        group: message.group,
        message: err instanceof Error ? err.message : "Could not read elements",
      });
    }
    return;
  }

  const transfer: ArrayBuffer[] = [];
  const samples = samplesFromGroups(message.groups, (groupId) => {
    const satrecs = loaded.get(groupId);
    if (!satrecs) return null;
    const values = propagateGroup(satrecs, message.timeMs);
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
