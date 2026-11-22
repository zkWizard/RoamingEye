import type { GpRecord } from "./elements";

export type WorkerRequest =
  | { type: "load"; group: string; records: GpRecord[] }
  | { type: "tick"; id: number; timeMs: number; groups: string[] };

export type WorkerResponse =
  | { type: "loaded"; group: string; count: number }
  | { type: "failed"; group: string; message: string }
  | {
      type: "positions";
      id: number;
      timeMs: number;
      samples: Record<string, ArrayBuffer>;
    };
