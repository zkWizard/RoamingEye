import type { SatRec } from "satellite.js";
import type { WorkerRequest } from "./messages";
import { propagateGroup, satrecsFromRecords } from "./propagate";

interface WorkerScope {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
}

const scope = self as unknown as WorkerScope;
const loaded = new Map<string, (SatRec | null)[]>();

scope.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  if (message.type === "load") {
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

  const samples: Record<string, ArrayBuffer> = {};
  const transfer: ArrayBuffer[] = [];
  for (const group of message.groups) {
    const satrecs = loaded.get(group);
    if (!satrecs) continue;
    const values = propagateGroup(satrecs, message.timeMs);
    const buffer = values.buffer as ArrayBuffer;
    samples[group] = buffer;
    transfer.push(buffer);
  }
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
