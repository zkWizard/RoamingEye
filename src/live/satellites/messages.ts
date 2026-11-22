import type { GpRecord } from "./elements";

export type WorkerRequest =
  | { type: "load"; group: string; records: GpRecord[] }
  | { type: "tick"; id: number; timeMs: number; groups: string[] }
  | { type: "paths"; id: number; group: string; index: number; timeMs: number }
  | {
      type: "pass";
      id: number;
      group: string;
      index: number;
      timeMs: number;
      lat: number;
      lon: number;
    };

export type WorkerResponse =
  | { type: "loaded"; group: string; count: number }
  | { type: "failed"; group: string; message: string }
  | {
      type: "positions";
      id: number;
      timeMs: number;
      samples: Record<string, ArrayBuffer>;
    }
  | {
      type: "paths";
      id: number;
      orbit: ArrayBuffer;
      ground: ArrayBuffer;
    }
  | {
      type: "pass";
      id: number;
      startMs: number;
      durationMin: number;
      peakElevationDeg: number;
    }
  | { type: "pass-none"; id: number };
